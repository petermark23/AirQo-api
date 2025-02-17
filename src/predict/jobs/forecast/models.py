import concurrent.futures
from datetime import datetime, timedelta
from google.oauth2 import service_account
import pandas as pd
import requests

from config import configuration


class Events:
    def __init__(self):
        super().__init__()

    events_tips_url = f"{configuration.AIRQO_API_BASE_URL}devices/tips/"

    # TODO: Remove this and use Events API only
    @staticmethod
    def fetch_bigquery_data():
        """gets data from the bigquery table"""

        credentials = service_account.Credentials.from_service_account_file(configuration.CREDENTIALS)
        query = f"""
        SELECT DISTINCT timestamp, site_id, device_number,pm2_5_calibrated_value FROM `{configuration.GOOGLE_CLOUD_PROJECT_ID}.averaged_data.hourly_device_measurements` where DATE(timestamp) >= DATE_SUB(CURRENT_DATE(), INTERVAL 1 MONTH) and tenant = 'airqo' ORDER BY timestamp 
        """
        df = pd.read_gbq(query, project_id=configuration.GOOGLE_CLOUD_PROJECT_ID, credentials=credentials)
        df.rename(columns={'timestamp': 'created_at', 'pm2_5_calibrated_value': 'pm2_5'}, inplace=True)
        return df

    @staticmethod
    def fetch_health_tips():
        "fetch health tips from the api"
        response = requests.get(Events.events_tips_url, headers={"authorization": configuration.AIRQO_API_AUTH_TOKEN})
        if response.status_code == 200:
            result = response.json()
            return result["tips"]
