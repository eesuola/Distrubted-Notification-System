import fastify from 'fastify';
import consulPlugin from './plugins/consul.js';
import correlationIdPlugin from './plugins/correlation-id.js';
import rabbitmqPlugin from './plugins/rabbitmq.js';
import notificationRoutes from './routes/notifications.js';
import { createResponse } from '../../../shared/response.js';

// Create Fastify instance
const server = fastify({
  logger: true,
});

// Register plugins
async function registerPlugins() {
  await server.register(consulPlugin);
  await server.register(correlationIdPlugin);
  await server.register(rabbitmqPlugin);
  await server.register(notificationRoutes);
}

// Health check endpoint
server.get('/health', async (request, reply) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'api-gateway',
    uptime: process.uptime(),
    services: {},
  };

  // Check RabbitMQ connection if plugin is loaded
  if (server.checkRabbitMQConnection) {
    try {
      const rabbitmqStatus = await server.checkRabbitMQConnection();
      health.services.rabbitmq = {
        status: rabbitmqStatus ? 'connected' : 'disconnected',
        connected: rabbitmqStatus,
      };
      
      // If RabbitMQ is disconnected, mark overall status as degraded
      if (!rabbitmqStatus) {
        health.status = 'degraded';
      }
    } catch (error) {
      health.services.rabbitmq = {
        status: 'error',
        error: error.message,
        connected: false,
      };
      health.status = 'degraded';
    }
  }

  // Check Redis connection if plugin is loaded
  if (server.checkRedisConnection) {
    try {
      const redisStatus = await server.checkRedisConnection();
      health.services.redis = {
        status: redisStatus ? 'connected' : 'disconnected',
        connected: redisStatus,
      };
      
      // If Redis is disconnected, mark overall status as degraded
      if (!redisStatus) {
        health.status = 'degraded';
      }
    } catch (error) {
      health.services.redis = {
        status: 'error',
        error: error.message,
        connected: false,
      };
      health.status = 'degraded';
    }
  }

  return health;
});

// Basic error handler
server.setErrorHandler((error, request, reply) => {
  server.log.error(error);
  reply.status(500).send(createResponse(
    false,
    'An unexpected error occurred',
    undefined,
    'Internal Server Error'
  ));
});

// Start server
async function start() {
  try {
    // Register plugins
    await registerPlugins();
    
    // Start listening
    const port = process.env.PORT || 3000;
    const host = process.env.HOST || '0.0.0.0';
    
    await server.listen({ port, host });
    server.log.info(`API Gateway server listening on ${host}:${port}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  server.log.info('Shutting down gracefully...');
  
  // Close RabbitMQ connection if available
  if (server.closeRabbitMQConnection) {
    try {
      await server.closeRabbitMQConnection();
    } catch (error) {
      server.log.error('Error closing RabbitMQ connection during shutdown:', error);
    }
  }
  
  await server.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  server.log.info('Shutting down gracefully...');
  
  // Close RabbitMQ connection if available
  if (server.closeRabbitMQConnection) {
    try {
      await server.closeRabbitMQConnection();
    } catch (error) {
      server.log.error('Error closing RabbitMQ connection during shutdown:', error);
    }
  }
  
  await server.close();
  process.exit(0);
});

// Start the server
start();