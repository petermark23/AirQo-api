package airqo.services;

import airqo.models.Frequency;
import airqo.models.Insight;
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
				insight.setEmpty(true);
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

	private List<Insight> formatInsightsTime(List<Insight> insights, int utcOffSet, Frequency frequency) {

		final SimpleDateFormat simpleDateFormat = new SimpleDateFormat(frequency.dateTimeFormat());

		return insights.stream().peek(insight -> {

			DateTime dateTime = new DateTime(insight.getTime());
			if (utcOffSet < 0) {
				dateTime = dateTime.minusHours(utcOffSet);
			} else {
				dateTime = dateTime.plusHours(utcOffSet);
			}

			insight.setTime(dateTime.toDate());

			String newDate = simpleDateFormat.format(insight.getTime());
			try {
				insight.setTime(simpleDateFormat.parse(newDate));
			} catch (ParseException ignored) {
			}
		}).collect(Collectors.toList());
	}

	@Override
	@SentrySpan
	@Cacheable(value = "appInsightsCache", cacheNames = {"appInsightsCache"}, unless = "#result.size() <= 0")
	public List<Insight> getInsights(Date startDateTime, Date endDateTime, String siteId, int utcOffSet) {

		List<Insight> insights = this.bigQueryApi.getInsights(startDateTime, endDateTime, siteId);

		// Daily insights
		List<Insight> dailyInsights = insights.stream().filter(insight ->
				(insight.getFrequency() == Frequency.DAILY && !insight.getForecast()))
			.collect(Collectors.toList());

		// Hourly insights
		List<Insight> hourlyInsights = insights.stream().filter(insight ->
				(insight.getFrequency() == Frequency.HOURLY && !insight.getForecast()))
			.collect(Collectors.toList());

		// Forecast insights
		List<Insight> forecastInsights = insights.stream().filter(Insight::getForecast)
			.collect(Collectors.toList());
		forecastInsights.removeIf(insight -> insight.getTime().before(new Date()));

		// Insights
		hourlyInsights.addAll(forecastInsights);
		hourlyInsights = formatInsightsTime(hourlyInsights, utcOffSet, Frequency.HOURLY);
		dailyInsights = formatInsightsTime(dailyInsights, utcOffSet, Frequency.DAILY);

		fillMissingInsights(hourlyInsights, startDateTime, endDateTime, siteId, Frequency.HOURLY);
		fillMissingInsights(dailyInsights, startDateTime, endDateTime, siteId, Frequency.DAILY);

		hourlyInsights.addAll(dailyInsights);

		return new HashSet<>(hourlyInsights).stream().peek(insight -> {
			insight.setPm10(Double.parseDouble(new DecimalFormat("#.##").format(insight.getPm10())));
			insight.setPm2_5(Double.parseDouble(new DecimalFormat("#.##").format(insight.getPm2_5())));
		}).sorted(Comparator.comparing(Insight::getTime)).collect(Collectors.toList());
	}
}
