package hng13_api_gateway.controller;

import hng13_api_gateway.model.dto.NotificationRequest;
import hng13_api_gateway.model.dto.NotificationResponse;
import hng13_api_gateway.model.dto.NotificationStatusRequest;
import hng13_api_gateway.service.NotificationService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import reactor.core.publisher.Mono;

import java.time.Instant;
import java.util.Map;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1")
public class NotificationController {

    private final NotificationService notificationService;

    @PostMapping("/notifications")
    public Mono<ResponseEntity<NotificationResponse>> sendNotification(
            @RequestHeader(value = "Idempotency-Key", required = false) String idempotencyKey,
            @RequestBody @Valid NotificationRequest request) {

      return notificationService.createAndPublish(request, idempotencyKey)
              .map(corrId -> ResponseEntity.accepted().body(
                      new NotificationResponse(corrId, "pending", Instant.now().toString(), "null")
              ))
              .onErrorResume(e -> Mono.just(ResponseEntity.status(503).body(
                      new NotificationResponse(null, "failed", Instant.now().toString(), e.getMessage())
              )));
    }

    @PostMapping("/{notification_preference}/status")
    public ResponseEntity<NotificationResponse> updateStatus(@PathVariable String notification_preference, @RequestBody NotificationStatusRequest req) {
        boolean updated = notificationService.updateNotificationStatus(req.getNotification_id(), req.getStatus());

        if (updated) {
            return ResponseEntity.ok(new NotificationResponse(req.getNotification_id(), req.getStatus(), Instant.now().toString(), null));
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
