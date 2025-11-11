import Fastify from 'fastify';
import cors from '@fastify/cors';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Import plugins
import prismaPlugin from './plugins/prisma.js';
import redisPlugin from './plugins/redis.js';
import correlationIdPlugin from './plugins/correlation-id.js';

// Import routes
import templateRoutes from './routes/templates.js';

// Create Fastify instance
const fastify = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || 'info',
    transport: process.env.NODE_ENV === 'development' ? {
      target: 'pino-pretty',
      options: {
        translateTime: 'HH:MM:ss Z',
        ignore: 'pid,hostname',
      },
    } : undefined,
  },
});

// Register CORS
await fastify.register(cors, {
  origin: process.env.CORS_ORIGIN || '*',
});

// Register Swagger for API documentation
await fastify.register(swagger, {
  swagger: {
    info: {
      title: 'Template Service API',
      description: 'API documentation for the Template Service - manages notification templates with versioning',
      version: '0.1.0',
    },
    host: process.env.SWAGGER_HOST || 'localhost:3002',
    schemes: ['http', 'https'],
    consumes: ['application/json'],
    produces: ['application/json'],
    tags: [
      { name: 'templates', description: 'Template management endpoints' },
    ],
  },
});

await fastify.register(swaggerUi, {
  routePrefix: '/documentation',
  uiConfig: {
    docExpansion: 'list',
    deepLinking: false,
  },
  staticCSP: true,
  transformStaticCSP: (header) => header,
});

// Register custom plugins
await fastify.register(prismaPlugin);
await fastify.register(redisPlugin);
await fastify.register(correlationIdPlugin);

// Health check endpoint
fastify.get('/health', async (request, reply) => {
  const health = {
    success: true,
    message: 'Template service is healthy',
    timestamp: new Date().toISOString(),
    services: {
      database: 'unknown',
      redis: 'unknown',
    },
  };

  try {
    // Check PostgreSQL connection
    await fastify.prisma.$queryRaw`SELECT 1`;
    health.services.database = 'connected';
  } catch (error) {
    request.log.error('Database health check failed:', error);
    health.services.database = 'disconnected';
    health.success = false;
  }

  try {
    // Check Redis connection
    await fastify.redis.ping();
    health.services.redis = 'connected';
  } catch (error) {
    request.log.error('Redis health check failed:', error);
    health.services.redis = 'disconnected';
    health.success = false;
  }

  const statusCode = health.success ? 200 : 503;
  return reply.status(statusCode).send(health);
});

// Register API routes
await fastify.register(templateRoutes, { prefix: '/api/v1/templates' });

// 404 handler
fastify.setNotFoundHandler((request, reply) => {
  reply.status(404).send({
    success: false,
    message: 'Route not found',
  });
});

// Global error handler
fastify.setErrorHandler((error, request, reply) => {
  fastify.log.error(error);

  // Handle validation errors
  if (error.validation) {
    return reply.status(400).send({
      success: false,
      message: 'Validation failed',
      errors: error.validation,
    });
  }

  // Handle Prisma errors
  if (error.code?.startsWith('P')) {
    return reply.status(400).send({
      success: false,
      message: 'Database error',
      error: error.message,
    });
  }

  // Default error response
  reply.status(error.statusCode || 500).send({
    success: false,
    message: error.message || 'Internal server error',
  });
});

// Start server
const start = async () => {
  try {
    const port = parseInt(process.env.PORT || '3002', 10);
    const host = process.env.HOST || '0.0.0.0';

    await fastify.listen({ port, host });
    
    fastify.log.info(`Template service listening on ${host}:${port}`);
    fastify.log.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
    fastify.log.info(`API Documentation available at http://${host}:${port}/documentation`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

// Handle graceful shutdown
const closeGracefully = async (signal) => {
  fastify.log.info(`Received signal ${signal}, closing gracefully...`);
  await fastify.close();
  process.exit(0);
};

process.on('SIGINT', () => closeGracefully('SIGINT'));
process.on('SIGTERM', () => closeGracefully('SIGTERM'));

start();
