package airqo.services;

import airqo.models.Frequency;
import airqo.models.Insight;
import com.google.cloud.bigquery.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.UUID;

@Service
public class BigQueryApiImpl implements BigQueryApi {

	@Value("${hourly-device-measurements-table}")
	private String hourlyMeasurementsTable;

	@Value("${daily-device-measurements-table}")
	private String dailyMeasurementsTable;

	@Override
	public List<Insight> getInsights(Date startDateTime, Date endDateTime, String siteId, Frequency frequency) {
		List<Insight> insights = new ArrayList<>();
		final SimpleDateFormat simpleDateFormat = new SimpleDateFormat(frequency.dateTimeFormat());

		String table;
		switch (frequency) {
			case DAILY:
				table = dailyMeasurementsTable;
				break;
			case HOURLY:
				table = hourlyMeasurementsTable;
				break;
			default:
				table = "";
		}

		try {
			BigQuery bigquery = BigQueryOptions.getDefaultInstance().getService();
			String query = String.format("SELECT timestamp, site_id, pm10, pm2_5 " +
					"FROM `%s` " +
					"WHERE site_id = '%s' and timestamp >= '%s' and timestamp <= '%s' " +
					"and pm2_5 is not null and pm10 is not null",
				table, siteId, simpleDateFormat.format(startDateTime),
				simpleDateFormat.format(endDateTime));

			QueryJobConfiguration queryConfig =
				QueryJobConfiguration.newBuilder(query)
					.setUseLegacySql(false)
					.build();

			JobId jobId = JobId.of(UUID.randomUUID().toString());
			Job queryJob = bigquery.create(JobInfo.newBuilder(queryConfig).setJobId(jobId).build());

			queryJob = queryJob.waitFor();

			if (queryJob == null) {
				throw new RuntimeException("Job no longer exists");
			} else if (queryJob.getStatus().getError() != null) {
				throw new RuntimeException(queryJob.getStatus().getError().toString());
			}

			TableResult result = queryJob.getQueryResults();

			for (FieldValueList row : result.iterateAll()) {

				try {
					Date time = new Date((long) Double.valueOf(row.get("timestamp").getStringValue()).intValue() * 1000);

					Insight insight = new Insight();
					insight.setPm2_5(row.get("pm2_5").getDoubleValue());
					insight.setPm10(row.get("pm10").getDoubleValue());
					insight.setTime(time);
					insight.setEmpty(false);
					insight.setFrequency(frequency);
					insight.setForecast(false);
					insight.setSiteId(row.get("site_id").getStringValue());

					insights.add(insight);
				} catch (NumberFormatException ignored) {
				}

			}
		} catch (InterruptedException e) {
			throw new RuntimeException(e);
		}

		return insights;
	}
}
