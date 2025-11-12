// Simple implementation of createResponse for testing
const createResponse = (success, message, data, error, meta) => {
  const response = { success, message };
  if (data !== undefined) response.data = data;
  if (error !== undefined) response.error = error;
  if (meta !== undefined) response.meta = meta;
  return response;
};

// Test script for notification status tracking
// This script simulates the notification status tracking functionality

// Mock Fastify instance with Redis operations
const mockFastify = {
  log: {
    info: (message, context) => console.log(`INFO: ${message}`, context || ''),
    warn: (message, context) => console.warn(`WARN: ${message}`, context || ''),
    error: (message, context) => console.error(`ERROR: ${message}`, context || ''),
  },
  getNotificationStatusKey: (notificationId) => `notification_status:${notificationId}`,
  storeNotificationStatus: async (notificationId, statusData, ttl) => {
    console.log(`Storing status for ${notificationId}:`, statusData);
    return true;
  },
  getNotificationStatus: async (notificationId) => {
    console.log(`Retrieving status for ${notificationId}`);
    // Mock data for testing
    if (notificationId === 'test-notification-123') {
      return {
        notification_id: 'test-notification-123',
        status: 'delivered',
        timestamp: new Date().toISOString(),
        error: null,
        correlation_id: 'test-correlation-456',
        updated_by: 'email-service',
      };
    }
    return null;
  },
};

// Test GET endpoint logic
async function testGetNotificationStatus(notificationId, correlationId) {
  try {
    console.log(`\n=== Testing GET /api/v1/notifications/${notificationId}/status ===`);
    
    // Retrieve notification status from Redis
    const statusData = await mockFastify.getNotificationStatus(notificationId);
    
    if (!statusData) {
      console.log('Status not found, returning 404');
      return {
        statusCode: 404,
        response: createResponse(
          false,
          'Notification status not found',
          undefined,
          `No status found for notification ID: ${notificationId}`
        )
      };
    }

    console.log('Status retrieved successfully:', statusData);
    const response = createResponse(
      true,
      'Notification status retrieved successfully',
      statusData
    );

    return {
      statusCode: 200,
      response
    };
  } catch (error) {
    console.error('Error in GET endpoint:', error);
    return {
      statusCode: 500,
      response: createResponse(
        false,
        'Internal server error',
        undefined,
        'An unexpected error occurred while fetching notification status'
      )
    };
  }
}

// Test POST endpoint logic
async function testPostNotificationStatus(body, serviceName, correlationId) {
  try {
    console.log(`\n=== Testing POST /api/v1/notifications/status ===`);
    console.log('Service:', serviceName);
    console.log('Request body:', body);
    
    // Validate service name (internal service authentication)
    const allowedServices = ['email-service', 'push-service'];
    if (!allowedServices.includes(serviceName)) {
      console.log('Unauthorized service:', serviceName);
      return {
        statusCode: 401,
        response: createResponse(
          false,
          'Unauthorized service',
          undefined,
          'Service is not authorized to update notification status'
        )
      };
    }

    // Prepare status data
    const statusData = {
      notification_id: body.notification_id,
      status: body.status,
      timestamp: body.timestamp || new Date().toISOString(),
      error: body.error || null,
      correlation_id: correlationId,
      updated_by: serviceName,
    };

    // Store status in Redis
    const stored = await mockFastify.storeNotificationStatus(body.notification_id, statusData);
    
    if (!stored) {
      console.log('Failed to store status');
      return {
        statusCode: 500,
        response: createResponse(
          false,
          'Failed to update notification status',
          undefined,
          'Unable to store notification status in cache'
        )
      };
    }

    console.log('Status updated successfully:', statusData);
    const response = createResponse(
      true,
      'Notification status updated successfully'
    );

    return {
      statusCode: 200,
      response
    };
  } catch (error) {
    console.error('Error in POST endpoint:', error);
    return {
      statusCode: 500,
      response: createResponse(
        false,
        'Internal server error',
        undefined,
        'An unexpected error occurred while updating notification status'
      )
    };
  }
}

// Run tests
async function runTests() {
  console.log('Starting notification status tracking tests...\n');

  // Test 1: GET with existing notification
  console.log('Test 1: GET existing notification status');
  const getResult1 = await testGetNotificationStatus('test-notification-123', 'test-correlation-456');
  console.log('Result:', getResult1);

  // Test 2: GET with non-existing notification
  console.log('\nTest 2: GET non-existing notification status');
  const getResult2 = await testGetNotificationStatus('non-existing-notification', 'test-correlation-789');
  console.log('Result:', getResult2);

  // Test 3: POST with valid service (email-service)
  console.log('\nTest 3: POST status update from email-service');
  const postResult1 = await testPostNotificationStatus(
    {
      notification_id: 'test-notification-456',
      status: 'delivered',
      timestamp: new Date().toISOString(),
      error: null
    },
    'email-service',
    'test-correlation-123'
  );
  console.log('Result:', postResult1);

  // Test 4: POST with valid service (push-service) and error
  console.log('\nTest 4: POST status update from push-service with error');
  const postResult2 = await testPostNotificationStatus(
    {
      notification_id: 'test-notification-789',
      status: 'failed',
      timestamp: new Date().toISOString(),
      error: 'Device token not valid'
    },
    'push-service',
    'test-correlation-456'
  );
  console.log('Result:', postResult2);

  // Test 5: POST with unauthorized service
  console.log('\nTest 5: POST status update from unauthorized service');
  const postResult3 = await testPostNotificationStatus(
    {
      notification_id: 'test-notification-999',
      status: 'delivered',
      timestamp: new Date().toISOString(),
      error: null
    },
    'unauthorized-service',
    'test-correlation-789'
  );
  console.log('Result:', postResult3);

  console.log('\nAll tests completed!');
}

// Run the tests
runTests().catch(console.error);