package hng13_api_gateway.service;

import com.fasterxml.jackson.databind.ObjectMapper;
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


    /**
     * send an email notification to the email exchange/queue
     */
    public void sendEmail(NotificationRequest request) {
       sendMessage(request, RabbitConstants.EMAIL_ROUTING_KEY, "Email");
    }

    /**
     * send a push notification to the push exchange/queue
     */
    public void sendPush(NotificationRequest request) {
       sendMessage(request, RabbitConstants.PUSH_ROUTING_KEY, "Push");
    }

    private void sendMessage(NotificationRequest request, String routingKey, String type) {
        try {
            String payload = objectMapper.writeValueAsString(request);
            rabbitTemplate.convertAndSend(RabbitConstants.NOTIFICATIONS_EXCHANGE, routingKey, payload);
            log.info("Queued {} notification [{}] for user [{}]", type, request.getNotificationId(), payload);
        } catch (Exception e) {
            log.error("Failed to queue {} notification [{}]: {}", type, request.getNotificationId(), e.getMessage(), e);
            rabbitTemplate.convertAndSend(RabbitConstants.NOTIFICATIONS_EXCHANGE, RabbitConstants.FAILED_ROUTING_KEY, request);
        }
    }
}
