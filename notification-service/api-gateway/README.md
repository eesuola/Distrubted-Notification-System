# API-Gateway
## Overview
The Api-gateway is the central entry point for all client requests in the Distributed Notification System. It's responsibilities include:
- **Authentication & Authorization**
  - verifies JWT tokens in the `Authorization: Bearer <token>` header using the signing secret key
  - Ensures only authenticated users can access protected endpoints
- **Notification Handling**
  - Accepts notification requests (email or push) from clients. 
  - Publishes messages to RabbitMQ queues (email.queue and push.queue). 
  - Persists notification metadata and status in PostgreSQL. 
  - Supports idempotency to avoid duplicate requests.
- **User Service Routing**
  - Forwards requests related to user login, registration, and profile management to the User Service. 
  - Uses Consul for service discovery. 
  - Applies Resilience4j circuit breaker for fault tolerance.
- **Service Discovery & Resilience**
  - Registers with Consul for service discovery. 
  - Uses Resilience4j to handle failures when calling downstream services.
- **Asynchronous Communication**
  - Sends notifications to RabbitMQ queues. 
  - Downstream services (Email Service, Push Service) consume messages and update notification status.

## Architecture Overview
![System Design Diagram](../../notification-distributed-service.png)

## Prerequisites
- Java 17+
- Maven 3.8+
- Docker & Docker Compose
- PostgreSQL, RabbitMQ, Consul running (via docker compose)

## Running the API-Gateway
1. Run the docker compose.yaml file:
    ```bash
      docker compose up -d
    ```
   This starts:
   - `consul` (service discovery)
   - `rabbitmq` (message broker)
   - `postgres` (notification persistence database)
   - `redis` (idempotency data persistence)
    verify consul running:
    ```bash
      curl http://localhost:8500/v1/status/leader
    ```
2. Set up environment variables:
    ```bash
    export DB_HOST=localhost
    export DB_PORT=5432
    export DB_NAME=gateway_db
    export DB_USER=postgres
    export DB_PASS=password
    
    export RABBIT_HOST=localhost
    export RABBIT_PORT=5672
    
    export CONSUL_HOST=localhost
    export CONSUL_PORT=8500
    
    export JWT_SECRET="your_super_secret_jwt_key"
    ```
3. Build and run with maven:
   ```bash
   mvn clean install
   mvn spring-boot:run
   ```
### Configuration:
- JWT Secret: JWT_SECRET environment variable used to verify tokens.
- Consul: CONSUL_HOST and CONSUL_PORT for service discovery.
- RabbitMQ: RABBIT_HOST and RABBIT_PORT to publish notifications.
- Postgres: Connection configured via spring.datasource properties.

## Exposed Endpoints
1. Notification Endpoints
   - `/api/v1/notifications/ POST` - publish a notification events (email or push)
   - `/api/v1/notifications/status` - update the status of a notification call by downstream service
   - `/api/v1/notifications/status/{notificationId}` - retrieve the current status of a notification

       #### NotificationRequest sample
       ```json
       {
         "notification_type": "email",
         "user_id": "uuid",
         "template_code": "welcome_email",
         "variables": {
           "name": "John Doe",
           "link": "https://example.com/activate"
         },
         "request_id": "12345",
         "priority": 1,
         "metadata": {
           "campaign": "new_user"
         }
       }
    
       ```
2. User Service routes
   - Any requests for `/api/v1/users/` (registration, login, profile updates) are forwarded to the User Service.
   - Example:
     - POST /api/v1/users/register
     - POST /api/v1/users/login
     - GET /api/v1/users/me

   - API Gateway handles routing and applies JWT verification for protected endpoints.

3. Actuator Endpoints
   - /actuator/health → Health check
   - /actuator/info → Application info
   - /actuator/** → All other actuator endpoints are exposed for monitoring.

## Security
- JWT authentication
    - All `/api/v1/notifications/**` endpoints require Authorization: Bearer <token>.
    - JWT is validated using HMAC SHA-256 with the configured JWT_SECRET.
    - Extracted claims (user ID, email) are available for routing and audit logging.

- User Service routing
    - `/api/v1/users/**` endpoints are open to allow login and registration.
    - Other user routes are validated if JWT is present.

- Persistence
  - PostgreSQL stores notification records
    - `correlation_id` -	Unique ID for the notification request
    - `user_id` -	User receiving the notification
    - `type` -	EMAIL or PUSH
    - `status` -	QUEUED, DELIVERED, FAILED
    - `created_at`	Timestamp of creation
    - `updated_at`	Last updated timestamp

- Optional Redis: Used for idempotency keys to avoid duplicate processing.

### RabbitMQ Messaging
- Exchange: notifications.direct
- Queues:
  - email.queue → consumed by Email Service
  - push.queue → consumed by Push Service
  - failed.queue → dead letter queue
- API Gateway publishes messages to the proper queue based on notification_type.

### Circuit Breaker / Resilience
- All calls to the User Service are wrapped in Resilience4j Circuit Breaker.
- Provides fallback responses if User Service is unavailable.