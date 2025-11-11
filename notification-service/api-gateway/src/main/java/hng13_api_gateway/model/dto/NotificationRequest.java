package hng13_api_gateway.model.dto;

import lombok.Builder;
import lombok.Data;

import java.util.Map;

@Data
@Builder
public class NotificationRequest {
    private String type;
    private String userId;
    private String templateId;
    private Map<String, Object> variables;
    private Integer priority;
    private String notificationId;
}
