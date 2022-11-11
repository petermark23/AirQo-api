package airqo.config;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.ResponseStatus;

@ResponseStatus(code = HttpStatus.BAD_REQUEST, reason = "Error")
public class CustomException extends RuntimeException {

	public CustomException(String exception) {
		super(exception);
	}

}
