from config import connect_mongo


class Events:
    def __init__(self, tenant):
        self.tenant = tenant

    def get_events(self, start_date, end_date):
        tenant = self.tenant
        db = connect_mongo(tenant)
        return db.events.aggregate([
            {
                "$match": {
                    "values.time": {
                        "$gte": start_date,
                        "$lt": end_date
                    }
                }
            },
            {
                "$unwind": "values"
            },
            {
                "$replaceRoot": {"newRoot": "$values"}
            },
            {
                "$project": {
                    "pm2_5": 1,
                    "pm10": 1,
                    "no2": 1
                }
            }
        ])


class Exceedances:
    def __init__(self, tenant):
        self.tenant = tenant

    def get_exceedance(self, site_name, days):
        tenant = self.tenant
        db = connect_mongo(tenant)
        results = list(db.exceedanaces.find(
            {'site_name': site_name}, {'_id': 0}).sort([('$natural', -1)]).limit(days))
        return results

    def save_exceedance(self, records):
        tenant = self.tenant
        db = connect_mongo(tenant)
        return db.exceedances(records)


class Sites:
    def __init__(self, tenant):
        self.tenant = tenant

    def get_sites(self, id):
        tenant = self.tenant
        db = connect_mongo(tenant)
        results = list(db.exceedances.find(
            {'_id': id}, {'_id': 0}.sort([('$natural', -1)])))
        return results
