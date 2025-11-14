package hng13_api_gateway.model.dto;

import lombok.Data;

@Data
public class NotificationStatusRequest {
    private String notification_id;
    private String status;
}
