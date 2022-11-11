package airqo.services;

import airqo.models.Frequency;
import airqo.models.Insight;

import java.util.Date;
import java.util.List;

public interface BigQueryApi {
	List<Insight> getInsights(Date startDateTime, Date endDateTime, String siteId, Frequency frequency);

}
