package hng13_api_gateway.service;

import lombok.RequiredArgsConstructor;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import java.time.Duration;

@Service
@RequiredArgsConstructor
public class IdempotencyService {

    private final StringRedisTemplate redis;
    private static final Duration TTL = Duration.ofHours(24);

    /**
     * Return existing correlationId for key if present, else store correlationId and return null
     */
    public String reserveIfAbsent(String idempotencyKey, String correlationId) {
        String existing = redis.opsForValue().get(idempotencyKey);
        if (existing != null) return existing;
        Boolean success = redis.opsForValue().setIfAbsent(idempotencyKey, correlationId, TTL);
        return Boolean.TRUE.equals(success) ? null: redis.opsForValue().get(idempotencyKey);
    }

}
