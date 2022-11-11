package airqo.services;

import airqo.models.Frequency;
import airqo.models.Insight;
import lombok.extern.slf4j.Slf4j;
import org.joda.time.DateTime;
import org.joda.time.DateTimeZone;
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

		DateTime varyingDateTime = new DateTime(startDateTime);

		List<Date> datesArray = new ArrayList<>();

		while (varyingDateTime.toDate().before(endDateTime)) {

			datesArray.add(varyingDateTime.toDate());

			if (frequency == Frequency.HOURLY) {
				varyingDateTime = varyingDateTime.plusHours(1);
			} else {
				varyingDateTime = varyingDateTime.plusDays(1);
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

	private List<Insight> fillMissingInsights(List<Insight> insights, Date startDateTime,
											  Date endDateTime, String siteId, Frequency frequency) {

		List<Date> datesArray = getDatesArray(startDateTime, endDateTime, frequency);
		List<Date> insightsDatesArray = insights.stream().map(Insight::getTime).collect(Collectors.toList());

		Random random = new Random();

		for (Date date : datesArray) {
			if (!insightsDatesArray.contains(date)) {

				Insight emptyInsight = new Insight();
				if (insights.size() <= 1) {
					emptyInsight.setPm2_5(random.nextInt(50));
					emptyInsight.setPm10(random.nextInt(100));
				} else {
					emptyInsight = insights.get(random.nextInt(insights.size() - 1));
				}

				Insight insight = new Insight();
				insight.setTime(date);
				insight.setFrequency(frequency);
				insight.setForecast(false);
				insight.setEmpty(true);
				insight.setSiteId(siteId);
				insight.setPm2_5(emptyInsight.getPm2_5());
				insight.setPm10(emptyInsight.getPm10());
				insights.add(insight);
			}
		}

		return insights;
	}

	private List<Insight> formatInsightsTime(List<Insight> insights, int utcOffSet, Frequency frequency) {

		final SimpleDateFormat simpleDateFormat = new SimpleDateFormat(frequency.dateTimeFormat());

		return insights.stream().peek(insight -> {

			DateTime dateTime = new DateTime(insight.getTime());
			if (utcOffSet < 0) {
				dateTime = dateTime.minusHours(utcOffSet);
			} else {
				dateTime = dateTime.plusDays(utcOffSet);
			}

			insight.setTime(dateTime.toDate());

			String newDate = simpleDateFormat.format(insight.getTime());
			try {
				insight.setTime(simpleDateFormat.parse(newDate));
			} catch (ParseException ignored) {
			}
		}).collect(Collectors.toList());
	}

	private List<Insight> getHourlyInsights(Date startDateTime, String siteId, int utcOffSet) {

		List<Insight> insights = this.bigQueryApi.getInsights(startDateTime, new Date(), siteId, Frequency.HOURLY);

		return formatInsightsTime(insights, utcOffSet, Frequency.HOURLY);
	}

	private List<Insight> getDailyInsights(Date startDateTime, Date endDateTime, String siteId, int utcOffSet) {

		List<Insight> insights = new ArrayList<>();

		Insight insight = new Insight();
		insight.setSiteId(siteId);
		insight.setEmpty(false);
		insight.setForecast(false);
		insight.setPm2_5(23);
		insight.setPm10(40);
		insight.setFrequency(Frequency.DAILY);
		insight.setTime(new Date());

		insights.add(insight);

		insights = formatInsightsTime(insights, utcOffSet, Frequency.DAILY);

		return fillMissingInsights(insights, startDateTime, endDateTime, siteId, Frequency.DAILY);
	}

	private List<Insight> getForecastInsights(String siteId, int utcOffSet) {

		Date now = new DateTime(DateTimeZone.UTC).toDate();
		List<Insight> insights = new ArrayList<>();

		return formatInsightsTime(insights, utcOffSet, Frequency.HOURLY);
	}

	@Override
	public List<Insight> getInsights(Date startDateTime, Date endDateTime, String siteId, int utcOffSet) {

		List<Insight> hourlyInsights = this.getHourlyInsights(startDateTime, siteId, utcOffSet);
		List<Insight> dailyInsights = this.getDailyInsights(startDateTime, endDateTime, siteId, utcOffSet);
		List<Insight> forecastInsights = this.getForecastInsights(siteId, utcOffSet);

		hourlyInsights.addAll(forecastInsights);
		fillMissingInsights(hourlyInsights, startDateTime, endDateTime, siteId, Frequency.HOURLY);

		hourlyInsights.addAll(dailyInsights);

		return new HashSet<>(hourlyInsights).stream().peek(insight -> {
			insight.setPm10(Double.parseDouble(new DecimalFormat("#.##").format(insight.getPm10())));
			insight.setPm2_5(Double.parseDouble(new DecimalFormat("#.##").format(insight.getPm2_5())));
		}).sorted(Comparator.comparing(Insight::getTime)).collect(Collectors.toList());
	}
}
