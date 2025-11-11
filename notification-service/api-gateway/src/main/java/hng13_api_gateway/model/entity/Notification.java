package hng13_api_gateway.model.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;
import java.util.UUID;

@Getter
@Setter
@Entity
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Table(name="notifications")
public class Notification {
    @Id
    @GeneratedValue
    private UUID id;

    @Column(unique = true, nullable = false)
    private String correlationId;

    private String userId;
    private String type;
    private String status;
    private int attempts;

    @Column(columnDefinition = "jsonb")
    private String payload;

    private Instant createdAt;
    private Instant updatedAt;
}
