package hng13_api_gateway.controller;

import hng13_api_gateway.model.dto.NotificationRequest;
import hng13_api_gateway.model.dto.NotificationResponse;
import hng13_api_gateway.service.NotificationService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import reactor.core.publisher.Mono;

import java.util.Map;

@RestController
@RequiredArgsConstructor
@RequestMapping("/v1/notifications")
public class NotificationController {

    private final NotificationService notificationService;

    @PostMapping
    public Mono<ResponseEntity<NotificationResponse>> sendNotification(
            @RequestHeader(value = "Idempotency-Key", required = false) String idempotencyKey,
            @RequestBody NotificationRequest request) {

      return notificationService.createAndPublish(request, idempotencyKey)
              .map(corrId -> ResponseEntity.accepted().body(
                      new NotificationResponse("true", null, null, "notification queued successfully")
              ))
              .onErrorResume(e -> Mono.just(ResponseEntity.status(503).body(
                      new NotificationResponse("false", null, e.getMessage(), "Failed to queue notification")
              )));
    }

    @PostMapping("/status/{notificationId}")
    public ResponseEntity<?> updateStatus(@PathVariable String notificationId, @RequestParam String status) {
        boolean updated = notificationService.updateNotificationStatus(notificationId, status);

        if (updated) {
            return ResponseEntity.ok(Map.of("notification_id", notificationId, "status", status));
        } else {
            return ResponseEntity.notFound().build();
        }
    }

    @GetMapping("/status/{notificationId}")
    public ResponseEntity<?> getStatus(@PathVariable String notificationId) {
        return notificationService.getNotificationStatus(notificationId)
                .map(status -> ResponseEntity.ok(Map.of(
                        "notification_id", status.getCorrelationId(),
                        "status", status.getStatus(),
                        "type", status.getType()
                )))
                .orElse(ResponseEntity.notFound().build());
    }
}
