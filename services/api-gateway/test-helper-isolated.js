import fastify from 'fastify';
import fp from 'fastify-plugin';
import { randomUUID } from 'crypto';

// Inline createResponse function to avoid import issues
const createResponse = (success, message, data, error, meta) => {
  const response = { success, message };
  if (data !== undefined) response.data = data;
  if (error !== undefined) response.error = error;
  if (meta !== undefined) response.meta = meta;
  return response;
};

/**
 * Create a completely isolated test server
 * This approach avoids any potential conflicts with global state
 */
export async function createIsolatedTestServer(options = {}) {
  const {
    env = {},
    logger = {},
    skipAuth = false
  } = options;

  // Set environment variables for testing
  const originalEnv = { ...process.env };
  Object.assign(process.env, {
    NODE_ENV: 'test',
    LOG_LEVEL: 'error',
    ...env
  });

  // Create a completely isolated Fastify instance
  const server = fastify({
    logger: {
      level: logger.level || 'error',
      prettyPrint: logger.prettyPrint || false,
      timestamp: logger.timestamp !== false,
      hostname: false,
      pid: false,
    },
  });

  // In-memory mock implementations
  const mockRedis = {
    data: new Map(),
    get: async (key) => mockRedis.data.get(key) || null,
    set: async (key, value, options) => {
      mockRedis.data.set(key, value);
      return 'OK';
    },
    setex: async (key, ttl, value) => {
      mockRedis.data.set(key, value);
      return 'OK';
    },
    del: async (key) => {
      const existed = mockRedis.data.has(key);
      mockRedis.data.delete(key);
      return existed ? 1 : 0;
    },
    keys: async (pattern) => {
      const regex = new RegExp(pattern.replace(/\*/g, '.*'));
      return Array.from(mockRedis.data.keys()).filter(key => regex.test(key));
    },
    ping: async () => 'PONG',
    quit: async () => 'OK'
  };

  const mockConsul = {
    catalog: {
      service: {
        nodes: async (serviceName) => []
      }
    },
    agent: {
      service: {
        register: async () => true,
        deregister: async () => true
      }
    },
    status: {
      leader: async () => '127.0.0.1'
    }
  };

  const mockRabbitmq = {
    connection: null,
    channel: null,
    messages: [],
    
    connect: async () => {
      mockRabbitmq.connection = { connected: true };
      mockRabbitmq.channel = { connected: true };
      return mockRabbitmq.connection;
    },
    
    publish: async (exchange, routingKey, message, options) => {
      mockRabbitmq.messages.push({
        exchange,
        routingKey,
        message: JSON.parse(message.toString()),
        options,
        timestamp: new Date().toISOString()
      });
      return true;
    },
    
    close: async () => {
      mockRabbitmq.connection = null;
      mockRabbitmq.channel = null;
    }
  };

  // Directly decorate with mock implementations
  server.decorate('redis', mockRedis);
  server.decorate('consul', mockConsul);
  server.decorate('rabbitmq', { 
    connection: mockRabbitmq.connection,
    channel: mockRabbitmq.channel,
    messages: mockRabbitmq.messages
  });

  // Add all decorators
  server.decorate('getIdempotencyKey', (requestId) => {
    return `idempotency:${requestId}`;
  });

  server.decorate('getCacheKey', (key) => {
    return `cache:${key}`;
  });

  server.decorate('checkIdempotency', async (requestId) => {
    try {
      const key = server.getIdempotencyKey(requestId);
      const cached = await server.redis.get(key);
      return cached ? JSON.parse(cached) : null;
    } catch (error) {
      server.log.error('Error checking idempotency:', error);
      return null;
    }
  });

  server.decorate('storeIdempotency', async (requestId, response, ttl = 86400) => {
    try {
      const key = server.getIdempotencyKey(requestId);
      await server.redis.setex(key, ttl, JSON.stringify(response));
      return true;
    } catch (error) {
      server.log.error('Error storing idempotency:', error);
      return false;
    }
  });

  server.decorate('getNotificationStatusKey', (notificationId) => {
    return `notification_status:${notificationId}`;
  });

  server.decorate('storeNotificationStatus', async (notificationId, statusData, ttl = 604800) => {
    try {
      const key = server.getNotificationStatusKey(notificationId);
      await server.redis.setex(key, ttl, JSON.stringify(statusData));
      return true;
    } catch (error) {
      server.log.error('Error storing notification status:', error);
      return false;
    }
  });

  server.decorate('getNotificationStatus', async (notificationId) => {
    try {
      const key = server.getNotificationStatusKey(notificationId);
      const cached = await server.redis.get(key);
      return cached ? JSON.parse(cached) : null;
    } catch (error) {
      server.log.error('Error retrieving notification status:', error);
      return null;
    }
  });

  server.decorate('checkRedisConnection', async () => {
    try {
      await server.redis.ping();
      return true;
    } catch (error) {
      server.log.error('Redis connection check failed:', error);
      return false;
    }
  });

  server.decorate('checkRabbitMQConnection', async () => {
    return mockRabbitmq.connection !== null;
  });

  server.decorate('publishToQueue', async (routingKey, message, options = {}) => {
    try {
      const messageWithCorrelation = {
        ...message,
        correlation_id: message.correlation_id || options.correlationId || `corr_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        timestamp: new Date().toISOString(),
      };

      mockRabbitmq.messages.push({
        exchange: 'notifications.direct',
        routingKey,
        message: messageWithCorrelation,
        options,
        timestamp: new Date().toISOString()
      });
      
      server.log.debug(`Message published to ${routingKey} with correlation_id: ${messageWithCorrelation.correlation_id}`);
      return { success: true, correlation_id: messageWithCorrelation.correlation_id };
    } catch (error) {
      server.log.error('Error publishing message to RabbitMQ:', error);
      throw error;
    }
  });

  server.decorate('generateCorrelationId', () => {
    return `corr_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  });

  // Mock JWT
  server.decorate('jwt', {
    sign: (payload) => `test-jwt-${JSON.stringify(payload)}`,
    verify: (token) => {
      if (token.startsWith('test-jwt-')) {
        return JSON.parse(token.replace('test-jwt-', ''));
      }
      throw new Error('Invalid token');
    }
  });

  server.decorateRequest('jwtVerify', async function() {
    const authHeader = this.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new Error('Missing Authorization header');
    }
    const token = authHeader.substring(7);
    const decoded = server.jwt.verify(token);
    this.user = decoded;
    return decoded;
  });

  server.decorate('authenticate', async (request, reply) => {
    try {
      await request.jwtVerify();
    } catch (error) {
      reply.code(401).send({
        success: false,
        error: 'Authentication failed',
        message: 'Invalid JWT token'
      });
    }
  });

  // Add correlation ID hooks
  server.addHook('preHandler', async (request, reply) => {
    let correlationId = request.headers['x-correlation-id'];
    if (!correlationId) {
      correlationId = randomUUID();
    }
    request.correlationId = correlationId;
    reply.header('x-correlation-id', correlationId);
  });

  server.addHook('preHandler', async (request) => {
    request.log = request.log.child({ correlationId: request.correlationId });
  });

  // Add routes
  server.post('/api/v1/notifications/', {
    preHandler: [server.authenticate],
    schema: {
      description: 'Create and route notification request',
      tags: ['notifications'],
      body: {
        type: 'object',
        required: ['notification_type', 'user_id', 'template_code', 'variables', 'request_id', 'priority'],
        properties: {
          notification_type: { type: 'string', enum: ['email', 'push'] },
          user_id: { type: 'string' },
          template_code: { type: 'string' },
          variables: { type: 'object' },
          request_id: { type: 'string' },
          priority: { type: 'integer' }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const notificationRequest = request.body;
      const correlationId = request.correlationId;

      // Check for idempotency
      const cachedResponse = await server.checkIdempotency(notificationRequest.request_id);
      
      if (cachedResponse) {
        return reply.status(202).send(cachedResponse);
      }

      // Mock processing
      const response = createResponse(
        true,
        'Notification accepted for processing',
        {
          notification_id: notificationRequest.request_id,
          request_id: notificationRequest.request_id,
          status: 'accepted'
        }
      );

      // Store response for idempotency
      await server.storeIdempotency(notificationRequest.request_id, response);

      return reply.status(202).send(response);
    } catch (error) {
      server.log.error('Error processing notification:', error);
      return reply.status(500).send(createResponse(
        false,
        'Internal server error',
        undefined,
        'An unexpected error occurred'
      ));
    }
  });

  server.get('/api/v1/notifications/:notification_id/status', {
    preHandler: [server.authenticate],
    schema: {
      description: 'Get notification status',
      tags: ['notifications'],
      params: {
        type: 'object',
        required: ['notification_id'],
        properties: {
          notification_id: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { notification_id } = request.params;
      const statusData = await server.getNotificationStatus(notification_id);
      
      if (!statusData) {
        return reply.status(404).send(createResponse(
          false,
          'Notification status not found',
          undefined,
          `No status found for notification ID: ${notification_id}`
        ));
      }

      return reply.status(200).send(createResponse(
        true,
        'Notification status retrieved successfully',
        statusData
      ));
    } catch (error) {
      server.log.error('Error fetching notification status:', error);
      return reply.status(500).send(createResponse(
        false,
        'Internal server error',
        undefined,
        'An unexpected error occurred'
      ));
    }
  });

  // Add health check endpoint
  server.get('/health', async (request, reply) => {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      service: 'api-gateway-test',
      uptime: process.uptime(),
      services: {},
    };

    // Check Redis connection
    if (server.checkRedisConnection) {
      try {
        const redisStatus = await server.checkRedisConnection();
        health.services.redis = {
          status: redisStatus ? 'connected' : 'disconnected',
          connected: redisStatus,
        };
      } catch (error) {
        health.services.redis = {
          status: 'error',
          error: error.message,
          connected: false,
        };
      }
    }

    // Check RabbitMQ connection
    if (server.checkRabbitMQConnection) {
      try {
        const rabbitmqStatus = await server.checkRabbitMQConnection();
        health.services.rabbitmq = {
          status: rabbitmqStatus ? 'connected' : 'disconnected',
          connected: rabbitmqStatus,
        };
      } catch (error) {
        health.services.rabbitmq = {
          status: 'error',
          error: error.message,
          connected: false,
        };
      }
    }

    return health;
  });

  // Basic error handler
  server.setErrorHandler((error, request, reply) => {
    server.log.error(error);
    
    // Handle validation errors
    if (error.validation) {
      return reply.status(400).send(createResponse(
        false,
        'Invalid request',
        undefined,
        error.message
      ));
    }
    
    // Handle authentication errors
    if (error.message.includes('Authorization') || error.message.includes('JWT')) {
      return reply.status(401).send(createResponse(
        false,
        'Authentication failed',
        undefined,
        error.message
      ));
    }
    
    // Default error handler
    reply.status(500).send(createResponse(
      false,
      'An unexpected error occurred',
      undefined,
      'Internal Server Error'
    ));
  });

  // Cleanup function
  const cleanup = async () => {
    try {
      // Restore original environment
      process.env = originalEnv;
      
      // Close server
      await server.close();
    } catch (error) {
      console.error('Error during test server cleanup:', error);
    }
  };

  return { server, cleanup };
}

/**
 * Generate a test JWT token
 */
export function generateTestJWT(userId) {
  // Return a properly formatted JWT token that matches what the server expects
  return `test-jwt-${JSON.stringify({ sub: userId, userId: userId })}`;
}

/**
 * Generate test notification data
 */
export function generateTestNotification(overrides = {}) {
  return {
    notification_type: 'email',
    user_id: 'test-user-id',
    template_code: 'welcome-email',
    variables: {
      name: 'Test User',
      link: 'https://example.com/verify',
      meta: { source: 'test' }
    },
    request_id: randomUUID(),
    priority: 5,
    metadata: { test: true },
    ...overrides
  };
}
