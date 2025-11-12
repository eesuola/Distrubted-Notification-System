import fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import consulPlugin from './plugins/consul.js';
import correlationIdPlugin from './plugins/correlation-id.js';
import rabbitmqPlugin from './plugins/rabbitmq.js';
import redisPlugin from './plugins/redis.js';
import authPlugin from './plugins/auth.js';
import notificationRoutes from './routes/notifications.js';
import { createResponse } from '@shared/response.js';
import { service_config, logging_config } from './config.js';

// Declare process for global access
declare const process: {
  uptime(): number;
  env: Record<string, string | undefined>;
  exit(code?: number): never;
  on(event: string, listener: (...args: any[]) => void): void;
};

// Create Fastify instance
const server: FastifyInstance = fastify({
  logger: {
    level: logging_config.level,
    ...(logging_config.pretty_print && {
      transport: {
        target: 'pino-pretty'
      }
    }),
    timestamp: logging_config.include_timestamp,
  },
});

// Register plugins in the correct order
async function registerPlugins(): Promise<void> {
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
    
    // Register notification routes after all plugins are loaded
    await server.register(notificationRoutes, { prefix: '/api/v1' });
    server.log.info('Notification routes registered');
    
    server.log.info('All plugins registered successfully');
  } catch (error) {
    server.log.error({ error }, 'Failed to register plugins');
    throw error;
  }
}

// Health check endpoint
server.get('/health', async (request, reply) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: service_config.name,
    uptime: process.uptime(),
    services: {} as Record<string, any>,
  };

  // Check RabbitMQ connection if plugin is loaded
  if ((server as any).checkRabbitMQConnection) {
    try {
      const rabbitmqStatus = await (server as any).checkRabbitMQConnection();
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
        error: (error as Error).message,
        connected: false,
      };
      health.status = 'degraded';
    }
  }

  // Check Redis connection if plugin is loaded
  if ((server as any).checkRedisConnection) {
    try {
      const redisStatus = await (server as any).checkRedisConnection();
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
        error: (error as Error).message,
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
async function initializeConnections(): Promise<void> {
  try {
    server.log.info('Initializing connections...');
    
    // Check Redis connection
    if ((server as any).checkRedisConnection) {
      const redisStatus = await (server as any).checkRedisConnection();
      if (!redisStatus) {
        server.log.warn('Redis connection not available, service will run in degraded mode');
      } else {
        server.log.info('Redis connection verified');
      }
    }
    
    // Check RabbitMQ connection
    if ((server as any).checkRabbitMQConnection) {
      const rabbitmqStatus = await (server as any).checkRabbitMQConnection();
      if (!rabbitmqStatus) {
        server.log.warn('RabbitMQ connection not available, service will run in degraded mode');
      } else {
        server.log.info('RabbitMQ connection verified');
      }
    }
    
    // Check Consul connection
    if ((server as any).consul) {
      try {
        const leader = await (server as any).consul.status.leader();
        server.log.info(`Consul connection verified, leader: ${leader}`);
      } catch (error) {
        server.log.warn({ error }, 'Consul connection not available, service discovery may be limited');
      }
    }
    
    server.log.info('Connection initialization completed');
  } catch (error) {
    server.log.error({ error }, 'Error during connection initialization');
    // Don't throw error, allow service to start in degraded mode
  }
}

// Start server
async function start(): Promise<void> {
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
    server.log.error({ error: err }, 'Failed to start server');
    process.exit(1);
  }
}

// Handle graceful shutdown
async function gracefulShutdown(signal: string): Promise<void> {
  server.log.info(`Received ${signal}, shutting down gracefully...`);
  
  try {
    // Close RabbitMQ connection if available
    if ((server as any).closeRabbitMQConnection) {
      try {
        await (server as any).closeRabbitMQConnection();
        server.log.info('RabbitMQ connection closed');
      } catch (error) {
        server.log.error({ error }, 'Error closing RabbitMQ connection during shutdown');
      }
    }
    
    // Close Redis connection if available
    if ((server as any).redis && (server as any).redis.quit) {
      try {
        await (server as any).redis.quit();
        server.log.info('Redis connection closed');
      } catch (error) {
        server.log.error({ error }, 'Error closing Redis connection during shutdown');
      }
    }
    
    // Deregister from Consul if available
    if ((server as any).serviceDiscovery && (server as any).serviceDiscovery.deregisterService) {
      try {
        const serviceId = `${service_config.name}-${process.env.HOSTNAME || 'local'}-${service_config.port}`;
        await (server as any).serviceDiscovery.deregisterService(serviceId);
        server.log.info('Service deregistered from Consul');
      } catch (error) {
        server.log.error({ error }, 'Error deregistering from Consul during shutdown');
      }
    }
    
    // Close Fastify server
    await server.close();
    server.log.info('Server closed successfully');
    
    process.exit(0);
  } catch (error) {
    server.log.error({ error }, 'Error during graceful shutdown');
    process.exit(1);
  }
}

// Register shutdown handlers
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// Handle uncaught exceptions
process.on('uncaughtException', (error: Error) => {
  server.log.error({ error }, 'Uncaught Exception');
  gracefulShutdown('uncaughtException');
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
  server.log.error({ promise, reason }, 'Unhandled Rejection');
  gracefulShutdown('unhandledRejection');
});

// Start the server
start();