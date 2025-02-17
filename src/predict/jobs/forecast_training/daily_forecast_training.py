import warnings

import mlflow
import mlflow.sklearn
import pandas as pd
from lightgbm import LGBMRegressor, early_stopping
from sklearn.metrics import mean_squared_error

from config import configuration, environment
from transform import fetch_bigquery_data
from utils import upload_trained_model_to_gcs

warnings.filterwarnings("ignore")

mlflow.set_tracking_uri(configuration.MLFLOW_TRACKING_URI)
mlflow.set_experiment(experiment_name=f"daily_forecast_{environment}")

print(f'mlflow server uri: {mlflow.get_tracking_uri()}')


def preprocess_forecast_data():
    print('preprocess_forecast_data started.....')
    forecast_data = fetch_bigquery_data()
    forecast_data['created_at'] = pd.to_datetime(forecast_data['created_at'], format='%Y-%m-%d')
    forecast_data['device_number'] = forecast_data['device_number'].astype(str)
    forecast_data = forecast_data.groupby(
        ['device_number']).resample('D', on='created_at').mean(numeric_only=True)
    forecast_data = forecast_data.reset_index()
    forecast_data['device_number'] = forecast_data['device_number'].astype(int)
    print('preprocess_forecast_data completed.....')
    return forecast_data


def initialise_training_constants():
    train_model_now = True
    target_col = 'pm2_5'

    forecast_data = preprocess_forecast_data()

    if train_model_now:
        train = preprocess_df(forecast_data, target_col)
        clf = train_model(train)

        upload_trained_model_to_gcs(
            clf,
            configuration.GOOGLE_CLOUD_PROJECT_ID,
            configuration.AIRQO_PREDICT_BUCKET,
            'daily_forecast_model.pkl')

        print(clf)


def train_model(train):
    """
    Perform the actual training
    """
    print('feature selection started.....')
    features = [c for c in train.columns if c not in ["created_at", "pm2_5"]]
    print(features)
    target_col = "pm2_5"
    train_data, test_data = pd.DataFrame(), pd.DataFrame()

    for device_number in train['device_number'].unique():
        device_df = train[train['device_number'] == device_number]
        device_df = device_df.sort_values(by='created_at')
        months = device_df['created_at'].dt.month.unique()
        train_months = months[:9]
        test_months = months[9:]
        train_df = device_df[device_df['created_at'].dt.month.isin(train_months)]
        test_df = device_df[device_df['created_at'].dt.month.isin(test_months)]
        train_data = pd.concat([train_data, train_df])
        test_data = pd.concat([test_data, test_df])

    train_data['device_number'] = train_data['device_number'].astype(int)
    test_data['device_number'] = test_data['device_number'].astype(int)
    train_data.drop(columns=['created_at'], axis=1, inplace=True)
    test_data.drop(columns=['created_at'], axis=1, inplace=True)

    train_target, test_target = train_data[target_col], test_data[target_col]
    with mlflow.start_run():
        print("Model training started.....")
        n_estimators = 5000
        learning_rate = 0.05
        colsample_bytree = 0.4
        reg_alpha = 0
        reg_lambda = 1
        max_depth = 1
        random_state = 1

        clf = LGBMRegressor(
            n_estimators=n_estimators,
            learning_rate=learning_rate,
            colsample_bytree=colsample_bytree,
            reg_alpha=reg_alpha,
            reg_lambda=reg_lambda,
            max_depth=max_depth,
            random_state=random_state)

        clf.fit(train_data[features], train_target, eval_set=[(test_data[features], test_target)],
                callbacks=[early_stopping(stopping_rounds=150)], verbose=50,
                eval_metric='rmse')
        print('Model training completed.....')

        # Log parameters
        mlflow.log_param("n_estimators", n_estimators)
        mlflow.log_param("learning_rate", learning_rate)
        mlflow.log_param("colsample_bytree", colsample_bytree)
        mlflow.log_param("reg_alpha", reg_alpha)
        mlflow.log_param("reg_lamba", reg_lambda)
        mlflow.log_param("max_depth", max_depth)
        mlflow.log_param("random_state", random_state)

        # Log model
        mlflow.sklearn.log_model(
            sk_model=clf,
            artifact_path="daily_forecast_model",
            registered_model_name=f"LGBM_daily_forecast_model_{environment}"
        )

        # model validation
        print("Being model validation.....")

        val_preds = clf.predict(test_data[features])
        rmse_val = mean_squared_error(test_data[target_col], val_preds) ** 0.5

        print("Model validation completed.....")
        print(f'Validation RMSE is {rmse_val}')

        # Log metrics
        mlflow.log_metric("VAL_RMSE", rmse_val)

        best_iter = clf.best_iteration_
        clf = LGBMRegressor(n_estimators=best_iter, learning_rate=0.05, colsample_bytree=0.4, reg_alpha=2, reg_lambda=1,
                            max_depth=-1, random_state=1)
        train['device_number'] = train['device_number'].astype(int)
        clf.fit(train[features], train[target_col])

    return clf


def get_lag_features(df_tmp, TARGET_COL):
    df_tmp = df_tmp.sort_values(by=['device_number', 'created_at'])

    # rolling features
    shifts = [1, 2]
    for s in shifts:
        df_tmp[f'pm2_5_last_{s}_day'] = df_tmp.groupby(['device_number'])[TARGET_COL].shift(s)

    # lag features
    shifts = [3, 7, 14, 30]
    functions = ['mean', 'std', 'max', 'min']
    for s in shifts:
        for f in functions:
            df_tmp[f'pm2_5_{f}_{s}_day'] = df_tmp.groupby(['device_number'])[TARGET_COL].shift(1).rolling(s).agg(f)

    return df_tmp


def get_other_features(df_tmp):
    attributes = ['year', 'month', 'day', 'dayofweek']
    for a in attributes:
        df_tmp[a] = df_tmp['created_at'].dt.__getattribute__(a)
    df_tmp['week'] = df_tmp['created_at'].dt.isocalendar().week.astype(int)
    return df_tmp


def preprocess_df(df_tmp, target_column):
    df_tmp = df_tmp.dropna()
    df_tmp = get_lag_features(df_tmp, target_column)
    df_tmp = get_other_features(df_tmp)

    return df_tmp


if __name__ == '__main__':
    initialise_training_constants()
