package hng13_api_gateway.model.dto;

public record NotificationResponse(String success, Object data, String error, String message) {
}
