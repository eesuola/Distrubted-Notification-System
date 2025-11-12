# API Gateway Service

The API Gateway service is the entry point for all notification requests in the distributed notification system. It validates and authenticates requests, routes messages to the correct queue (email or push), and tracks notification status.

## Features

- Request validation and authentication
- Message routing to appropriate queues
- Service discovery with Consul
- Circuit breaker pattern for resilience
- Idempotency handling
- Health checks
- Correlation ID tracking
- Redis caching for performance

## Configuration

The service uses a centralized configuration system in `src/config.ts`. All configuration is managed through environment variables with sensible defaults.

### Environment Variables

#### Service Configuration
- `SERVICE_NAME`: Service name (default: 'api-gateway')
- `HOST`: Host address (default: '0.0.0.0')
- `PORT`: Port number (default: 3000)
- `SERVICE_VERSION`: Service version (default: '1.0.0')
- `NODE_ENV`: Environment (default: 'development')

#### Service Names
- `API_GATEWAY_SERVICE_NAME`: API Gateway service name (default: 'api-gateway')
- `USER_SERVICE_NAME`: User service name (default: 'user-service')
- `EMAIL_SERVICE_NAME`: Email service name (default: 'email-service')
- `PUSH_SERVICE_NAME`: Push service name (default: 'push-service')
- `TEMPLATE_SERVICE_NAME`: Template service name (default: 'template-service')

#### RabbitMQ Configuration
- `RABBITMQ_URL`: RabbitMQ connection URL (default: 'amqp://localhost:5672')
- `RABBITMQ_EXCHANGE`: Exchange name (default: 'notifications.direct')
- `RABBITMQ_EXCHANGE_TYPE`: Exchange type (default: 'direct')
- `RABBITMQ_EMAIL_QUEUE`: Email queue name (default: 'email.queue')
- `RABBITMQ_PUSH_QUEUE`: Push queue name (default: 'push.queue')
- `RABBITMQ_FAILED_QUEUE`: Failed queue name (default: 'failed.queue')
- `RABBITMQ_RECONNECT_DELAY`: Reconnection delay in ms (default: 5000)
- `RABBITMQ_MAX_RECONNECT_ATTEMPTS`: Max reconnection attempts (default: 10)
- `RABBITMQ_CONNECTION_TIMEOUT`: Connection timeout in ms (default: 30000)
- `RABBITMQ_HEARTBEAT`: Heartbeat interval in seconds (default: 60)

#### Redis Configuration
- `REDIS_HOST`: Redis host (default: 'localhost')
- `REDIS_PORT`: Redis port (default: 6379)
- `REDIS_PASSWORD`: Redis password (optional)
- `REDIS_DB`: Redis database number (default: 0)
- `REDIS_RETRY_DELAY_ON_FAILOVER`: Retry delay on failover in ms (default: 100)
- `REDIS_MAX_RETRIES_PER_REQUEST`: Max retries per request (default: 3)
- `REDIS_LAZY_CONNECT`: Enable lazy connection (default: true)
- `REDIS_CONNECT_TIMEOUT`: Connection timeout in ms (default: 10000)
- `REDIS_COMMAND_TIMEOUT`: Command timeout in ms (default: 5000)
- `REDIS_DEFAULT_TTL`: Default TTL in seconds (default: 86400)
- `REDIS_NOTIFICATION_STATUS_TTL`: Notification status TTL in seconds (default: 604800)

#### Consul Configuration
- `CONSUL_HOST`: Consul host (default: 'localhost')
- `CONSUL_PORT`: Consul port (default: 8500)
- `CONSUL_HEALTH_CHECK_INTERVAL`: Health check interval (default: '10s')
- `CONSUL_HEALTH_CHECK_TIMEOUT`: Health check timeout (default: '5s')
- `CONSUL_DEREGISTER_CRITICAL_SERVICE_AFTER`: Deregister critical service after (default: '30s')
- `CONSUL_SERVICE_QUERY_TIMEOUT`: Service query timeout in ms (default: 5000)
- `CONSUL_MAX_SERVICE_QUERY_RETRIES`: Max service query retries (default: 3)

#### JWT Configuration
- `JWT_SECRET`: JWT secret key (default: 'your-secret-key')
- `JWT_ALGORITHM`: JWT algorithm (default: 'HS256')
- `JWT_EXPIRES_IN`: JWT expiration time (default: '24h')
- `JWT_REFRESH_EXPIRES_IN`: JWT refresh expiration time (default: '7d')

