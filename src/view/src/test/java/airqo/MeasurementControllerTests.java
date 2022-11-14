package airqo;

import airqo.models.Frequency;
import airqo.models.Insight;
import airqo.models.InsightData;
import airqo.services.InsightsService;
import lombok.extern.slf4j.Slf4j;
import org.joda.time.DateTime;
import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.data.mongo.AutoConfigureDataMongo;
import org.springframework.boot.test.autoconfigure.restdocs.AutoConfigureRestDocs;
import org.springframework.boot.test.autoconfigure.restdocs.RestDocsMockMvcConfigurationCustomizer;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Bean;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.restdocs.operation.preprocess.Preprocessors;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;

import static airqo.config.Constants.dateTimeFormat;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.is;
import static org.mockito.Mockito.*;
import static org.springframework.restdocs.mockmvc.MockMvcRestDocumentation.document;
import static org.springframework.restdocs.request.RequestDocumentation.parameterWithName;
import static org.springframework.restdocs.request.RequestDocumentation.requestParameters;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultHandlers.print;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@Slf4j
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureMockMvc
@AutoConfigureRestDocs(uriHost = "api.airqo.net", uriScheme = "https", uriPort = 443)
@AutoConfigureDataMongo
public class MeasurementControllerTests {

	private final SimpleDateFormat simpleDateFormat = new SimpleDateFormat(dateTimeFormat);
	@Autowired
	protected MockMvc mockMvc;
	@MockBean
	InsightsService insightsService;

	List<Insight> insights = new ArrayList<>();

	@BeforeEach
	public void initialize() {
	}

	@Test
	@DisplayName("Testing api query parameters")
	public void testApiQueryParameters() throws Exception {

		Date startDateTime = DateTime.now().toDate();
		Date endDateTime = new DateTime().plusDays(10).toDate();
		String siteId = "site-01";

		Insight insight = new Insight();
		insight.setSiteId(siteId);
		insight.setPm2_5(50);
		insight.setPm10(100);
		insight.setAvailable(false);
		insight.setForecast(true);
		insight.setFrequency(Frequency.HOURLY);
		insight.setTime(startDateTime);

		insights.clear();
		insights.add(insight);

		when(insightsService.getForecastInsights(startDateTime, endDateTime, siteId)).thenReturn(new InsightData(insights, insights));

		ResultActions resultActions = this.mockMvc.perform(get("/measurements/app/insights")
				.param("siteId", siteId)
				.param("utcOffSet", "0")
				.param("startDateTime", simpleDateFormat.format(startDateTime))
				.param("endDateTime", simpleDateFormat.format(endDateTime))
			)
			.andExpect(status().isOk())
			.andExpect(content().contentType(MediaType.APPLICATION_JSON))
			.andExpect(jsonPath("$.message", is("Operation Successful")))
			.andExpect(jsonPath("$.data").isArray())
			.andExpect(jsonPath("$.data", hasSize(1)))
			.andExpect(jsonPath("$.data[0].siteId", is("site-01")));

		verify(this.insightsService, times(1)).getForecastInsights(startDateTime, endDateTime, siteId);

		MockHttpServletResponse response = resultActions.andReturn().getResponse();
		Assertions.assertEquals(response.getStatus(), 200);

	}

	@Test
	@DisplayName("Generating API Documentation")
	public void generateAPIDocs() throws Exception {

		insights.clear();
		Date startDateTime = DateTime.now().toDate();
		Date endDateTime = new DateTime().plusDays(10).toDate();
		String siteId = "site-01";

		Insight insight = new Insight();
		insight.setTime(startDateTime);
		insight.setFrequency(Frequency.HOURLY);
		insight.setAvailable(false);
		insight.setForecast(false);
		insight.setPm2_5(23.90332);
		insight.setPm10(34.54333);
		insight.setSiteId(siteId);
		insights.add(insight);

		insight = new Insight();
		insight.setTime(endDateTime);
		insight.setFrequency(Frequency.DAILY);
		insight.setAvailable(false);
		insight.setForecast(true);
		insight.setPm2_5(45.2323);
		insight.setPm10(52.3444);
		insight.setSiteId(siteId);
		insights.add(insight);

		when(insightsService.getForecastInsights(startDateTime, endDateTime, siteId)).thenReturn(new InsightData(insights, insights));

		this.mockMvc.perform(get("/api/v1/view/measurements/app/insights")
				.contextPath("/api/v1/view")
				.header("Authorization", "Token XX.XXX.XXX")
				.param("siteId", siteId)
				.param("startDateTime", simpleDateFormat.format(startDateTime))
				.param("endDateTime", simpleDateFormat.format(endDateTime)))
			.andDo(print())
			.andExpect(status().isOk())
			.andDo(document("app-insights",
				requestParameters(
					parameterWithName("siteId").description("Site id."),
					parameterWithName("startDateTime").description("Start date time. Format `yyyy-MM-ddTHH:mm:ssZ` . Timezone is UTC"),
					parameterWithName("endDateTime").description("End date time. Format `yyyy-MM-ddTHH:mm:ssZ` . Timezone is UTC"),
					parameterWithName("utcOffSet").description("Utc offset for data formatting").optional()
				)));
	}

	@TestConfiguration
	static class RestDocsConfiguration {

		@Bean
		public RestDocsMockMvcConfigurationCustomizer restDocsMockMvcConfigurationCustomizer() {
			return configurer -> configurer.operationPreprocessors()
				.withRequestDefaults(Preprocessors.prettyPrint())
				.withResponseDefaults(Preprocessors.prettyPrint());
		}
	}
}
