package airqo.controllers;

import airqo.models.ApiResponseBody;
import airqo.models.Insight;
import airqo.services.InsightsService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Profile;
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
@Profile({"api"})
@RestController
@RequestMapping("mobile-app")
public class MobileAppController {

	private final InsightsService insightsService;

	@Autowired
	public MobileAppController(InsightsService insightsService) {
		this.insightsService = insightsService;
	}

	@Deprecated
	@GetMapping("/insights")
	public ResponseEntity<ApiResponseBody> getInsights(@RequestParam() @DateTimeFormat(pattern = dateTimeFormat) Date startDateTime,
													   @RequestParam() @DateTimeFormat(pattern = dateTimeFormat) Date endDateTime,
													   @RequestParam() int utcOffset,
													   @RequestParam() String siteId) {
		List<Insight> insights = insightsService.getInsights(startDateTime, endDateTime, siteId, utcOffset);

		ApiResponseBody apiResponseBody = new ApiResponseBody("Operation Successful", insights);
		return new ResponseEntity<>(apiResponseBody, new HttpHeaders(), HttpStatus.OK);
	}

}
