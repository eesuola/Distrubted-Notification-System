package hng13_api_gateway.model.dto;

import lombok.Builder;
import lombok.Data;

import java.time.Instant;
import java.util.Map;

@Data
@Builder
public class NotificationMessage {
    private String correlationId;
    private String type;
    private String userId;
    private String templateId;
    private Map<String, Object> variables;
    private Object to;
    private Integer priority;
    private Instant createdAt;
}
