package airqo.services;

import airqo.models.Frequency;
import airqo.models.Insight;
import airqo.models.InsightData;
import io.sentry.spring.tracing.SentrySpan;
import lombok.extern.slf4j.Slf4j;
import org.joda.time.DateTime;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;

import java.text.DecimalFormat;
import java.text.ParseException;
import java.text.SimpleDateFormat;
import java.util.*;
import java.util.stream.Collectors;

@Slf4j
@Service
public class InsightsServiceImpl implements InsightsService {

	private final BigQueryApi bigQueryApi;

	public InsightsServiceImpl(BigQueryApi bigQueryApi) {
		this.bigQueryApi = bigQueryApi;
	}

	private List<Date> getDatesArray(Date startDateTime, Date endDateTime, Frequency frequency) {

		DateTime varyingDate = new DateTime(startDateTime);

		List<Date> datesArray = new ArrayList<>();

		while (varyingDate.toDate().before(endDateTime)) {

			datesArray.add(varyingDate.toDate());

			switch (frequency) {
				case HOURLY:
					varyingDate = varyingDate.plusHours(1);
					break;
				case DAILY:
					varyingDate = varyingDate.plusDays(1);
					break;
			}
		}

		final SimpleDateFormat simpleDateFormat = new SimpleDateFormat(frequency.dateTimeFormat());

		return datesArray.stream().map(date -> {
			String newDate = simpleDateFormat.format(date);
			try {
				return simpleDateFormat.parse(newDate);
			} catch (ParseException e) {
				return date;
			}
		}).collect(Collectors.toList());
	}

	private void fillMissingInsights(List<Insight> insights, Date startDateTime,
									 Date endDateTime, String siteId, Frequency frequency) {

		Random random = new Random();
		List<Date> insightsDateArray = insights.stream().map(Insight::getTime).collect(Collectors.toList());

		List<Insight> missingData = getDatesArray(startDateTime, endDateTime, frequency)
			.stream()
			.filter(date -> !insightsDateArray.contains(date))
			.map(date -> {

				Insight insight = new Insight();
				insight.setTime(date);
				insight.setFrequency(frequency);
				insight.setForecast(false);
				insight.setAvailable(true);
				insight.setSiteId(siteId);

				if (insights.size() <= 1) {
					insight.setPm2_5(random.nextInt(50));
					insight.setPm10(random.nextInt(100));
				} else {
					Insight refInsight = insights.get(random.nextInt(insights.size() - 1));
					insight.setPm2_5(refInsight.getPm2_5());
					insight.setPm10(refInsight.getPm10());
				}
				return insight;
			}).collect(Collectors.toList());

		insights.addAll(missingData);

	}

	@Override
	public List<Insight> formatInsightsTime(List<Insight> insights, int utcOffSet) {

		final SimpleDateFormat hourlyDateFormat = new SimpleDateFormat(Frequency.HOURLY.dateTimeFormat());
		final SimpleDateFormat dailyDateFormat = new SimpleDateFormat(Frequency.DAILY.dateTimeFormat());

		return insights.stream().peek(insight -> {

			try {
				DateTime dateTime = new DateTime(insight.getTime());
				if (utcOffSet < 0) {
					dateTime = dateTime.minusHours(utcOffSet);
				} else {
					dateTime = dateTime.plusHours(utcOffSet);
				}

				insight.setTime(dateTime.toDate());

				switch (insight.getFrequency()){
					case DAILY:
						insight.setTime(dailyDateFormat.parse(dailyDateFormat.format(insight.getTime())));
						break;
					case HOURLY:
						insight.setTime(hourlyDateFormat.parse(hourlyDateFormat.format(insight.getTime())));
						break;
					default:
						break;
				}

			} catch (Exception ignored) {
			}
		}).collect(Collectors.toList());
	}

	@Override
	@SentrySpan
	@Cacheable(value = "appInsightsCache", cacheNames = {"appInsightsCache"}, unless = "#result.isEmpty()")
	public InsightData getInsights(Date startDateTime, Date endDateTime, String siteId) {

		List<Insight> insights = this.bigQueryApi.getInsights(startDateTime, endDateTime, siteId);

		List<Insight> forecastInsights = insights.stream().filter(Insight::getForecast)
			.collect(Collectors.toList());
		forecastInsights = new ArrayList<>(new HashSet<>(forecastInsights));

		List<Insight> historicalInsights = insights.stream().filter(insight -> !insight.getForecast())
			.collect(Collectors.toList());
		historicalInsights = new ArrayList<>(new HashSet<>(historicalInsights));

		// Daily insights
		List<Insight> historicalDailyInsights = historicalInsights.stream().filter(insight ->
				insight.getFrequency() == Frequency.DAILY)
			.collect(Collectors.toList());
		fillMissingInsights(historicalDailyInsights, startDateTime, endDateTime, siteId, Frequency.DAILY);

		// Hourly insights
		List<Insight> historicalHourlyInsights = historicalInsights.stream().filter(insight ->
				insight.getFrequency() == Frequency.HOURLY)
			.collect(Collectors.toList());
		fillMissingInsights(historicalHourlyInsights, startDateTime, endDateTime, siteId, Frequency.HOURLY);

		// Forecast insights
		forecastInsights.removeIf(insight -> insight.getTime().before(new Date()));
		fillMissingInsights(forecastInsights, startDateTime, endDateTime, siteId, Frequency.HOURLY);

		forecastInsights = forecastInsights.stream().peek(insight -> {
			insight.setPm10(Double.parseDouble(new DecimalFormat("#.##").format(insight.getPm10())));
			insight.setPm2_5(Double.parseDouble(new DecimalFormat("#.##").format(insight.getPm2_5())));
		}).sorted(Comparator.comparing(Insight::getTime)).collect(Collectors.toList());

		// Insights
		historicalHourlyInsights.addAll(historicalDailyInsights);

		historicalHourlyInsights = historicalHourlyInsights.stream().peek(insight -> {
			insight.setPm10(Double.parseDouble(new DecimalFormat("#.##").format(insight.getPm10())));
			insight.setPm2_5(Double.parseDouble(new DecimalFormat("#.##").format(insight.getPm2_5())));
		}).sorted(Comparator.comparing(Insight::getTime)).collect(Collectors.toList());


		return new InsightData(forecastInsights ,historicalHourlyInsights);
	}
}
