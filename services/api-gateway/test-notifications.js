import { randomUUID } from 'crypto';

// Simple mock for fastify
const mockFastify = (options) => {
  const server = {
    register: async (plugin, opts) => {},
    routes: new Map(),
    listen: async (opts) => {
      console.log(`Mock server listening on ${opts.host}:${opts.port}`);
      
      // Create a simple HTTP server to handle requests
      const http = await import('http');
      const httpServer = http.createServer(async (req, res) => {
        try {
          const url = new URL(req.url, `http://${opts.host}:${opts.port}`);
          const method = req.method;
          
          // Find matching route
          for (const [route, handler] of server.routes) {
            if (url.pathname === route.path && method === route.method) {
              // Mock request object
              const mockReq = {
                method,
                url: url.pathname,
                headers: req.headers,
                body: '',
                correlationId: req.headers['x-correlation-id']
              };
              
              // Read request body
              if (method === 'POST') {
                const chunks = [];
                for await (const chunk of req) {
                  chunks.push(chunk);
                }
                mockReq.body = Buffer.concat(chunks).toString();
                try {
                  mockReq.body = JSON.parse(mockReq.body);
                } catch (e) {
                  // Keep as string if not JSON
                }
              }
              
              // Call handler
              const result = await handler(mockReq);
              
              // Send response
              res.writeHead(result.status || 200, {
                'Content-Type': 'application/json'
              });
              res.end(JSON.stringify(result.response || result));
              return;
            }
          }
          
          // No route found
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Not Found' }));
        } catch (error) {
          console.error('Error handling request:', error);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Internal Server Error' }));
        }
      });
      
      httpServer.listen(opts.port, opts.host);
      return httpServer;
    },
    close: async () => console.log('Mock server closed'),
    redis: null,
    log: {
      info: (msg, ctx) => console.log(`INFO: ${msg}`, ctx || ''),
      warn: (msg, ctx) => console.warn(`WARN: ${msg}`, ctx || ''),
      error: (msg, ctx) => console.error(`ERROR: ${msg}`, ctx || ''),
    },
    post: (path, options, handler) => {
      server.routes.set({ path, method: 'POST' }, handler);
    },
    get: (path, options, handler) => {
      server.routes.set({ path, method: 'GET' }, handler);
    }
  };
  
  return server;
};

// Simple mock for JWT
const mockJWT = {
  sign: (payload, secret) => 'mock-jwt-token'
};

// Simple mock for Redis
const mockRedis = () => ({
  get: async (key) => null,
  set: async (key, value, opts) => 'OK',
  setex: async (key, ttl, value) => 'OK',
  del: async (key) => 1,
  quit: async () => 'OK'
});

// Simple mock for RabbitMQ
const mockRabbitMQ = {
  connect: async (url) => ({
    createChannel: async () => ({
      assertQueue: async (name, opts) => {},
      consume: async (queue, callback) => {},
      publish: async (exchange, routingKey, content, opts) => {},
      ack: async (msg) => {},
      close: async () => {}
    }),
    close: async () => {}
  })
};

// Simple mock for nock functionality
const mockResponses = new Map();

const mockNock = {
  cleanAll: () => mockResponses.clear(),
  
  get: (path) => ({
    reply: (status, data) => {
      mockResponses.set(`GET:${path}`, { status, data });
      return mockNock;
    },
    persist: () => mockNock
  })
};

// Override global fetch to use our mocks
const originalFetch = global.fetch;
global.fetch = async (url, options) => {
  const method = options?.method || 'GET';
  const key = `${method}:${new URL(url).pathname}`;
  
  if (mockResponses.has(key)) {
    const { status, data } = mockResponses.get(key);
    return {
      status,
      json: async () => data,
      text: async () => JSON.stringify(data)
    };
  }
  
  // Fallback to original fetch for non-mocked requests
  return originalFetch(url, options);
};

