package airqo.controllers;

import airqo.models.ApiResponseBody;
import airqo.models.Insight;
import airqo.models.InsightData;
import airqo.services.InsightsService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Date;
import java.util.List;

import static airqo.config.Constants.dateTimeFormat;

@Slf4j
@RestController
@RequestMapping("measurements")
public class MeasurementController {

	private final InsightsService insightsService;

	@Autowired
	public MeasurementController(InsightsService insightsService) {
		this.insightsService = insightsService;
	}

	@GetMapping("/app/insights")
	public ResponseEntity<ApiResponseBody> getInsights(@RequestParam() @DateTimeFormat(pattern = dateTimeFormat) Date startDateTime,
													   @RequestParam() @DateTimeFormat(pattern = dateTimeFormat) Date endDateTime,
													   @RequestParam(required = false) Integer utcOffset,
													   @RequestParam() String siteId) {

		if(utcOffset == null){
			utcOffset = 0;
		}

		InsightData insights = insightsService.getInsights(startDateTime, endDateTime, siteId);
		List<Insight> forecast = insightsService.formatInsightsTime(insights.getForecast(), utcOffset);
		List<Insight>  historical = insightsService.formatInsightsTime(insights.getHistorical(), utcOffset);

		ApiResponseBody apiResponseBody = new ApiResponseBody("Operation Successful", new InsightData(forecast, historical));
		return new ResponseEntity<>(apiResponseBody, new HttpHeaders(), HttpStatus.OK);
	}

}
