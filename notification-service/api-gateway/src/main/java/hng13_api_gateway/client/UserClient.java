package hng13_api_gateway.client;

import io.github.resilience4j.circuitbreaker.annotation.CircuitBreaker;
import org.springframework.cloud.client.discovery.ReactiveDiscoveryClient;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;

@Component
public class UserClient {

    private final WebClient webClient;
    private final ReactiveDiscoveryClient discoveryClient;

    public UserClient(WebClient.Builder wc, ReactiveDiscoveryClient discoveryClient) {
        this.webClient = wc.build();
        this.discoveryClient = discoveryClient;
    }

    @CircuitBreaker(name = "userService", fallbackMethod = "userFallback")
    public Mono<UserInfo> getUserInfo(String userId) {
        return discoveryClient.getInstances("user-service")
                        .next()
                                .flatMap(instance -> webClient.get()
                .uri("http://user-service/api/v1/users/{id}", userId)
                .retrieve()
                .bodyToMono(UserInfo.class));
    }

    @CircuitBreaker(name = "userService", fallbackMethod = "fallbackResponse")
    public Mono<String> forwardToUserService(String path, Object requestBody) {
        return discoveryClient.getInstances("user-service")
                .next()
                .flatMap(instance -> webClient.post()
                        .uri(instance.getUri() + path)
                        .bodyValue(requestBody)
                        .retrieve()
                        .bodyToMono(String.class));
    }

    private Mono<String> fallbackResponse(String path, Object requestBody, Throwable ex) {
        return Mono.error(new RuntimeException("User service unavailable"));
    }

    private Mono<UserInfo> userFallback(String userId, Throwable t) {
        return Mono.error(new RuntimeException("User service unavailable"));
    }

    public record UserInfo(String user_id, String email, String[] push_tokens, boolean email_enabled, boolean push_enabled) {}
}