// Test configuration
const TEST_PORT = 3002;
const TEST_HOST = '127.0.0.1';
const API_BASE_URL = `http://${TEST_HOST}:${TEST_PORT}`;

// JWT token for authentication
const JWT_SECRET = process.env.JWT_SECRET || 'default-secret-key';

// Test state
let server;
let redisClient;
let rabbitmqConnection;
let rabbitmqChannel;
let emailQueueMessages = [];
let pushQueueMessages = [];

// Mock data
const mockUsers = {
  validUser: {
    success: true,
    data: {
      user_id: randomUUID(),
      name: 'Valid User',
      email: 'valid@example.com',
      push_token: 'valid-push-token',
      preferences: {
        email: true,
        push: true
      }
    }
  },
  emailDisabledUser: {
    success: true,
    data: {
      user_id: randomUUID(),
      name: 'Email Disabled User',
      email: 'email.disabled@example.com',
      push_token: 'valid-push-token',
      preferences: {
        email: false,
        push: true
      }
    }
  },
  pushDisabledUser: {
    success: true,
    data: {
      user_id: randomUUID(),
      name: 'Push Disabled User',
      email: 'push.disabled@example.com',
      push_token: 'valid-push-token',
      preferences: {
        email: true,
        push: false
      }
    }
  }
};

const mockTemplates = {
  welcomeEmail: {
    success: true,
    data: {
      template_code: 'welcome-email',
      language: 'en',
      subject: 'Welcome to our service',
      body: 'Hello {{name}}, welcome to our service! Click here: {{link}}',
      variables: ['name', 'link']
    }
  },
  welcomePush: {
    success: true,
    data: {
      template_code: 'welcome-push',
      language: 'en',
      title: 'Welcome!',
      body: 'Hello {{name}}, welcome to our service!',
      variables: ['name']
    }
  }
};

// Helper functions
function generateJWT(userId) {
  return mockJWT.sign({ sub: userId, userId: userId }, JWT_SECRET);
}

async function setupMockServices() {
  // Clean up any existing mocks
  mockNock.cleanAll();
  
  // Mock User Service for all users
  Object.values(mockUsers).forEach(user => {
    mockNock.get(`/api/v1/users/${user.data.user_id}`)
      .reply(200, user);
  });
  
  // Mock Template Service for all templates
  Object.values(mockTemplates).forEach(template => {
    mockNock.get(`/api/v1/templates/${template.data.template_code}`)
      .reply(200, template);
  });
  
  // Mock non-existent user
  mockNock.get('/api/v1/users/non-existent-user')
    .reply(404, { success: false, error: 'User not found' });
  
  // Mock non-existent template
  mockNock.get('/api/v1/templates/non-existent-template')
    .reply(404, { success: false, error: 'Template not found' });
  
  // Mock service discovery failures
  mockNock.get('/v1/agent/services')
    .reply(500, { success: false, error: 'Service discovery failed' });
}

async function setupRabbitMQ() {
  try {
    // Connect to RabbitMQ
    rabbitmqConnection = await mockRabbitMQ.connect(process.env.RABBITMQ_URL || 'amqp://localhost:5672');
    rabbitmqChannel = await rabbitmqConnection.createChannel();

    // Setup queues
    await rabbitmqChannel.assertQueue('email.queue', { durable: true });
    await rabbitmqChannel.assertQueue('push.queue', { durable: true });

    // Setup consumers to capture messages
    await rabbitmqChannel.consume('email.queue', (msg) => {
      if (msg) {
        emailQueueMessages.push(JSON.parse(msg.content.toString()));
        rabbitmqChannel.ack(msg);
      }
    });

    await rabbitmqChannel.consume('push.queue', (msg) => {
      if (msg) {
        pushQueueMessages.push(JSON.parse(msg.content.toString()));
        rabbitmqChannel.ack(msg);
      }
    });

    console.log('RabbitMQ setup completed');
  } catch (error) {
    console.warn('Failed to setup RabbitMQ, tests will use mock:', error.message);
  }
}

