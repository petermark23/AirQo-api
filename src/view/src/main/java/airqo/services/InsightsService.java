package airqo.services;

import airqo.models.Insight;
import airqo.models.InsightData;

import java.util.Date;
import java.util.List;

public interface InsightsService {
	InsightData getInsights(Date startDateTime, Date endDateTime, String siteId);

	List<Insight> formatInsightsData(List<Insight> insights, int utcOffSet);
}
