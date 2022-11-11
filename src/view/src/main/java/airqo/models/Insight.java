package airqo.models;

import com.fasterxml.jackson.annotation.JsonFormat;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;

import java.io.Serializable;
import java.util.Date;
import java.util.Objects;

import static airqo.config.Constants.dateTimeFormat;

@Data
@AllArgsConstructor
@NoArgsConstructor
@JsonIgnoreProperties(ignoreUnknown = true)
public class Insight implements Serializable {

	@JsonFormat(shape = JsonFormat.Shape.STRING, pattern = dateTimeFormat, timezone = "UTC")
	@DateTimeFormat(pattern = dateTimeFormat)
	private Date time;
	private double pm2_5;
	private double pm10;
	private Boolean empty;
	private Boolean forecast;
	private Frequency frequency;
	private String siteId;

	@Override
	public boolean equals(Object obj) {
		if (obj == null || getClass() != obj.getClass()) return false;
		Insight objInsight = (Insight) obj;
		return time.compareTo(objInsight.time) == 0 &&
			Objects.equals(frequency, objInsight.frequency) &&
			Objects.equals(siteId, objInsight.siteId);
	}

	@Override
	public int hashCode() {
		return Objects.hash(siteId, frequency, time);
	}

}