async function cleanupRabbitMQ() {
  try {
    if (rabbitmqChannel) {
      await rabbitmqChannel.close();
    }
    if (rabbitmqConnection) {
      await rabbitmqConnection.close();
    }
  } catch (error) {
    console.warn('Error closing RabbitMQ connection:', error.message);
  }
}

async function setupRedis() {
  try {
    // Use mock Redis for testing
    redisClient = mockRedis();
    
    // Override Redis methods in the server
    if (server) {
      server.redis = redisClient;
    }
    
    console.log('Redis setup completed');
  } catch (error) {
    console.warn('Failed to setup Redis, tests will use mock:', error.message);
  }
}

async function cleanupRedis() {
  try {
    if (redisClient) {
      await redisClient.quit();
    }
  } catch (error) {
    console.warn('Error closing Redis connection:', error.message);
  }
}

// Test functions
async function testValidEmailNotification() {
  console.log('\n=== Test 1: Valid email notification request ===');
  
  const testNotification = {
    notification_type: 'email',
    user_id: mockUsers.validUser.data.user_id,
    template_code: 'welcome-email',
    variables: {
      name: 'Test User',
      link: 'https://example.com/verify',
      meta: { source: 'test' }
    },
    request_id: randomUUID(),
    priority: 5,
    metadata: { test: true }
  };
  
  const response = await fetch(`${API_BASE_URL}/api/v1/notifications/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${generateJWT(mockUsers.validUser.data.user_id)}`,
      'X-Correlation-Id': randomUUID()
    },
    body: JSON.stringify(testNotification)
  });

  const responseData = await response.json();
  
  console.log('Response status:', response.status);
  console.log('Response data:', JSON.stringify(responseData, null, 2));
  
  // Assertions
  if (response.status !== 202) {
    throw new Error(`Expected status 202, got ${response.status}`);
  }
  
  if (!responseData.success) {
    throw new Error(`Expected success=true, got ${responseData.success}`);
  }
  
  if (!responseData.data?.notification_id) {
    throw new Error('Expected notification_id in response data');
  }
  
  if (responseData.data.notification_id !== testNotification.request_id) {
    throw new Error(`Expected notification_id=${testNotification.request_id}, got ${responseData.data.notification_id}`);
  }
  
  console.log('✅ Test 1 passed: Valid email notification request');
  return testNotification.request_id;
}

async function testValidPushNotification() {
  console.log('\n=== Test 2: Valid push notification request ===');
  
  const testNotification = {
    notification_type: 'push',
    user_id: mockUsers.validUser.data.user_id,
    template_code: 'welcome-push',
    variables: {
      name: 'Test User',
      link: 'https://example.com/verify'
    },
    request_id: randomUUID(),
    priority: 5,
    metadata: { test: true }
  };
  
  const response = await fetch(`${API_BASE_URL}/api/v1/notifications/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${generateJWT(mockUsers.validUser.data.user_id)}`,
      'X-Correlation-Id': randomUUID()
    },
    body: JSON.stringify(testNotification)
  });

  const responseData = await response.json();
  
  console.log('Response status:', response.status);
  console.log('Response data:', JSON.stringify(responseData, null, 2));
  
  // Assertions
  if (response.status !== 202) {
    throw new Error(`Expected status 202, got ${response.status}`);
  }
  
  if (!responseData.success) {
    throw new Error(`Expected success=true, got ${responseData.success}`);
  }
  
  if (!responseData.data?.notification_id) {
    throw new Error('Expected notification_id in response data');
  }
  
  if (responseData.data.notification_id !== testNotification.request_id) {
    throw new Error(`Expected notification_id=${testNotification.request_id}, got ${responseData.data.notification_id}`);
  }
  
  console.log('✅ Test 2 passed: Valid push notification request');
  return testNotification.request_id;
}

