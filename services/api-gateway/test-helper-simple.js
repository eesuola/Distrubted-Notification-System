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

// Mock implementations for testing
const mockImplementations = {
  // Mock Redis implementation
  redis: {
    data: new Map(),
    get: async (key) => mockImplementations.redis.data.get(key) || null,
    set: async (key, value, options) => {
      mockImplementations.redis.data.set(key, value);
      return 'OK';
    },
    setex: async (key, ttl, value) => {
      mockImplementations.redis.data.set(key, value);
      return 'OK';
    },
    del: async (key) => {
      const existed = mockImplementations.redis.data.has(key);
      mockImplementations.redis.data.delete(key);
      return existed ? 1 : 0;
    },
    keys: async (pattern) => {
      const regex = new RegExp(pattern.replace(/\*/g, '.*'));
      return Array.from(mockImplementations.redis.data.keys()).filter(key => regex.test(key));
    },
    ping: async () => 'PONG',
    quit: async () => 'OK'
  },

  // Mock Consul implementation
  consul: {
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
  },

  // Mock RabbitMQ implementation
  rabbitmq: {
    connection: null,
    channel: null,
    messages: [],
    
    connect: async () => {
      mockImplementations.rabbitmq.connection = { connected: true };
      mockImplementations.rabbitmq.channel = { connected: true };
      return mockImplementations.rabbitmq.connection;
    },
    
    publish: async (exchange, routingKey, message, options) => {
      mockImplementations.rabbitmq.messages.push({
        exchange,
        routingKey,
        message: JSON.parse(message.toString()),
        options,
        timestamp: new Date().toISOString()
      });
      return true;
    },
    
    close: async () => {
      mockImplementations.rabbitmq.connection = null;
      mockImplementations.rabbitmq.channel = null;
    }
  }
};

/**
 * Mock Redis plugin for testing
 */
async function mockRedisPlugin(fastify, options) {
  // Directly decorate with mock Redis client
  fastify.decorate('redis', mockImplementations.redis);

  // Add all the same decorators as the real Redis plugin
  fastify.decorate('getIdempotencyKey', (requestId) => {
    return `idempotency:${requestId}`;
  });

  fastify.decorate('getCacheKey', (key) => {
    return `cache:${key}`;
  });

  fastify.decorate('checkIdempotency', async (requestId) => {
    try {
      const key = fastify.getIdempotencyKey(requestId);
      const cached = await fastify.redis.get(key);
      return cached ? JSON.parse(cached) : null;
    } catch (error) {
      fastify.log.error('Error checking idempotency:', error);
      return null;
    }
  });

  fastify.decorate('storeIdempotency', async (requestId, response, ttl = 86400) => {
    try {
      const key = fastify.getIdempotencyKey(requestId);
      await fastify.redis.setex(key, ttl, JSON.stringify(response));
      return true;
    } catch (error) {
      fastify.log.error('Error storing idempotency:', error);
      return false;
    }
  });

  fastify.decorate('cacheResponse', async (key, data, ttl = 86400) => {
    try {
      const cacheKey = fastify.getCacheKey(key);
      await fastify.redis.setex(cacheKey, ttl, JSON.stringify(data));
      return true;
    } catch (error) {
      fastify.log.error('Error caching response:', error);
      return false;
    }
  });

  fastify.decorate('getCachedResponse', async (key) => {
    try {
      const cacheKey = fastify.getCacheKey(key);
      const cached = await fastify.redis.get(cacheKey);
      return cached ? JSON.parse(cached) : null;
    } catch (error) {
      fastify.log.error('Error retrieving cached response:', error);
      return null;
    }
  });

  fastify.decorate('invalidateCache', async (key) => {
    try {
      const cacheKey = fastify.getCacheKey(key);
      await fastify.redis.del(cacheKey);
      return true;
    } catch (error) {
      fastify.log.error('Error invalidating cache:', error);
      return false;
    }
  });

  fastify.decorate('invalidateCachePattern', async (pattern) => {
    try {
      const fullPattern = fastify.getCacheKey(pattern);
      const keys = await fastify.redis.keys(`${fullPattern}*`);
      
      if (keys.length > 0) {
        await fastify.redis.del(keys);
      }
      
      return true;
    } catch (error) {
      fastify.log.error('Error invalidating cache pattern:', error);
      return false;
    }
  });

  fastify.decorate('getNotificationStatusKey', (notificationId) => {
    return `notification_status:${notificationId}`;
  });

  fastify.decorate('storeNotificationStatus', async (notificationId, statusData, ttl = 604800) => {
    try {
      const key = fastify.getNotificationStatusKey(notificationId);
      await fastify.redis.setex(key, ttl, JSON.stringify(statusData));
      return true;
    } catch (error) {
      fastify.log.error('Error storing notification status:', error);
      return false;
    }
  });

  fastify.decorate('getNotificationStatus', async (notificationId) => {
    try {
      const key = fastify.getNotificationStatusKey(notificationId);
      const cached = await fastify.redis.get(key);
      return cached ? JSON.parse(cached) : null;
    } catch (error) {
      fastify.log.error('Error retrieving notification status:', error);
      return null;
    }
  });

  fastify.decorate('checkRedisConnection', async () => {
    try {
      await fastify.redis.ping();
      return true;
    } catch (error) {
      fastify.log.error('Redis connection check failed:', error);
      return false;
    }
  });

  // Add onReady hook to simulate Redis connection
  fastify.addHook('onReady', async () => {
    try {
      await fastify.redis.ping();
      fastify.log.info('Mock Redis connection established successfully');
    } catch (error) {
      fastify.log.error('Failed to connect to mock Redis:', error);
    }
  });

  fastify.log.info('Mock Redis plugin loaded successfully');
}

