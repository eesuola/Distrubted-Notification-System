import { randomUUID } from 'crypto';
import fastify from 'fastify';
import nock from 'nock';
import Redis from 'ioredis-mock';
import amqp from 'amqplib';
import jwt from 'jsonwebtoken';

// Test configuration
const TEST_PORT = 3001;
const TEST_HOST = '127.0.0.1';
const API_BASE_URL = `http://${TEST_HOST}:${TEST_PORT}`;

// Mock data
const mockUser = {
  success: true,
  data: {
    user_id: randomUUID(),
    name: 'Test User',
    email: 'test@example.com',
    push_token: 'mock-push-token',
    preferences: {
      email: true,
      push: true
    }
  }
};

const mockTemplate = {
  success: true,
  data: {
    template_code: 'welcome-email',
    language: 'en',
    subject: 'Welcome to our service',
    body: 'Hello {{name}}, welcome to our service! Click here: {{link}}',
    variables: ['name', 'link']
  }
};

// Test data
const testNotification = {
  notification_type: 'email',
  user_id: mockUser.data.user_id,
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

// JWT token for authentication
const JWT_SECRET = process.env.JWT_SECRET || 'default-secret-key';
const validJWT = jwt.sign({ sub: mockUser.data.user_id, userId: mockUser.data.user_id }, JWT_SECRET);

// Test state
let server;
let redisClient;
let rabbitmqConnection;
let rabbitmqChannel;
let emailQueueMessages = [];
let pushQueueMessages = [];

// Helper functions
async function setupMockServices() {
  // Mock User Service
  nock(/.*/)
    .get(`/api/v1/users/${mockUser.data.user_id}`)
    .reply(200, mockUser);

  // Mock Template Service
  nock(/.*/)
    .get(`/api/v1/templates/${mockTemplate.data.template_code}`)
    .reply(200, mockTemplate);
}

async function setupRabbitMQ() {
  try {
    // Connect to RabbitMQ
    rabbitmqConnection = await amqp.connect(process.env.RABBITMQ_URL || 'amqp://localhost:5672');
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
    redisClient = new Redis();
    
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
async function testSuccessfulNotification() {
  console.log('\n=== Test 1: Successful notification request with valid JWT ===');
  
  const response = await fetch(`${API_BASE_URL}/api/v1/notifications/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${validJWT}`,
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
  
  console.log('✅ Test 1 passed: Successful notification request');
  return responseData.data.notification_id;
}

async function testDuplicateRequest(notificationId) {
  console.log('\n=== Test 2: Duplicate request (idempotency check) ===');
  
  const response = await fetch(`${API_BASE_URL}/api/v1/notifications/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${validJWT}`,
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
  
  if (responseData.data.notification_id !== notificationId) {
    throw new Error(`Expected same notification_id for duplicate request`);
  }
  
  console.log('✅ Test 2 passed: Idempotency check working correctly');
}

async function testUnauthorizedRequest() {
  console.log('\n=== Test 3: Request without JWT (authentication failure) ===');
  
  const response = await fetch(`${API_BASE_URL}/api/v1/notifications/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Correlation-Id': randomUUID()
    },
    body: JSON.stringify(testNotification)
  });

  const responseData = await response.json();
  
  console.log('Response status:', response.status);
  console.log('Response data:', JSON.stringify(responseData, null, 2));
  
  // Assertions
  if (response.status !== 401) {
    throw new Error(`Expected status 401, got ${response.status}`);
  }
  
  if (responseData.success !== false) {
    throw new Error(`Expected success=false, got ${responseData.success}`);
  }
  
  if (!responseData.error) {
    throw new Error('Expected error message in response');
  }
  
  console.log('✅ Test 3 passed: Authentication failure handled correctly');
}

async function testNotificationStatus(notificationId) {
  console.log('\n=== Test 4: Check notification status (pending) ===');
  
  const response = await fetch(`${API_BASE_URL}/api/v1/notifications/${notificationId}/status`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${validJWT}`,
      'X-Correlation-Id': randomUUID()
    }
  });

  const responseData = await response.json();
  
  console.log('Response status:', response.status);
  console.log('Response data:', JSON.stringify(responseData, null, 2));
  
  // Assertions
  if (response.status !== 200) {
    throw new Error(`Expected status 200, got ${response.status}`);
  }
  
  if (!responseData.success) {
    throw new Error(`Expected success=true, got ${responseData.success}`);
  }
  
  if (responseData.data.status !== 'pending') {
    throw new Error(`Expected status=pending, got ${responseData.data.status}`);
  }
  
  console.log('✅ Test 4 passed: Notification status retrieved correctly');
}

async function testStatusUpdate(notificationId) {
  console.log('\n=== Test 5: Simulate status update from email-service ===');
  
  const statusUpdate = {
    notification_id: notificationId,
    status: 'delivered',
    timestamp: new Date().toISOString(),
    error: null
  };

  const response = await fetch(`${API_BASE_URL}/api/v1/notifications/status`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${validJWT}`,
      'X-Correlation-Id': randomUUID(),
      'X-Service-Name': 'email-service'
    },
    body: JSON.stringify(statusUpdate)
  });

  const responseData = await response.json();
  
  console.log('Response status:', response.status);
  console.log('Response data:', JSON.stringify(responseData, null, 2));
  
  // Assertions
  if (response.status !== 200) {
    throw new Error(`Expected status 200, got ${response.status}`);
  }
  
  if (!responseData.success) {
    throw new Error(`Expected success=true, got ${responseData.success}`);
  }
  
  console.log('✅ Test 5 passed: Status update handled correctly');
}

async function testFinalNotificationStatus(notificationId) {
  console.log('\n=== Test 6: Check final notification status (delivered) ===');
  
  const response = await fetch(`${API_BASE_URL}/api/v1/notifications/${notificationId}/status`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${validJWT}`,
      'X-Correlation-Id': randomUUID()
    }
  });

  const responseData = await response.json();
  
  console.log('Response status:', response.status);
  console.log('Response data:', JSON.stringify(responseData, null, 2));
  
  // Assertions
  if (response.status !== 200) {
    throw new Error(`Expected status 200, got ${response.status}`);
  }
  
  if (!responseData.success) {
    throw new Error(`Expected success=true, got ${responseData.success}`);
  }
  
  if (responseData.data.status !== 'delivered') {
    throw new Error(`Expected status=delivered, got ${responseData.data.status}`);
  }
  
  if (responseData.data.updated_by !== 'email-service') {
    throw new Error(`Expected updated_by=email-service, got ${responseData.data.updated_by}`);
  }
  
  console.log('✅ Test 6 passed: Final notification status retrieved correctly');
}

async function verifyRabbitMQMessages() {
  console.log('\n=== Verifying RabbitMQ Messages ===');
  
  if (emailQueueMessages.length === 0) {
    console.log('⚠️  No messages in email queue (RabbitMQ might not be available)');
  } else {
    console.log(`Found ${emailQueueMessages.length} messages in email queue`);
    
    const message = emailQueueMessages[0];
    console.log('Message content:', JSON.stringify(message, null, 2));
    
    // Verify message structure
    if (message.notification_id !== testNotification.request_id) {
      throw new Error(`Expected notification_id=${testNotification.request_id}, got ${message.notification_id}`);
    }
    
    if (message.user_id !== testNotification.user_id) {
      throw new Error(`Expected user_id=${testNotification.user_id}, got ${message.user_id}`);
    }
    
    if (message.notification_type !== testNotification.notification_type) {
      throw new Error(`Expected notification_type=${testNotification.notification_type}, got ${message.notification_type}`);
    }
    
    console.log('✅ RabbitMQ message structure verified');
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
  
  // Clean up nock
  nock.cleanAll();
  
  console.log('✅ Cleanup completed');
}

// Main test runner
async function runTests() {
  console.log('🚀 Starting API Gateway Complete Flow Tests');
  console.log('==========================================');
  
  let notificationId;
  
  try {
    // Setup
    console.log('\n=== Setup ===');
    await setupMockServices();
    await setupRedis();
    await setupRabbitMQ();
    
    // Start the server
    console.log('Starting API Gateway server...');
    server = fastify({
      logger: false, // Disable logger for cleaner test output
    });
    
    // Register JWT plugin with test secret
    await server.register(import('@fastify/jwt'), {
      secret: JWT_SECRET,
    });
    
    // Import and register the same plugins as the main server
    await server.register(import('./src/plugins/consul.js'));
    await server.register(import('./src/plugins/correlation-id.js'));
    await server.register(import('./src/plugins/redis.js'));
    await server.register(import('./src/plugins/rabbitmq.js'));
    await server.register(import('./src/plugins/auth.js'));
    await server.register(import('./src/routes/notifications.js'));
    
    // Override Redis client with mock
    server.redis = redisClient;
    
    // Start listening
    await server.listen({ port: TEST_PORT, host: TEST_HOST });
    console.log(`Server started on ${TEST_HOST}:${TEST_PORT}`);
    
    // Run tests
    notificationId = await testSuccessfulNotification();
    await testDuplicateRequest(notificationId);
    await testUnauthorizedRequest();
    await testNotificationStatus(notificationId);
    await testStatusUpdate(notificationId);
    await testFinalNotificationStatus(notificationId);
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