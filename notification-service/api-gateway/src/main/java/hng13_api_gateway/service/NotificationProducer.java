package hng13_api_gateway.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import hng13_api_gateway.model.dto.NotificationMessage;
import hng13_api_gateway.model.dto.NotificationRequest;
import hng13_api_gateway.utils.RabbitConstants;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class NotificationProducer {

    private final ObjectMapper objectMapper;
    private final RabbitTemplate rabbitTemplate;

    private static final Logger log = LoggerFactory.getLogger(NotificationProducer.class);

    public void publish(NotificationMessage msg) {
        try {
            String payload = objectMapper.writeValueAsString(msg);
            String routingKey = "email".equals(msg.getType()) ? RabbitConstants.EMAIL_ROUTING_KEY : RabbitConstants.PUSH_ROUTING_KEY;
            rabbitTemplate.convertAndSend(RabbitConstants.NOTIFICATIONS_EXCHANGE, routingKey, payload);
            log.info("Queued {} notification [{}] for user {}", msg.getType(), msg.getCorrelationId(), msg.getUserId());
        } catch (Exception ex) {
            log.error("Failed to publish notification {}: {}", msg.getCorrelationId(), ex.getMessage(), ex);
            rabbitTemplate.convertAndSend(RabbitConstants.NOTIFICATIONS_EXCHANGE, RabbitConstants.FAILED_ROUTING_KEY, msg);
        }
    }
}
