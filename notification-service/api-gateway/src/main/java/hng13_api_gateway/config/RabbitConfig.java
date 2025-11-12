package hng13_api_gateway.config;

import hng13_api_gateway.utils.RabbitConstants;
import org.springframework.amqp.core.*;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class RabbitConfig {

    @Bean
    public DirectExchange notificationsExchange() {
        return new DirectExchange(RabbitConstants.NOTIFICATIONS_EXCHANGE, true, false);
    }

    @Bean
    public Queue emailQueue() {
        return QueueBuilder.durable(RabbitConstants.EMAIL_QUEUE)
                .withArgument("x-dead-letter-exchange", RabbitConstants.NOTIFICATIONS_EXCHANGE)
                .withArgument("x-dead-letter-routing-key", RabbitConstants.FAILED_ROUTING_KEY)
                .build();
    }

    @Bean
    public Queue pushQueue() {
        return QueueBuilder.durable(RabbitConstants.PUSH_QUEUE)
                .withArgument("x-dead-letter-exchange", RabbitConstants.NOTIFICATIONS_EXCHANGE)
                .withArgument("x-dead-letter-routing-key", RabbitConstants.FAILED_ROUTING_KEY)
                .build();
    }

    @Bean
    public Queue failedQueue() {
        return QueueBuilder.durable(RabbitConstants.FAILED_QUEUE).build();
    }

    @Bean
    public Binding emailBinding(Queue emailQueue, DirectExchange notificationsExchange) {
        return BindingBuilder.bind(emailQueue).to(notificationsExchange).with(RabbitConstants.EMAIL_ROUTING_KEY);
    }

    @Bean
    public Binding pushBinding(Queue pushQueue, DirectExchange notificationsExchange) {
        return BindingBuilder.bind(pushQueue).to(notificationsExchange).with(RabbitConstants.PUSH_ROUTING_KEY);
    }

    @Bean
    public Binding failedBinding(Queue failedQueue, DirectExchange notificationsExchange) {
        return BindingBuilder.bind(failedQueue).to(notificationsExchange).with(RabbitConstants.FAILED_ROUTING_KEY);
    }
}