/**
 * Mock Consul plugin for testing
 */
async function mockConsulPlugin(fastify, options) {
  // Decorate fastify instance with mock consul client
  fastify.decorate('consul', mockImplementations.consul);

  // Mock service discovery methods
  const serviceDiscovery = {
    async getServiceUrl(serviceName) {
      const mockUrls = {
        'user-service': 'http://localhost:3001',
        'email-service': 'http://localhost:3002',
        'push-service': 'http://localhost:3003',
        'template-service': 'http://localhost:3004'
      };
      
      if (mockUrls[serviceName]) {
        return mockUrls[serviceName];
      }
      
      throw new Error(`Service ${serviceName} not found in mock Consul`);
    },

    async getAllServiceInstances(serviceName) {
      return [];
    },

    async registerService(serviceConfig) {
      fastify.log.info(`Mock service ${serviceConfig.name} registered with Consul`);
      return true;
    },

    async deregisterService(serviceId) {
      fastify.log.info(`Mock service ${serviceId} deregistered from Consul`);
      return true;
    },

    async checkServiceHealth(serviceName) {
      return { healthy: true, message: 'Mock service is healthy' };
    }
  };

  fastify.decorate('serviceDiscovery', serviceDiscovery);

  // Add onReady hook
  fastify.addHook('onReady', async () => {
    try {
      await serviceDiscovery.registerService({
        name: 'api-gateway',
        port: 3000,
        meta: {
          protocol: 'http',
          version: '1.0.0',
          description: 'API Gateway for distributed notification system',
        },
      });
    } catch (error) {
      fastify.log.warn('Failed to register with mock Consul:', error.message);
    }
  });

  fastify.log.info('Mock Consul plugin loaded successfully');
}

/**
 * Mock RabbitMQ plugin for testing
 */
