import Fastify from 'fastify';
import cors from '@fastify/cors';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Import plugins
import prismaPlugin from './plugins/prisma.js';
import authPlugin from './plugins/auth.js';
import correlationIdPlugin from './plugins/correlation-id.js';
import consulPlugin from './plugins/consul.js';

// Import routes
import userRoutes from './routes/users.js';

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
      title: 'User Service API',
      description: 'API documentation for the User Service',
      version: '0.1.0',
    },
    host: process.env.SWAGGER_HOST || 'localhost:3001',
    schemes: ['http', 'https'],
    consumes: ['application/json'],
    produces: ['application/json'],
    tags: [
      { name: 'users', description: 'User management endpoints' },
    ],
    securityDefinitions: {
      Bearer: {
        type: 'apiKey',
        name: 'Authorization',
        in: 'header',
        description: 'JWT authorization header using the Bearer scheme. Example: "Bearer {token}"',
      },
    },
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
await fastify.register(correlationIdPlugin);
await fastify.register(prismaPlugin);
await fastify.register(authPlugin);
await fastify.register(consulPlugin);

// Health check endpoint with database connectivity check
fastify.get('/health', async (request, reply) => {
  try {
    // Check database connectivity by executing a simple query
    await fastify.prisma.$queryRaw`SELECT 1`;
    
    request.log.info('Health check passed');
    
    return reply.status(200).send({
      status: 'ok',
      timestamp: new Date().toISOString(),
      database: 'connected',
    });
  } catch (error) {
    request.log.error({ err: error }, 'Health check failed - database connection error');
    
    return reply.status(503).send({
      status: 'error',
      timestamp: new Date().toISOString(),
      database: 'disconnected',
      error: error.message,
    });
  }
});

// Register API routes
await fastify.register(userRoutes, { prefix: '/api/v1/users' });

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
    const port = parseInt(process.env.PORT || '3001', 10);
    const host = process.env.HOST || '0.0.0.0';

    await fastify.listen({ port, host });
    
    fastify.log.info(`User service listening on ${host}:${port}`);
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
