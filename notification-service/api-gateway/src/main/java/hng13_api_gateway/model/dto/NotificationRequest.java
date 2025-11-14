package hng13_api_gateway.model.dto;

import lombok.Builder;
import lombok.Data;

import java.util.Map;

@Data
@Builder
public class NotificationRequest {
    private String notification_type;
    private String user_id;
    private String template_code;
    private Map<String, Object> variables;
    private String request_id;
    private Integer priority;
    private Map<String, Object> metadata;
}