async function mockRabbitmqPlugin(fastify, options) {
  // Decorator to publish messages to queue
  fastify.decorate('publishToQueue', async (routingKey, message, options = {}) => {
    try {
      // Ensure correlation_id is included in message
      const messageWithCorrelation = {
        ...message,
        correlation_id: message.correlation_id || options.correlationId || fastify.generateCorrelationId(),
        timestamp: new Date().toISOString(),
      };

      // Store message in mock
      mockImplementations.rabbitmq.publish(
        'notifications.direct',
        routingKey,
        Buffer.from(JSON.stringify(messageWithCorrelation)),
        options
      );
      
      fastify.log.debug(`Mock message published to ${routingKey} with correlation_id: ${messageWithCorrelation.correlation_id}`);
      return { success: true, correlation_id: messageWithCorrelation.correlation_id };
    } catch (error) {
      fastify.log.error('Error publishing message to mock RabbitMQ:', error);
      throw error;
    }
  });

  fastify.decorate('setupRabbitMQQueues', async () => {
    return true;
  });

  fastify.decorate('checkRabbitMQConnection', async () => {
    return mockImplementations.rabbitmq.connection !== null;
  });

  fastify.decorate('closeRabbitMQConnection', async () => {
    await mockImplementations.rabbitmq.close();
    fastify.log.info('Mock RabbitMQ connection closed successfully');
    return true;
  });

  fastify.decorate('generateCorrelationId', () => {
    return `corr_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  });

  // Add onReady hook
  fastify.addHook('onReady', async () => {
    try {
      await mockImplementations.rabbitmq.connect();
      fastify.log.info('Mock RabbitMQ connection established successfully');
    } catch (error) {
      fastify.log.error('Failed to connect to mock RabbitMQ during startup:', error);
    }
  });

  // Add onClose hook
  fastify.addHook('onClose', async () => {
    await fastify.closeRabbitMQConnection();
  });

  fastify.log.info('Mock RabbitMQ plugin loaded successfully');
}

/**
 * Mock Auth plugin for testing
 */
async function mockAuthPlugin(fastify, options) {
  // Mock JWT plugin
  fastify.decorate('jwt', {
    sign: (payload) => `fallback-jwt-${JSON.stringify(payload)}`,
    verify: (token) => {
      if (token.startsWith('fallback-jwt-')) {
        return JSON.parse(token.replace('fallback-jwt-', ''));
      }
      if (token.startsWith('test-jwt-token-')) {
        const userId = token.replace('test-jwt-token-', '');
        return { sub: userId, userId: userId };
      }
      throw new Error('Invalid token');
    }
  });

  fastify.decorateRequest('jwtVerify', async function() {
    const authHeader = this.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new Error('Missing Authorization header');
    }
    const token = authHeader.substring(7);
    const decoded = fastify.jwt.verify(token);
    this.user = decoded;
    return decoded;
  });

  fastify.decorate('authenticate', async (request, reply) => {
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

  fastify.decorate('generateToken', (payload) => {
    return fastify.jwt.sign(payload);
  });

  fastify.log.info('Mock Auth plugin loaded successfully');
}

/**
 * Mock correlation ID plugin for testing
 */
async function mockCorrelationIdPlugin(fastify, options) {
  fastify.addHook('preHandler', async (request, reply) => {
    let correlationId = request.headers['x-correlation-id'];
    if (!correlationId) {
      correlationId = randomUUID();
    }
    request.correlationId = correlationId;
    reply.header('x-correlation-id', correlationId);
  });

  fastify.addHook('preHandler', async (request) => {
    request.log = request.log.child({ correlationId: request.correlationId });
  });
}

/**
 * Mock notification routes for testing
 */
async function mockNotificationRoutes(fastify, options) {
  // POST /api/v1/notifications/
  fastify.post('/api/v1/notifications/', {
    preHandler: [fastify.authenticate],
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
      const cachedResponse = await fastify.checkIdempotency(notificationRequest.request_id);
      
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
      await fastify.storeIdempotency(notificationRequest.request_id, response);

      return reply.status(202).send(response);
    } catch (error) {
      fastify.log.error('Error processing notification:', error);
      return reply.status(500).send(createResponse(
        false,
        'Internal server error',
        undefined,
        'An unexpected error occurred'
      ));
    }
  });

  // GET /api/v1/notifications/:notification_id/status
  fastify.get('/api/v1/notifications/:notification_id/status', {
    preHandler: [fastify.authenticate],
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
      const statusData = await fastify.getNotificationStatus(notification_id);
      
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
      fastify.log.error('Error fetching notification status:', error);
      return reply.status(500).send(createResponse(
        false,
        'Internal server error',
        undefined,
        'An unexpected error occurred'
      ));
    }
  });
}

/**
 * Create a test server with mocked dependencies
 * @param {Object} options - Configuration options
 * @returns {Promise<Object>} - Fastify server instance and cleanup function
 */
export async function createMockServer(options = {}) {
  const {
    env = {},
    logger = {},
    skipAuth = false
  } = options;

  // Set environment variables for testing
  const originalEnv = { ...process.env };
  Object.assign(process.env, {
    NODE_ENV: 'test',
    LOG_LEVEL: 'error', // Reduce log noise in tests
    ...env
  });

  // Create Fastify instance with test configuration
  const server = fastify({
    logger: {
      level: logger.level || 'error',
      prettyPrint: logger.prettyPrint || false,
      timestamp: logger.timestamp !== false,
      hostname: false,
      pid: false,
    },
  });

  // Cleanup function
  const cleanup = async () => {
    try {
      // Restore original environment
      process.env = originalEnv;
      
      // Close server
      await server.close();
      
      // Clear mock data
      mockImplementations.redis.data.clear();
      mockImplementations.rabbitmq.messages = [];
    } catch (error) {
      console.error('Error during test server cleanup:', error);
    }
  };

  try {
    // Register plugins in correct order
    // This order is critical to prevent race conditions
    
    // 1. Register core infrastructure plugins first
    await server.register(fp(mockCorrelationIdPlugin));
    server.log.info('Correlation ID plugin registered');
    
    // 2. Register Redis plugin
    await server.register(fp(mockRedisPlugin), { name: 'redis' });
    server.log.info('Redis plugin registered');
    
    // 3. Register Consul plugin
    await server.register(fp(mockConsulPlugin), { name: 'consul' });
    server.log.info('Consul plugin registered');
    
    // 4. Register RabbitMQ plugin
    await server.register(fp(mockRabbitmqPlugin), { name: 'rabbitmq' });
    server.log.info('RabbitMQ plugin registered');
    
    // 5. Register authentication plugin (optional)
    if (!skipAuth) {
      await server.register(fp(mockAuthPlugin), { name: 'auth' });
      server.log.info('Authentication plugin registered');
    }
    
    // CRITICAL: Wait for server.ready() to ensure all onReady hooks complete
    // This prevents race conditions where routes are registered before plugins are fully initialized
    await server.ready();
    server.log.info('All plugins and hooks completed successfully');
    
    // 6. Register notification routes after all plugins are fully loaded
    await server.register(fp(mockNotificationRoutes), { prefix: '/api/v1' });
    server.log.info('Notification routes registered');
    
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
      reply.status(500).send(createResponse(
        false,
        'An unexpected error occurred',
        undefined,
        'Internal Server Error'
      ));
    });

    return { server, cleanup };
  } catch (error) {
    // Cleanup on error
    await cleanup();
    throw error;
  }
}

/**
 * Wait for server to be fully ready
 * This utility ensures all plugins and routes are properly loaded
 * @param {Object} server - Fastify server instance
 * @param {number} timeout - Maximum time to wait in milliseconds (default: 5000)
 * @returns {Promise<void>}
 */
export async function waitForServerReady(server, timeout = 5000) {
  const startTime = Date.now();
  
  return new Promise((resolve, reject) => {
    const checkReady = async () => {
      try {
        // Check if server is ready
        if (server.ready) {
          await server.ready();
          resolve();
          return;
        }
        
        // Check timeout
        if (Date.now() - startTime > timeout) {
          reject(new Error(`Server not ready within ${timeout}ms`));
          return;
        }
        
        // Check again after a short delay
        setTimeout(checkReady, 50);
      } catch (error) {
        reject(error);
      }
    };
    
    checkReady();
  });
}

/**
 * Generate a test JWT token
 * @param {string} userId - User ID for token
 * @returns {string} - Mock JWT token
 */
export function generateTestJWT(userId) {
  return `test-jwt-token-${userId}`;
}

/**
 * Generate test notification data
 * @param {Object} overrides - Override default values
 * @returns {Object} - Test notification data
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

/**
 * Get mock data for testing
 * @returns {Object} - Mock implementations
 */
export function getMockData() {
  return mockImplementations;
}

/**
 * Reset mock data between tests
 */
export function resetMockData() {
  mockImplementations.redis.data.clear();
  mockImplementations.rabbitmq.messages = [];
}

export default {
  createMockServer,
  waitForServerReady,
  generateTestJWT,
  generateTestNotification,
  getMockData,
  resetMockData
};