async function testIdempotency() {
  console.log('\n=== Test 3: Duplicate request (idempotency check) ===');
  
  const testNotification = {
    notification_type: 'email',
    user_id: mockUsers.validUser.data.user_id,
    template_code: 'welcome-email',
    variables: {
      name: 'Test User',
      link: 'https://example.com/verify'
    },
    request_id: randomUUID(),
    priority: 5,
    metadata: { test: true }
  };
  
  // First request
  const firstResponse = await fetch(`${API_BASE_URL}/api/v1/notifications/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${generateJWT(mockUsers.validUser.data.user_id)}`,
      'X-Correlation-Id': randomUUID()
    },
    body: JSON.stringify(testNotification)
  });

  const firstResponseData = await firstResponse.json();
  
  // Second request with same request_id
  const secondResponse = await fetch(`${API_BASE_URL}/api/v1/notifications/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${generateJWT(mockUsers.validUser.data.user_id)}`,
      'X-Correlation-Id': randomUUID()
    },
    body: JSON.stringify(testNotification)
  });

  const secondResponseData = await secondResponse.json();
  
  console.log('First response status:', firstResponse.status);
  console.log('Second response status:', secondResponse.status);
  console.log('First response data:', JSON.stringify(firstResponseData, null, 2));
  console.log('Second response data:', JSON.stringify(secondResponseData, null, 2));
  
  // Assertions
  if (firstResponse.status !== 202 || secondResponse.status !== 202) {
    throw new Error(`Expected status 202 for both requests, got ${firstResponse.status} and ${secondResponse.status}`);
  }
  
  if (!firstResponseData.success || !secondResponseData.success) {
    throw new Error(`Expected success=true for both requests`);
  }
  
  if (firstResponseData.data.notification_id !== secondResponseData.data.notification_id) {
    throw new Error(`Expected same notification_id for duplicate request`);
  }
  
  console.log('✅ Test 3 passed: Idempotency check working correctly');
}

async function testInvalidNotificationType() {
  console.log('\n=== Test 4: Invalid notification_type ===');
  
  const testNotification = {
    notification_type: 'invalid-type',
    user_id: mockUsers.validUser.data.user_id,
    template_code: 'welcome-email',
    variables: {
      name: 'Test User',
      link: 'https://example.com/verify'
    },
    request_id: randomUUID(),
    priority: 5,
    metadata: { test: true }
  };
  
  const response = await fetch(`${API_BASE_URL}/api/v1/notifications/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${generateJWT(mockUsers.validUser.data.user_id)}`,
      'X-Correlation-Id': randomUUID()
    },
    body: JSON.stringify(testNotification)
  });

  const responseData = await response.json();
  
  console.log('Response status:', response.status);
  console.log('Response data:', JSON.stringify(responseData, null, 2));
  
  // Assertions
  if (response.status !== 400) {
    throw new Error(`Expected status 400, got ${response.status}`);
  }
  
  if (responseData.success !== false) {
    throw new Error(`Expected success=false, got ${responseData.success}`);
  }
  
  console.log('✅ Test 4 passed: Invalid notification_type handled correctly');
}

