package airqo.services;

import airqo.models.Insight;

import java.util.Date;
import java.util.List;

public interface InsightsService {
	List<Insight> getInsights(Date startDateTime, Date endDateTime, String siteId, int utcOffSet);
}
