package hng13_api_gateway.client;

import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.cloud.client.loadbalancer.LoadBalanced;
import org.springframework.context.annotation.Bean;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;

@Component
@RequiredArgsConstructor
public class UserClient {

    @Value("${user.service.basepath:/v1/users}")
    private String basePath;

    private final WebClient webClient;

    @Bean
    @LoadBalanced
    public WebClient loadBalanceWebClient(WebClient.Builder builder) {
        return builder.build();
    }

    public Mono<UserInfo> getUserInfo(String userId) {
        return webClient.get()
                .uri("http://user-service" + basePath + "/" + userId)
                .retrieve()
                .bodyToMono(UserInfo.class);
    }

    public record UserInfo(String userId, String email, String[] pushTokens, boolean emailEnabled, boolean pushEnabled) {}
}