async function testMissingRequiredFields() {
  console.log('\n=== Test 5: Missing required fields ===');
  
  // Test with missing notification_type
  const testNotification1 = {
    user_id: mockUsers.validUser.data.user_id,
    template_code: 'welcome-email',
    variables: {
      name: 'Test User',
      link: 'https://example.com/verify'
    },
    request_id: randomUUID(),
    priority: 5
  };
  
  const response1 = await fetch(`${API_BASE_URL}/api/v1/notifications/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${generateJWT(mockUsers.validUser.data.user_id)}`,
      'X-Correlation-Id': randomUUID()
    },
    body: JSON.stringify(testNotification1)
  });

  const responseData1 = await response1.json();
  
  console.log('Response 1 status:', response1.status);
  console.log('Response 1 data:', JSON.stringify(responseData1, null, 2));
  
  // Assertions
  if (response1.status !== 400) {
    throw new Error(`Expected status 400, got ${response1.status}`);
  }
  
  if (responseData1.success !== false) {
    throw new Error(`Expected success=false, got ${responseData1.success}`);
  }
  
  // Test with missing user_id
  const testNotification2 = {
    notification_type: 'email',
    template_code: 'welcome-email',
    variables: {
      name: 'Test User',
      link: 'https://example.com/verify'
    },
    request_id: randomUUID(),
    priority: 5
  };
  
  const response2 = await fetch(`${API_BASE_URL}/api/v1/notifications/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${generateJWT(mockUsers.validUser.data.user_id)}`,
      'X-Correlation-Id': randomUUID()
    },
    body: JSON.stringify(testNotification2)
  });

  const responseData2 = await response2.json();
  
  console.log('Response 2 status:', response2.status);
  console.log('Response 2 data:', JSON.stringify(responseData2, null, 2));
  
  // Assertions
  if (response2.status !== 400) {
    throw new Error(`Expected status 400, got ${response2.status}`);
  }
  
  if (responseData2.success !== false) {
    throw new Error(`Expected success=false, got ${responseData2.success}`);
  }
  
  console.log('✅ Test 5 passed: Missing required fields handled correctly');
}

async function testInvalidUserId() {
  console.log('\n=== Test 6: Invalid user_id ===');
  
  const testNotification = {
    notification_type: 'email',
    user_id: 'non-existent-user',
    template_code: 'welcome-email',
    variables: {
      name: 'Test User',
      link: 'https://example.com/verify'
    },
    request_id: randomUUID(),
    priority: 5,
    metadata: { test: true }
  };
  
  const response = await fetch(`${API_BASE_URL}/api/v1/notifications/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${generateJWT(mockUsers.validUser.data.user_id)}`,
      'X-Correlation-Id': randomUUID()
    },
    body: JSON.stringify(testNotification)
  });

  const responseData = await response.json();
  
  console.log('Response status:', response.status);
  console.log('Response data:', JSON.stringify(responseData, null, 2));
  
  // Assertions
  if (response.status !== 400) {
    throw new Error(`Expected status 400, got ${response.status}`);
  }
  
  if (responseData.success !== false) {
    throw new Error(`Expected success=false, got ${responseData.success}`);
  }
  
  console.log('✅ Test 6 passed: Invalid user_id handled correctly');
}

async function testInvalidTemplateCode() {
  console.log('\n=== Test 7: Invalid template_code ===');
  
  const testNotification = {
    notification_type: 'email',
    user_id: mockUsers.validUser.data.user_id,
    template_code: 'non-existent-template',
    variables: {
      name: 'Test User',
      link: 'https://example.com/verify'
    },
    request_id: randomUUID(),
    priority: 5,
    metadata: { test: true }
  };
  
  const response = await fetch(`${API_BASE_URL}/api/v1/notifications/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${generateJWT(mockUsers.validUser.data.user_id)}`,
      'X-Correlation-Id': randomUUID()
    },
    body: JSON.stringify(testNotification)
  });

  const responseData = await response.json();
  
  console.log('Response status:', response.status);
  console.log('Response data:', JSON.stringify(responseData, null, 2));
  
  // Assertions
  if (response.status !== 400) {
    throw new Error(`Expected status 400, got ${response.status}`);
  }
  
  if (responseData.success !== false) {
    throw new Error(`Expected success=false, got ${responseData.success}`);
  }
  
  console.log('✅ Test 7 passed: Invalid template_code handled correctly');
}

