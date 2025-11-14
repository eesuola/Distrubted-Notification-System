package hng13_api_gateway.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import hng13_api_gateway.client.UserClient;
import hng13_api_gateway.model.dto.NotificationMessage;
import hng13_api_gateway.model.dto.NotificationRequest;
import hng13_api_gateway.model.entity.Notification;
import hng13_api_gateway.repository.NotificationRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class NotificationService {

    private final UserClient userClient;
    private final NotificationProducer producer;
    private final NotificationRepository repository;
    private final IdempotencyService idempotencyService;
    private final ObjectMapper mapper;

    public Mono<String> createAndPublish(NotificationRequest req, String idempotencyKey) {
        if (req.getNotification_type() == null || (!req.getNotification_type().equalsIgnoreCase("email")
                && !req.getNotification_type().equalsIgnoreCase("push"))) {
            return Mono.error(new IllegalArgumentException("Notification_type must be 'email' or 'push'"));
        }

        String correlationId = req.getRequest_id() != null ? req.getRequest_id() : UUID.randomUUID().toString();

        String existing = idempotencyService.reserveIfAbsent(idempotencyKey == null ? "NONE": idempotencyKey, correlationId);
        if (existing != null) {
            return Mono.just(existing);
        }

        return userClient.getUserInfo(req.getUser_id())
                .switchIfEmpty(Mono.error(new RuntimeException("User not found")))
                .flatMap(userInfo -> {
                    NotificationMessage msg = NotificationMessage.builder()
                            .correlationId(correlationId)
                            .type(req.getNotification_type())
                            .userId(req.getUser_id())
                            .templateId(req.getTemplate_code())
                            .variables(req.getVariables())
                            .createdAt(Instant.now())
                            .priority(req.getPriority())
                            .metadata(req.getMetadata())
                            .build();

                    if ("email".equalsIgnoreCase(req.getNotification_type())) {
                        msg.setTo(userInfo.email());
                    } else {
                        msg.setTo(userInfo.push_tokens());
                    }

                    Notification notification = new Notification();
                    notification.setCorrelationId(correlationId);
                    notification.setUserId(req.getUser_id());
                    notification.setType(req.getNotification_type().toUpperCase());
                    notification.setStatus("QUEUED");
                    notification.setAttempts(0);
                    notification.setCreatedAt(Instant.now());
                    notification.setUpdatedAt(Instant.now());

                    try {
                        notification.setPayload(mapper.writeValueAsString(req));
                    } catch (Exception ex) {
                        notification.setPayload("{}");
                    }

                    return Mono.fromCallable(() -> repository.save(notification))
                            .doOnNext(saved -> producer.publish(msg))
                            .thenReturn(correlationId);
                })
                .onErrorResume(err -> Mono.error(new RuntimeException("Failed to create notification." + err.getMessage())));
    }

    public boolean updateNotificationStatus(String notificationId, String status) {
        return repository.findByCorrelationId(notificationId)
                .map(notification -> {
                    notification.setStatus(status.toUpperCase());
                    notification.setUpdatedAt(Instant.now());
                    repository.save(notification);
                    return true;
                }).orElse(false);
    }

    public Optional<Notification> getNotificationStatus(String notificationId) {
        return repository.findByCorrelationId(notificationId);
    }
}