#### Rate Limiting Configuration
- `RATE_LIMIT_MAX_REQUESTS`: Max requests per time window (default: 100)
- `RATE_LIMIT_TIME_WINDOW`: Time window in seconds (default: 60)
- `RATE_LIMIT_SKIP_SUCCESSFUL_REQUESTS`: Skip successful requests (default: true)
- `RATE_LIMIT_SKIP_FAILED_REQUESTS`: Skip failed requests (default: true)

#### Circuit Breaker Configuration
- `CIRCUIT_BREAKER_TIMEOUT`: Circuit breaker timeout in ms (default: 30000)
- `CIRCUIT_BREAKER_ERROR_THRESHOLD`: Error threshold percentage (default: 50.0)
- `CIRCUIT_BREAKER_RESET_TIMEOUT`: Reset timeout in ms (default: 60000)
- `CIRCUIT_BREAKER_MONITORING_PERIOD`: Monitoring period in ms (default: 10000)
- `CIRCUIT_BREAKER_MINIMUM_REQUESTS`: Minimum requests (default: 10)

#### Logging Configuration
- `LOG_LEVEL`: Log level (default: 'info')
- `LOG_PRETTY_PRINT`: Enable pretty printing (default: false)
- `LOG_INCLUDE_TIMESTAMP`: Include timestamp (default: true)
- `LOG_INCLUDE_HOSTNAME`: Include hostname (default: true)
- `LOG_INCLUDE_PID`: Include process ID (default: true)

#### API Configuration
- `API_PREFIX`: API prefix (default: '/api/v1')
- `API_DOCUMENTATION_ENABLED`: Enable API documentation (default: true)
- `API_DOCUMENTATION_PATH`: Documentation path (default: '/documentation')
- `CORS_ENABLED`: Enable CORS (default: true)
- `CORS_ORIGIN`: CORS origin (default: '*')

#### Notification Configuration
- `NOTIFICATION_MAX_RETRIES`: Max retry attempts (default: 3)
- `NOTIFICATION_RETRY_DELAY`: Retry delay in ms (default: 5000)
- `NOTIFICATION_MAX_BATCH_SIZE`: Max batch size (default: 100)
- `NOTIFICATION_DEFAULT_PRIORITY`: Default priority (default: 5)
- `NOTIFICATION_IDEMPOTENCY_TTL`: Idempotency TTL in seconds (default: 86400)

## Installation

```bash
# Install dependencies
npm install

# Build the service
npm run build

# Start the service
npm start
```

## Development

```bash
# Start in development mode with hot reload
npm run dev

# Run tests
npm run test:basic          # Run basic functionality tests (no external dependencies)
npm run test:notifications  # Run comprehensive notification tests
npm run test:complete       # Run end-to-end flow tests
npm run test:rabbitmq       # Run RabbitMQ-specific tests
```

## API Endpoints

### Health Check
- `GET /health` - Health check endpoint

### Notifications
- `POST /api/v1/notifications/` - Create and route notification request

### API Documentation
- `GET /documentation` - Swagger UI documentation (if enabled)

## Testing

The API Gateway service includes several test scripts to verify functionality:

### Basic Tests
Run basic functionality tests without external dependencies:
```bash
npm run test:basic
```
This test suite verifies:
- Health endpoint functionality
- Valid email and push notification requests
- Idempotency handling
- Error handling for invalid requests
- Authentication and authorization

### Comprehensive Tests
For more thorough testing with external services:
```bash
npm run test:notifications  # Test notification processing
npm run test:complete       # End-to-end flow tests
npm run test:rabbitmq       # RabbitMQ integration tests
```

For detailed information about the basic test suite, see [TEST_BASIC_README.md](./TEST_BASIC_README.md).

## Architecture

The API Gateway service follows a microservices architecture pattern:

1. **Request Processing**: Validates and authenticates incoming requests
2. **Service Discovery**: Uses Consul to discover other services
3. **Message Routing**: Routes messages to appropriate RabbitMQ queues
4. **Caching**: Uses Redis for caching and idempotency
5. **Circuit Breaker**: Implements circuit breaker pattern for resilience
6. **Health Monitoring**: Provides health checks for all dependencies

## Dependencies

- Fastify - Web framework
- Consul - Service discovery
- RabbitMQ - Message queuing
- Redis - Caching and idempotency
- JWT - Authentication
- Opossum - Circuit breaker

## Docker

The service can be containerized using Docker:

```bash
# Build Docker image
docker build -t api-gateway .

# Run container
docker run -p 3000:3000 api-gateway
```

## Monitoring

The service provides comprehensive monitoring through:

- Health check endpoints
- Structured logging with correlation IDs
- Metrics for queue processing
- Circuit breaker state monitoring
- Service discovery health checks