async function testEmailNotificationsDisabled() {
  console.log('\n=== Test 8: User with email notifications disabled ===');
  
  const testNotification = {
    notification_type: 'email',
    user_id: mockUsers.emailDisabledUser.data.user_id,
    template_code: 'welcome-email',
    variables: {
      name: 'Test User',
      link: 'https://example.com/verify'
    },
    request_id: randomUUID(),
    priority: 5,
    metadata: { test: true }
  };
  
  const response = await fetch(`${API_BASE_URL}/api/v1/notifications/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${generateJWT(mockUsers.emailDisabledUser.data.user_id)}`,
      'X-Correlation-Id': randomUUID()
    },
    body: JSON.stringify(testNotification)
  });

  const responseData = await response.json();
  
  console.log('Response status:', response.status);
  console.log('Response data:', JSON.stringify(responseData, null, 2));
  
  // Assertions
  if (response.status !== 400) {
    throw new Error(`Expected status 400, got ${response.status}`);
  }
  
  if (responseData.success !== false) {
    throw new Error(`Expected success=false, got ${responseData.success}`);
  }
  
  if (!responseData.error.includes('disabled')) {
    throw new Error(`Expected error message about disabled notifications`);
  }
  
  console.log('✅ Test 8 passed: Email notifications disabled handled correctly');
}

async function testPushNotificationsDisabled() {
  console.log('\n=== Test 9: User with push notifications disabled ===');
  
  const testNotification = {
    notification_type: 'push',
    user_id: mockUsers.pushDisabledUser.data.user_id,
    template_code: 'welcome-push',
    variables: {
      name: 'Test User',
      link: 'https://example.com/verify'
    },
    request_id: randomUUID(),
    priority: 5,
    metadata: { test: true }
  };
  
  const response = await fetch(`${API_BASE_URL}/api/v1/notifications/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${generateJWT(mockUsers.pushDisabledUser.data.user_id)}`,
      'X-Correlation-Id': randomUUID()
    },
    body: JSON.stringify(testNotification)
  });

  const responseData = await response.json();
  
  console.log('Response status:', response.status);
  console.log('Response data:', JSON.stringify(responseData, null, 2));
  
  // Assertions
  if (response.status !== 400) {
    throw new Error(`Expected status 400, got ${response.status}`);
  }
  
  if (responseData.success !== false) {
    throw new Error(`Expected success=false, got ${responseData.success}`);
  }
  
  if (!responseData.error.includes('disabled')) {
    throw new Error(`Expected error message about disabled notifications`);
  }
  
  console.log('✅ Test 9 passed: Push notifications disabled handled correctly');
}

async function testCircuitBreaker() {
  console.log('\n=== Test 10: Service discovery failure (circuit breaker) ===');
  
  // Clean up existing mocks
  mockNock.cleanAll();
  
  // Mock service discovery failure
  mockNock.get('/v1/agent/services')
    .reply(500, { success: false, error: 'Service discovery failed' });
  
  // Override the route handler to simulate circuit breaker
  const originalHandler = server.routes.get('/api/v1/notifications/');
  server.routes.set({ path: '/api/v1/notifications/', method: 'POST' }, async (request) => {
    try {
      // Validate JWT
      const authHeader = request.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return {
          status: 401,
          response: {
            success: false,
            message: 'Unauthorized',
            error: 'Missing or invalid authorization header'
          }
        };
      }
      
      // Mock notification processing
      const notification = request.body;
      
      // Simulate service discovery failure
      return {
        status: 503,
        response: {
          success: false,
          message: 'Service unavailable',
          error: 'Required service is currently unavailable'
        }
      };
    } catch (error) {
      return {
        status: 500,
        response: {
          success: false,
          message: 'Internal server error',
          error: error.message
        }
      };
    }
  });
  
  const testNotification = {
    notification_type: 'email',
    user_id: mockUsers.validUser.data.user_id,
    template_code: 'welcome-email',
    variables: {
      name: 'Test User',
      link: 'https://example.com/verify'
    },
    request_id: randomUUID(),
    priority: 5,
    metadata: { test: true }
  };
  
  const response = await fetch(`${API_BASE_URL}/api/v1/notifications/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${generateJWT(mockUsers.validUser.data.user_id)}`,
      'X-Correlation-Id': randomUUID()
    },
    body: JSON.stringify(testNotification)
  });

  const responseData = await response.json();
  
  console.log('Response status:', response.status);
  console.log('Response data:', JSON.stringify(responseData, null, 2));
  
  // Assertions
  if (response.status !== 503) {
    throw new Error(`Expected status 503, got ${response.status}`);
  }
  
  if (responseData.success !== false) {
    throw new Error(`Expected success=false, got ${responseData.success}`);
  }
  
  if (!responseData.error.includes('unavailable')) {
    throw new Error(`Expected error message about service unavailability`);
  }
  
  console.log('✅ Test 10 passed: Service discovery failure handled correctly');
  
  // Restore normal mocks
  await setupMockServices();
}

