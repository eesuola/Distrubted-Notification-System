import { randomUUID } from 'crypto';
import { createIsolatedTestServer, generateTestJWT, generateTestNotification } from './test-helper-isolated.js';

// Test configuration - using unique port to avoid conflicts
const TEST_PORT = 3004;
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
const testNotification = generateTestNotification({
  notification_type: 'email',
  user_id: mockUser.data.user_id,
  template_code: 'welcome-email',
  variables: {
    name: 'Test User',
    link: 'https://example.com/verify',
    meta: { source: 'test' }
  }
});

// Test state
let server;
let cleanup;

// Test functions
async function testSuccessfulNotification() {
  console.log('\n=== Test 1: Successful notification request with valid JWT ===');
  
  const response = await fetch(`${API_BASE_URL}/api/v1/notifications/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${generateTestJWT(mockUser.data.user_id)}`,
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
      'Authorization': `Bearer ${generateTestJWT(mockUser.data.user_id)}`,
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
      'Authorization': `Bearer ${generateTestJWT(mockUser.data.user_id)}`,
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
      'Authorization': `Bearer ${generateTestJWT('email-service')}`,
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
      'Authorization': `Bearer ${generateTestJWT(mockUser.data.user_id)}`,
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
  
  // Access mock RabbitMQ messages from server
  const messages = server.rabbitmq.messages || [];
  
  if (messages.length === 0) {
    console.log('⚠️  No messages in email queue (using mock RabbitMQ)');
  } else {
    console.log(`Found ${messages.length} messages in email queue`);
    
    const message = messages[0];
    console.log('Message content:', JSON.stringify(message, null, 2));
    
    // Verify message structure
    if (message.message.notification_id !== testNotification.request_id) {
      throw new Error(`Expected notification_id=${testNotification.request_id}, got ${message.message.notification_id}`);
    }
    
    if (message.message.user_id !== testNotification.user_id) {
      throw new Error(`Expected user_id=${testNotification.user_id}, got ${message.message.user_id}`);
    }
    
    if (message.message.notification_type !== testNotification.notification_type) {
      throw new Error(`Expected notification_type=${testNotification.notification_type}, got ${message.message.notification_type}`);
    }
    
    console.log('✅ RabbitMQ message structure verified');
  }
}

// Main test runner
async function runTests() {
  console.log('🚀 Starting API Gateway Complete Flow Tests (Refactored)');
  console.log('=======================================================');
  
  let notificationId;
  
  try {
    // Setup isolated test server
    console.log('\n=== Setup ===');
    const testServer = await createIsolatedTestServer({
      logger: { level: 'error' }
    });
    
    server = testServer.server;
    cleanup = testServer.cleanup;
    
    // Add a custom route for status updates (simulating internal service communication)
    server.post('/api/v1/notifications/status', {
      preHandler: [server.authenticate],
      schema: {
        description: 'Update notification status',
        tags: ['notifications'],
        body: {
          type: 'object',
          required: ['notification_id', 'status'],
          properties: {
            notification_id: { type: 'string' },
            status: { type: 'string', enum: ['delivered', 'pending', 'failed'] },
            timestamp: { type: 'string' },
            error: { type: 'string' }
          }
        }
      }
    }, async (request, reply) => {
      try {
        const { notification_id, status, timestamp, error } = request.body;
        const serviceName = request.headers['x-service-name'];
        
        // Validate service name (internal service authentication)
        const allowedServices = ['email-service', 'push-service'];
        if (!allowedServices.includes(serviceName)) {
          return reply.status(401).send({
            success: false,
            message: 'Unauthorized service',
            error: 'Service is not authorized to update notification status'
          });
        }

        // Prepare status data
        const statusData = {
          notification_id,
          status,
          timestamp: timestamp || new Date().toISOString(),
          error: error || null,
          correlation_id: request.correlationId,
          updated_by: serviceName,
        };

        // Store status in Redis
        const stored = await server.storeNotificationStatus(notification_id, statusData);
        
        if (!stored) {
          return reply.status(500).send({
            success: false,
            message: 'Failed to update notification status',
            error: 'Unable to store notification status in cache'
          });
        }

        return reply.status(200).send({
          success: true,
          message: 'Notification status updated successfully'
        });
      } catch (error) {
        server.log.error('Error updating notification status:', error);
        return reply.status(500).send({
          success: false,
          message: 'Internal server error',
          error: 'An unexpected error occurred while updating notification status'
        });
      }
    });
    
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
    // Cleanup
    if (cleanup) {
      await cleanup();
      console.log('✅ Cleanup completed');
    }
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