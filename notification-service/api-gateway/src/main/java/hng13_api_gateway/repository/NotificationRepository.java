package hng13_api_gateway.repository;

import hng13_api_gateway.model.entity.Notification;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface NotificationRepository extends JpaRepository<Notification, Long> {
    Optional<Notification> findByCorrelationId(String notificationId);
}