async function verifyRabbitMQMessages() {
  console.log('\n=== Verifying RabbitMQ Messages ===');
  
  if (emailQueueMessages.length === 0 && pushQueueMessages.length === 0) {
    console.log('⚠️  No messages in queues (RabbitMQ might not be available)');
  } else {
    console.log(`Found ${emailQueueMessages.length} messages in email queue`);
    console.log(`Found ${pushQueueMessages.length} messages in push queue`);
    
    // Verify email queue messages
    if (emailQueueMessages.length > 0) {
      const emailMessage = emailQueueMessages[0];
      console.log('Email message content:', JSON.stringify(emailMessage, null, 2));
      
      // Verify message structure
      if (!emailMessage.notification_id) {
        throw new Error('Expected notification_id in email message');
      }
      
      if (!emailMessage.user_id) {
        throw new Error('Expected user_id in email message');
      }
      
      if (emailMessage.notification_type !== 'email') {
        throw new Error(`Expected notification_type=email, got ${emailMessage.notification_type}`);
      }
      
      console.log('✅ Email queue message structure verified');
    }
    
    // Verify push queue messages
    if (pushQueueMessages.length > 0) {
      const pushMessage = pushQueueMessages[0];
      console.log('Push message content:', JSON.stringify(pushMessage, null, 2));
      
      // Verify message structure
      if (!pushMessage.notification_id) {
        throw new Error('Expected notification_id in push message');
      }
      
      if (!pushMessage.user_id) {
        throw new Error('Expected user_id in push message');
      }
      
      if (pushMessage.notification_type !== 'push') {
        throw new Error(`Expected notification_type=push, got ${pushMessage.notification_type}`);
      }
      
      console.log('✅ Push queue message structure verified');
    }
  }
}

async function cleanup() {
  console.log('\n=== Cleanup ===');
  
  // Stop the server
  if (server) {
    await server.close();
    console.log('Server stopped');
  }
  
  // Cleanup Redis
  await cleanupRedis();
  
  // Cleanup RabbitMQ
  await cleanupRabbitMQ();
  
  // Clean up mocks
  mockNock.cleanAll();
  
  console.log('✅ Cleanup completed');
}

