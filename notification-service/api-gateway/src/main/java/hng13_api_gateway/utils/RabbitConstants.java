package hng13_api_gateway.utils;

import lombok.NoArgsConstructor;

@NoArgsConstructor
public final class RabbitConstants {

    public static final String NOTIFICATIONS_EXCHANGE = "notifications.direct";

    public static final String EMAIL_QUEUE = "email.queue";
    public static final String PUSH_QUEUE = "push.queue";
    public static final String FAILED_QUEUE = "failed.queue";

    public static final String EMAIL_ROUTING_KEY = "email.notification";
    public static final String PUSH_ROUTING_KEY = "push.notification";
    public static final String FAILED_ROUTING_KEY = "failed.notification";
}
