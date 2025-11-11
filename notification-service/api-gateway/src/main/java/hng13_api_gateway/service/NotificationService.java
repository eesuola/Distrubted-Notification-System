package hng13_api_gateway.service;

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

    public Mono<String> createAndPublish(NotificationRequest req, String idempotencyKey) {
        if (req.getType() == null || (!req.getType().equalsIgnoreCase("email")
                && !req.getType().equalsIgnoreCase("push"))) {
            return Mono.error(new IllegalArgumentException("type must be 'email' or 'push'"));
        }

        String correlationId = UUID.randomUUID().toString();

        String existing = idempotencyService.reserveIfAbsent(idempotencyKey == null ? "NONE": idempotencyKey, correlationId);
        if (existing != null) {
            return Mono.just(existing);
        }

        return userClient.getUserInfo(req.getUserId())
                .switchIfEmpty(Mono.error(new RuntimeException("User not found")))
                .flatMap(userInfo -> {
                    NotificationMessage msg = NotificationMessage.builder()
                            .correlationId(correlationId)
                            .type(req.getType())
                            .userId(req.getUserId())
                            .templateId(req.getTemplateId())
                            .variables(req.getVariables())
                            .createdAt(Instant.now())
                            .priority(req.getPriority())
                            .build();

                    if ("email".equalsIgnoreCase(req.getType())) {
                        msg.setTo(userInfo.email());
                        producer.sendEmail(req);
                    } else {
                        msg.setTo(userInfo.pushTokens());
                        producer.sendPush(req);
                    }

                    Notification notification = new Notification();
                    notification.setCorrelationId(correlationId);
                    notification.setUserId(req.getUserId());
                    notification.setType(req.getType().toUpperCase());
                    notification.setStatus("QUEUED");
                    notification.setCreatedAt(Instant.now());
                    notification.setUpdatedAt(Instant.now());

                    return Mono.fromCallable(() -> repository.save(notification))
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
