import { randomUUID } from 'crypto';
import { createIsolatedTestServer, generateTestJWT } from './test-helper-isolated.js';

// Test configuration - using unique port to avoid conflicts
const TEST_PORT = 3005;
const TEST_HOST = '127.0.0.1';
const API_BASE_URL = `http://${TEST_HOST}:${TEST_PORT}`;

// Test state
let server;
let cleanup;

// Test functions
async function testGetNotificationStatus(notificationId, correlationId) {
  console.log(`\n=== Testing GET /api/v1/notifications/${notificationId}/status ===`);
  
  const response = await fetch(`${API_BASE_URL}/api/v1/notifications/${notificationId}/status`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${generateTestJWT('test-user')}`,
      'X-Correlation-Id': correlationId || randomUUID()
    }
  });

  const responseData = await response.json();
  
  console.log('Response status:', response.status);
  console.log('Response data:', JSON.stringify(responseData, null, 2));
  
  return {
    statusCode: response.status,
    response: responseData
  };
}

async function testPostNotificationStatus(body, serviceName, correlationId) {
  console.log(`\n=== Testing POST /api/v1/notifications/status ===`);
  console.log('Service:', serviceName);
  console.log('Request body:', body);
  
  const response = await fetch(`${API_BASE_URL}/api/v1/notifications/status`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${generateTestJWT(serviceName)}`,
      'X-Correlation-Id': correlationId || randomUUID(),
      'X-Service-Name': serviceName
    },
    body: JSON.stringify(body)
  });

  const responseData = await response.json();
  
  console.log('Response status:', response.status);
  console.log('Response data:', JSON.stringify(responseData, null, 2));
  
  return {
    statusCode: response.status,
    response: responseData
  };
}

async function testGetExistingNotification() {
  console.log('\n=== Test 1: GET existing notification status ===');
  
  // First, store a notification status
  const notificationId = 'test-notification-123';
  const statusData = {
    notification_id: notificationId,
    status: 'delivered',
    timestamp: new Date().toISOString(),
    error: null,
    correlation_id: 'test-correlation-456',
    updated_by: 'email-service',
  };
  
  await server.storeNotificationStatus(notificationId, statusData);
  
  // Now retrieve it
  const result = await testGetNotificationStatus(notificationId, 'test-correlation-456');
  
  // Assertions
  if (result.statusCode !== 200) {
    throw new Error(`Expected status 200, got ${result.statusCode}`);
  }
  
  if (!result.response.success) {
    throw new Error(`Expected success=true, got ${result.response.success}`);
  }
  
  if (result.response.data.status !== 'delivered') {
    throw new Error(`Expected status=delivered, got ${result.response.data.status}`);
  }
  
  console.log('✅ Test 1 passed: GET existing notification status');
}

async function testGetNonExistingNotification() {
  console.log('\n=== Test 2: GET non-existing notification status ===');
  
  const result = await testGetNotificationStatus('non-existing-notification', 'test-correlation-789');
  
  // Assertions
  if (result.statusCode !== 404) {
    throw new Error(`Expected status 404, got ${result.statusCode}`);
  }
  
  if (result.response.success !== false) {
    throw new Error(`Expected success=false, got ${result.response.success}`);
  }
  
  if (!result.response.error.includes('not found')) {
    throw new Error(`Expected error message about notification not found`);
  }
  
  console.log('✅ Test 2 passed: GET non-existing notification status');
}

async function testPostStatusUpdateFromEmailService() {
  console.log('\n=== Test 3: POST status update from email-service ===');
  
  const body = {
    notification_id: 'test-notification-456',
    status: 'delivered',
    timestamp: new Date().toISOString(),
    error: null
  };
  
  const result = await testPostNotificationStatus(body, 'email-service', 'test-correlation-123');
  
  // Assertions
  if (result.statusCode !== 200) {
    throw new Error(`Expected status 200, got ${result.statusCode}`);
  }
  
  if (!result.response.success) {
    throw new Error(`Expected success=true, got ${result.response.success}`);
  }
  
  // Verify the status was stored
  const storedStatus = await server.getNotificationStatus(body.notification_id);
  if (!storedStatus) {
    throw new Error('Status was not stored correctly');
  }
  
  if (storedStatus.status !== 'delivered') {
    throw new Error(`Expected stored status=delivered, got ${storedStatus.status}`);
  }
  
  if (storedStatus.updated_by !== 'email-service') {
    throw new Error(`Expected updated_by=email-service, got ${storedStatus.updated_by}`);
  }
  
  console.log('✅ Test 3 passed: POST status update from email-service');
}

async function testPostStatusUpdateFromPushService() {
  console.log('\n=== Test 4: POST status update from push-service with error ===');
  
  const body = {
    notification_id: 'test-notification-789',
    status: 'failed',
    timestamp: new Date().toISOString(),
    error: 'Device token not valid'
  };
  
  const result = await testPostNotificationStatus(body, 'push-service', 'test-correlation-456');
  
  // Assertions
  if (result.statusCode !== 200) {
    throw new Error(`Expected status 200, got ${result.statusCode}`);
  }
  
  if (!result.response.success) {
    throw new Error(`Expected success=true, got ${result.response.success}`);
  }
  
  // Verify the status was stored
  const storedStatus = await server.getNotificationStatus(body.notification_id);
  if (!storedStatus) {
    throw new Error('Status was not stored correctly');
  }
  
  if (storedStatus.status !== 'failed') {
    throw new Error(`Expected stored status=failed, got ${storedStatus.status}`);
  }
  
  if (storedStatus.error !== 'Device token not valid') {
    throw new Error(`Expected stored error='Device token not valid', got ${storedStatus.error}`);
  }
  
  if (storedStatus.updated_by !== 'push-service') {
    throw new Error(`Expected updated_by=push-service, got ${storedStatus.updated_by}`);
  }
  
  console.log('✅ Test 4 passed: POST status update from push-service with error');
}

async function testPostStatusUpdateFromUnauthorizedService() {
  console.log('\n=== Test 5: POST status update from unauthorized service ===');
  
  const body = {
    notification_id: 'test-notification-999',
    status: 'delivered',
    timestamp: new Date().toISOString(),
    error: null
  };
  
  const result = await testPostNotificationStatus(body, 'unauthorized-service', 'test-correlation-789');
  
  // Assertions
  if (result.statusCode !== 401) {
    throw new Error(`Expected status 401, got ${result.statusCode}`);
  }
  
  if (result.response.success !== false) {
    throw new Error(`Expected success=false, got ${result.response.success}`);
  }
  
  if (!result.response.error.includes('unauthorized')) {
    throw new Error(`Expected error message about unauthorized service`);
  }
  
  console.log('✅ Test 5 passed: POST status update from unauthorized service');
}

// Main test runner
async function runTests() {
  console.log('🚀 Starting API Gateway Notification Status Tests (Refactored)');
  console.log('============================================================');
  
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
    await testGetExistingNotification();
    await testGetNonExistingNotification();
    await testPostStatusUpdateFromEmailService();
    await testPostStatusUpdateFromPushService();
    await testPostStatusUpdateFromUnauthorizedService();
    
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