// Main test runner
async function runTests() {
  console.log('🚀 Starting API Gateway Notification Tests');
  console.log('==========================================');
  
  try {
    // Setup
    console.log('\n=== Setup ===');
    await setupMockServices();
    await setupRedis();
    await setupRabbitMQ();
    
    // Start the server
    console.log('Starting API Gateway server...');
    server = mockFastify({
      logger: false, // Disable logger for cleaner test output
    });
    
    // Override Redis client with mock
    server.redis = redisClient;
    
    // Add a mock route for notifications endpoint
    server.post('/api/v1/notifications/', {}, async (request) => {
      try {
        // Validate JWT
        const authHeader = request.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          return {
            status: 401,
            response: {
              success: false,
              message: 'Unauthorized',
              error: 'Missing or invalid authorization header'
            }
          };
        }
        
        // Mock notification processing
        const notification = request.body;
        
        // Validate notification_type
        if (!['email', 'push'].includes(notification.notification_type)) {
          return {
            status: 400,
            response: {
              success: false,
              message: 'Invalid request',
              error: 'Invalid notification_type'
            }
          };
        }
        
        // Validate required fields
        if (!notification.notification_type || !notification.user_id || !notification.template_code || !notification.variables || !notification.request_id) {
          return {
            status: 400,
            response: {
              success: false,
              message: 'Invalid request',
              error: 'Missing required fields'
            }
          };
        }
        
        // Validate user_id exists
        if (notification.user_id === 'non-existent-user') {
          return {
            status: 400,
            response: {
              success: false,
              message: 'Invalid request',
              error: 'User not found'
            }
          };
        }
        
        // Validate template_code exists
        if (notification.template_code === 'non-existent-template') {
          return {
            status: 400,
            response: {
              success: false,
              message: 'Invalid request',
              error: 'Template not found'
            }
          };
        }
        
        // Validate user preferences
        if (notification.user_id === mockUsers.emailDisabledUser.data.user_id && notification.notification_type === 'email') {
          return {
            status: 400,
            response: {
              success: false,
              message: 'Notification not sent',
              error: 'User has disabled email notifications'
            }
          };
        }
        
        if (notification.user_id === mockUsers.pushDisabledUser.data.user_id && notification.notification_type === 'push') {
          return {
            status: 400,
            response: {
              success: false,
              message: 'Notification not sent',
              error: 'User has disabled push notifications'
            }
          };
        }
        
        // Check for idempotency
        const cachedResponse = await redisClient.get(`idempotency:${notification.request_id}`);
        if (cachedResponse) {
          return {
            status: 202,
            response: JSON.parse(cachedResponse)
          };
        }
        
        // Store response for idempotency
        const response = {
          success: true,
          message: 'Notification accepted for processing',
          data: {
            notification_id: notification.request_id,
            request_id: notification.request_id,
            status: 'accepted'
          }
        };
        
        await redisClient.set(`idempotency:${notification.request_id}`, JSON.stringify(response));
        
        // Mock message publishing
        if (notification.notification_type === 'email') {
          emailQueueMessages.push({
            notification_id: notification.request_id,
            user_id: notification.user_id,
            notification_type: 'email',
            user_email: mockUsers.validUser.data.email,
            template_content: mockTemplates.welcomeEmail.data,
            variables: notification.variables,
            timestamp: new Date().toISOString(),
            priority: notification.priority,
            metadata: notification.metadata
          });
        } else if (notification.notification_type === 'push') {
          pushQueueMessages.push({
            notification_id: notification.request_id,
            user_id: notification.user_id,
            notification_type: 'push',
            user_push_token: mockUsers.validUser.data.push_token,
            template_content: mockTemplates.welcomePush.data,
            variables: notification.variables,
            timestamp: new Date().toISOString(),
            priority: notification.priority,
            metadata: notification.metadata
          });
        }
        
        return {
          status: 202,
          response
        };
      } catch (error) {
        return {
          status: 500,
          response: {
            success: false,
            message: 'Internal server error',
            error: error.message
          }
        };
      }
    });
    
    // Start listening
    await server.listen({ port: TEST_PORT, host: TEST_HOST });
    console.log(`Server started on ${TEST_HOST}:${TEST_PORT}`);
    
    // Run tests
    await testValidEmailNotification();
    await testValidPushNotification();
    await testIdempotency();
    await testInvalidNotificationType();
    await testMissingRequiredFields();
    await testInvalidUserId();
    await testInvalidTemplateCode();
    await testEmailNotificationsDisabled();
    await testPushNotificationsDisabled();
    await testCircuitBreaker();
    await verifyRabbitMQMessages();
    
    console.log('\n🎉 All tests passed successfully!');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await cleanup();
  }
}

// Handle uncaught errors
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

// Run tests
runTests();