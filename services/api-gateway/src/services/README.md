# Service Clients

This directory contains TypeScript service client modules for the API Gateway service. These clients provide a clean, type-safe interface for interacting with external services like Consul and RabbitMQ.

## Modules

### 1. Consul Client (`consul.ts`)

The Consul client provides service discovery capabilities for the microservices architecture.

#### Features:
- Service registration and deregistration
- Service URL discovery with health checking
- Get all service instances
- Service health monitoring
- TypeScript interfaces for all operations

#### Usage Example:

```typescript
import { getConsulClient } from './services/index.js';

// Get a Consul client instance
const consulClient = getConsulClient(logger);

// Get service URL
try {
  const userServiceUrl = await consulClient.getServiceUrl('user-service');
  console.log(`User service is available at: ${userServiceUrl}`);
} catch (error) {
  console.error('Failed to discover user service:', error.message);
}

// Get all service instances
const instances = await consulClient.getAllServiceInstances('user-service');
console.log(`Found ${instances.length} instances of user service`);

// Check service health
const health = await consulClient.checkServiceHealth('user-service');
console.log(`Service health: ${health.healthy ? 'Healthy' : 'Unhealthy'}`);
```

### 2. RabbitMQ Client (`queue.ts`)

The RabbitMQ client provides message queue operations for publishing notifications.

#### Features:
- Connection management with automatic reconnection
- Exchange and queue setup
- Message publishing with correlation IDs
- Connection status monitoring
- TypeScript interfaces for all operations

#### Usage Example:

```typescript
import { getRabbitMQClient } from './services/index.js';

// Get a RabbitMQ client instance
const queueClient = getRabbitMQClient(logger);

// Connect to RabbitMQ
try {
  await queueClient.connect();
  console.log('Connected to RabbitMQ');
} catch (error) {
  console.error('Failed to connect to RabbitMQ:', error.message);
}

// Publish a message
try {
  const result = await queueClient.publishToQueue('email.queue', {
    user_id: '12345',
    template_code: 'welcome_email',
    variables: {
      name: 'John Doe',
      link: 'https://example.com'
    }
  });
  console.log(`Message published with correlation ID: ${result.correlation_id}`);
} catch (error) {
  console.error('Failed to publish message:', error.message);
}

// Check connection status
const status = queueClient.getConnectionStatus();
console.log(`Connection status: ${status.connected ? 'Connected' : 'Disconnected'}`);
```

## Configuration

Both clients use configuration from the `config.ts` file:

- **Consul**: Uses `consul_config` for host, port, and health check settings
- **RabbitMQ**: Uses `rabbitmq_config` for connection URL, exchange, and queue settings

## Error Handling

Both clients implement proper error handling:

- All methods throw errors with descriptive messages
- Errors are logged using the provided logger
- Connection failures trigger automatic reconnection (RabbitMQ)
- Service discovery failures include service name in error messages

## TypeScript Types

Both modules export TypeScript interfaces for type safety:

- `ServiceInstance`: Represents a service instance in Consul
- `ServiceHealthResult`: Represents health check results
- `ServiceRegistrationConfig`: Configuration for service registration
- `QueueMessage`: Message structure for queue publishing
- `PublishOptions`: Options for message publishing
- `ConnectionStatus`: RabbitMQ connection status

## Singleton Pattern

Both clients use a singleton pattern to ensure only one instance is created:

```typescript
import { getConsulClient, getRabbitMQClient } from './services/index.js';

// These will return the same instance across multiple calls
const consul1 = getConsulClient();
const consul2 = getConsulClient(); // Same instance as consul1

const queue1 = getRabbitMQClient();
const queue2 = getRabbitMQClient(); // Same instance as queue1
```

## Integration with Fastify

These clients are designed to work seamlessly with the Fastify application:

```typescript
// In your Fastify plugin or route handler
import { getConsulClient, getRabbitMQClient } from '../services/index.js';

export async function notificationRoutes(fastify) {
  const consulClient = getConsulClient(fastify.log);
  const queueClient = getRabbitMQClient(fastify.log);

  fastify.post('/notifications', async (request, reply) => {
    // Discover user service
    const userServiceUrl = await consulClient.getServiceUrl('user-service');
    
    // Publish notification to queue
    const result = await queueClient.publishToQueue('email.queue', request.body);
    
    return { success: true, correlation_id: result.correlation_id };
  });
}
```

## Best Practices

1. **Always handle errors**: All client methods can throw errors
2. **Use correlation IDs**: Track requests across services
3. **Monitor connection status**: Check RabbitMQ connection before publishing
4. **Use TypeScript types**: Leverage the exported interfaces for type safety
5. **Log operations**: Pass a logger instance to track client operations