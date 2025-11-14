package hng13_api_gateway.controller;

import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/users")
public class UserProxyController {

    private final WebClient.Builder webClientBuilder;

    @PostMapping
    public Mono<ResponseEntity<String>> registerUser(@RequestBody String body) {
        return webClientBuilder.build()
                .post()
                .uri("http://user-service/api/v1/users")
                .bodyValue(body)
                .retrieve()
                .toEntity(String.class);
    }

    @PostMapping("/login")
    public Mono<ResponseEntity<String>> loginUser(@RequestBody String body) {
        return webClientBuilder.build()
                .post()
                .uri("http://user-service/api/v1/users/login")
                .bodyValue(body)
                .retrieve()
                .toEntity(String.class);
    }
}
