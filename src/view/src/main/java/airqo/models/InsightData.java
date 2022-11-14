package airqo.models;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@AllArgsConstructor
@NoArgsConstructor
@JsonIgnoreProperties(ignoreUnknown = true)
public class InsightData {
	private List<Insight> forecast;
	private List<Insight> historical;

	@JsonIgnore
	public boolean isEmpty() {
		return forecast.isEmpty() && historical.isEmpty();
	}
}
