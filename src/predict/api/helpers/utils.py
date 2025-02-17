from datetime import datetime, timedelta

import pandas as pd
from dotenv import load_dotenv
from flask import request, jsonify
from google.cloud import bigquery

from app import cache
from config.constants import connect_mongo, Config
from models.predict import get_forecasts

load_dotenv()
db = connect_mongo()


def get_all_gp_predictions():
    """
    returns pm 2.5 predictions for all airqloud
    """

    today = datetime.today()
    query = {"created_at": {"$gt": today - timedelta(minutes=60)}}
    projection = {'_id': 0,
                  'latitude': 1,
                  'longitude': 1,
                  'predicted_value': 1,
                  'variance': 1,
                  'interval': 1,
                  'airqloud': 1,
                  'created_at': 1,
                  'airqloud_id': 1,
                  'values': 1}
    records = list(db.gp_predictions.find(query, projection))
    return records


def get_gp_predictions(airqloud):
    """
    returns pm 2.5 predictions for a particular airqloud
    """
    if airqloud is None:
        records = get_all_gp_predictions()
    else:
        query = {'airqloud': airqloud}
        projection = {'_id': 0,
                      'latitude': 1,
                      'longitude': 1,
                      'predicted_value': 1,
                      'variance': 1,
                      'interval': 1,
                      'airqloud': 1,
                      'created_at': 1,
                      'airqloud_id': 1,
                      'values': 1}
        records = list(db.gp_predictions.find(query, projection))
    return records


def geo_coordinates_cache_key():
    key = 'geo_coordinates:' + str(round(float(request.args.get('latitude')), 6)) + ':' + str(round(float(request.args.get('longitude')), 6)) + ':' + str(request.args.get('distance_in_metres'))
    return key


@cache.cached(timeout=3600, key_prefix=geo_coordinates_cache_key)
def get_predictions_by_geo_coordinates(latitude: float, longitude: float, distance_in_metres: int) -> dict:

    client = bigquery.Client()

    query = f"SELECT pm2_5, timestamp, pm2_5_confidence_interval " \
            f"FROM `{Config.BIGQUERY_MEASUREMENTS_PREDICTIONS}` " \
            f"WHERE ST_DISTANCE(location, ST_GEOGPOINT({longitude}, {latitude})) <= {distance_in_metres} " \
            f"ORDER BY pm2_5_confidence_interval " \
            f"LIMIT 1"
    dataframe = client.query(query=query).result().to_dataframe()

    if dataframe.empty:
        return {}

    dataframe["timestamp"] = dataframe["timestamp"].apply(pd.to_datetime)
    dataframe.drop_duplicates(keep="first", inplace=True)

    data = dataframe.to_dict("records")[0]

    return data


def get_gp_predictions_id(aq_id):
    """
    returns pm 2.5 predictions for a particular airqloud
    """

    query = {'airqloud_id': aq_id}
    projection = {'_id': 0, 'latitude': 1, 'longitude': 1, 'predicted_value': 1, 'variance': 1, 'interval': 1,
                  'airqloud': 1, 'created_at': 1, 'airqloud_id': 1}
    records = list(db.gp_predictions.find(query, projection))
    return records


def get_forecasts_helper(db_name):
    """
    Helper function to get forecasts for a given site_id and db_name
    """
    if request.method == 'GET':
        site_id = request.args.get('site_id')
        if site_id is None or not isinstance(site_id, str):
            return jsonify({"message": "Please specify a site_id", "success": False}), 400
        if len(site_id) != 24:
            return jsonify({"message": "Please enter a valid site_id", "success": False}), 400
        result = get_forecasts(site_id, db_name)
        if result:
            response = result
        else:
            response = {
                "message": "forecasts for this site are not available", "success": False}
        data = jsonify(response)
        return data, 200
    else:
        return jsonify({"message": "Invalid request method", "success": False}), 400


if __name__ == '__main__':
    print('main')
