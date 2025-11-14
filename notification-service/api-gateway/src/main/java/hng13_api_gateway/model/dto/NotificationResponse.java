package hng13_api_gateway.model.dto;

public record NotificationResponse(String notification_id, String status, String timestamp, String error) {
}
