import fastify from 'fastify';
import Ajv from 'ajv';
import ajvErrors from 'ajv-errors';
import consulPlugin from './plugins/consul.js';
import correlationIdPlugin from './plugins/correlation-id.js';
import rabbitmqPlugin from './plugins/rabbitmq.js';
import redisPlugin from './plugins/redis.js';
import authPlugin from './plugins/auth.js';
import notificationRoutes from './routes/notifications.js';
import { createResponse } from '../../../shared/response.js';
import { service_config, logging_config } from './config.js';

// Create AJV instance with error formatting
const ajv = new Ajv({ allErrors: true });
ajvErrors(ajv);

// Create Fastify instance
const server = fastify({
  logger: {
    level: logging_config.level,
    prettyPrint: logging_config.pretty_print,
    timestamp: logging_config.include_timestamp,
    hostname: logging_config.include_hostname,
    pid: logging_config.include_pid,
  },
});

// Set AJV as the validator compiler
server.setValidatorCompiler(({ schema }) => ajv.compile(schema));

// Register plugins in the correct order
async function registerPlugins() {
  try {
    // Register core infrastructure plugins first
    await server.register(correlationIdPlugin);
    server.log.info('Correlation ID plugin registered');
    
    // Register Redis plugin for idempotency and caching
    await server.register(redisPlugin);
    server.log.info('Redis plugin registered');
    
    // Register Consul plugin for service discovery
    await server.register(consulPlugin);
    server.log.info('Consul plugin registered');
    
    // Register RabbitMQ plugin for message queuing
    await server.register(rabbitmqPlugin);
    server.log.info('RabbitMQ plugin registered');
    
    // Register authentication plugin
    await server.register(authPlugin);
    server.log.info('Authentication plugin registered');
    
    // Register notification routes after all plugins are loaded
    await server.register(notificationRoutes, { prefix: '/api/v1' });
    server.log.info('Notification routes registered');
    
    server.log.info('All plugins registered successfully');
  } catch (error) {
    server.log.error('Failed to register plugins:', error);
    throw error;
  }
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

// Initialize connections before starting server
async function initializeConnections() {
  try {
    server.log.info('Initializing connections...');
    
    // Check Redis connection
    if (server.checkRedisConnection) {
      const redisStatus = await server.checkRedisConnection();
      if (!redisStatus) {
        server.log.warn('Redis connection not available, service will run in degraded mode');
      } else {
        server.log.info('Redis connection verified');
      }
    }
    
    // Check RabbitMQ connection
    if (server.checkRabbitMQConnection) {
      const rabbitmqStatus = await server.checkRabbitMQConnection();
      if (!rabbitmqStatus) {
        server.log.warn('RabbitMQ connection not available, service will run in degraded mode');
      } else {
        server.log.info('RabbitMQ connection verified');
      }
    }
    
    // Check Consul connection
    if (server.consul) {
      try {
        const leader = await server.consul.status.leader();
        server.log.info(`Consul connection verified, leader: ${leader}`);
      } catch (error) {
        server.log.warn('Consul connection not available, service discovery may be limited:', error.message);
      }
    }
    
    server.log.info('Connection initialization completed');
  } catch (error) {
    server.log.error('Error during connection initialization:', error);
    // Don't throw error, allow service to start in degraded mode
  }
}

// Start server
async function start() {
  try {
    // Register plugins
    await registerPlugins();
    
    // Initialize connections
    await initializeConnections();
    
    // Start listening
    await server.listen({
      port: service_config.port,
      host: service_config.host
    });
    
    server.log.info(`API Gateway server listening on ${service_config.host}:${service_config.port}`);
    server.log.info(`Environment: ${service_config.environment}`);
    server.log.info('Server is ready to accept requests');
  } catch (err) {
    server.log.error('Failed to start server:', err);
    process.exit(1);
  }
}

// Handle graceful shutdown
async function gracefulShutdown(signal) {
  server.log.info(`Received ${signal}, shutting down gracefully...`);
  
  try {
    // Close RabbitMQ connection if available
    if (server.closeRabbitMQConnection) {
      try {
        await server.closeRabbitMQConnection();
        server.log.info('RabbitMQ connection closed');
      } catch (error) {
        server.log.error('Error closing RabbitMQ connection during shutdown:', error);
      }
    }
    
    // Close Redis connection if available
    if (server.redis && server.redis.quit) {
      try {
        await server.redis.quit();
        server.log.info('Redis connection closed');
      } catch (error) {
        server.log.error('Error closing Redis connection during shutdown:', error);
      }
    }
    
    // Deregister from Consul if available
    if (server.serviceDiscovery && server.serviceDiscovery.deregisterService) {
      try {
        const serviceId = `${service_config.name}-${process.env.HOSTNAME || 'local'}-${service_config.port}`;
        await server.serviceDiscovery.deregisterService(serviceId);
        server.log.info('Service deregistered from Consul');
      } catch (error) {
        server.log.error('Error deregistering from Consul during shutdown:', error);
      }
    }
    
    // Close Fastify server
    await server.close();
    server.log.info('Server closed successfully');
    
    process.exit(0);
  } catch (error) {
    server.log.error('Error during graceful shutdown:', error);
    process.exit(1);
  }
}

// Register shutdown handlers
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  server.log.error('Uncaught Exception:', error);
  gracefulShutdown('uncaughtException');
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  server.log.error('Unhandled Rejection at:', promise, 'reason:', reason);
  gracefulShutdown('unhandledRejection');
});

// Start the server
start();