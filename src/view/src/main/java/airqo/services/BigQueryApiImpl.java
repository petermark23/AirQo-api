package airqo.services;

import airqo.models.Frequency;
import airqo.models.Insight;
import com.google.cloud.bigquery.*;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.UUID;

import static airqo.config.Constants.dateTimeFormat;

@Slf4j
@Service
public class BigQueryApiImpl implements BigQueryApi {

	@Value("${hourly-data-table}")
	private String hourlyDataTable;

	@Value("${daily-data-table}")
	private String dailyDataTable;

	@Value("${reference-monitor-data-table}")
	private String referenceMonitorDataTable;

	@Value("${forecast-data-table}")
	private String forecastDataTable;

	@Override
	public List<Insight> getInsights(Date startDateTime, Date endDateTime, String siteId) {
		List<Insight> insights = new ArrayList<>();
		final SimpleDateFormat simpleDateFormat = new SimpleDateFormat(dateTimeFormat);

		try {
			BigQuery bigquery = BigQueryOptions.getDefaultInstance().getService();
			String hourlyDataQuery = String.format(
				"SELECT '%s' as frequency, timestamp, site_id, pm10, pm2_5, false as forecast " +
					"FROM `%s` " +
					"WHERE site_id = '%s' and timestamp >= '%s' and timestamp <= '%s' " +
					"and pm2_5 is not null and pm10 is not null and timestamp is not null",
				Frequency.HOURLY, hourlyDataTable, siteId, simpleDateFormat.format(startDateTime),
				simpleDateFormat.format(endDateTime));

			String dailyDataQuery = String.format(
				"SELECT '%s' as frequency, timestamp, site_id, pm10, pm2_5, false as forecast " +
					"FROM `%s` " +
					"WHERE site_id = '%s' and timestamp >= '%s' and timestamp <= '%s' " +
					"and pm2_5 is not null and pm10 is not null and timestamp is not null",
				Frequency.DAILY, dailyDataTable, siteId, simpleDateFormat.format(startDateTime),
				simpleDateFormat.format(endDateTime));

			String referenceMonitorDataQuery = String.format(
				"SELECT '%s' as frequency, timestamp, site_id, pm10, pm2_5, false as forecast " +
					"FROM `%s` " +
					"WHERE site_id = '%s' and timestamp >= '%s' and timestamp <= '%s' " +
					"and pm2_5 is not null and timestamp is not null",
				Frequency.HOURLY, referenceMonitorDataTable, siteId, simpleDateFormat.format(startDateTime),
				simpleDateFormat.format(endDateTime));

			String forecastDataQuery = String.format(
				"SELECT '%s' as frequency, timestamp, site_id, pm10, pm2_5, true as forecast " +
					"FROM `%s` " +
					"WHERE site_id = '%s' and timestamp >= '%s' and timestamp <= '%s' " +
					"and pm2_5 is not null and timestamp is not null",
				Frequency.HOURLY, forecastDataTable, siteId, simpleDateFormat.format(new Date()),
				simpleDateFormat.format(endDateTime));

			String query = String.format(" %s UNION ALL %s UNION ALL %s UNION ALL %s",
				hourlyDataQuery, dailyDataQuery, forecastDataQuery, referenceMonitorDataQuery);

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

					Insight insight = new Insight();
					insight.setPm2_5(row.get("pm2_5").getDoubleValue());
					insight.setPm10(row.get("pm10").getDoubleValue());
					insight.setFrequency(Frequency.valueOf(row.get("frequency").getStringValue()));
					insight.setSiteId(row.get("site_id").getStringValue());
					insight.setForecast(row.get("forecast").getBooleanValue());
					insight.setTime(new Date(Double.valueOf(row.get("timestamp").getLongValue()).intValue()));
					insight.setAvailable(true);

					insights.add(insight);
				} catch (NumberFormatException e) {
					log.debug(e.toString());
				}

			}
		} catch (InterruptedException e) {
			throw new RuntimeException(e);
		}

		return insights;
	}
}
