import ast

import traceback

import pandas as pd
from bigquery_api import BigQueryApi
from commons import Utils


class DataProcessor:
    def __init__(self):
        self.big_query_api = BigQueryApi()

    def process_purple_air_data(self, msg):

        try:

            value = msg.value
            value_dict = value.decode("UTF-8")
            value_data = ast.literal_eval(ast.literal_eval(value_dict))

            dataframe = pd.DataFrame(
                columns=value_data.get("fields"), data=value_data.get("data")
            )
            dataframe["timestamp"] = value_data.get("data_time_stamp")
            dataframe["timestamp"] = pd.to_datetime(dataframe["timestamp"], unit="s")

            dataframe.rename(
                columns={
                    "sensor_index": "device_number",
                    "name": "device_id",
                    "pm1.0": "pm10_raw_value",
                    "pm2.5": "pm2_5_raw_value",
                },
                inplace=True,
            )

            columns = self.big_query_api.get_columns(
                self.big_query_api.raw_measurements_table
            )

            dataframe = Utils.populate_missing_columns(data=dataframe, cols=columns)

            print(dataframe.columns)
            print(dataframe.head())

        except Exception as ex:
            traceback.print_exc()
            print(ex)
