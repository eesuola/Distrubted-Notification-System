import { createIsolatedTestServer } from './test-helper-isolated.js';

// Test configuration
const TEST_PORT = 3009;
const TEST_HOST = '127.0.0.1';
const API_BASE_URL = `http://${TEST_HOST}:${TEST_PORT}`;

// Test state
let testResults = {
  passed: 0,
  failed: 0,
  total: 0
};

// Helper function to log test results
function logTestResult(testName, passed, message = '') {
  testResults.total++;
  if (passed) {
    testResults.passed++;
    console.log(`✅ ${testName}: PASSED ${message ? '- ' + message : ''}`);
  } else {
    testResults.failed++;
    console.log(`❌ ${testName}: FAILED ${message ? '- ' + message : ''}`);
  }
}

// Helper functions for test data
function generateTestJWT(userId) {
  return `test-jwt-${userId}`;
}

function generateTestNotification(overrides = {}) {
  return {
    notification_type: 'email',
    user_id: 'test-user-id',
    template_code: 'welcome-email',
    variables: {
      name: 'Test User',
      link: 'https://example.com/verify',
      meta: { source: 'test' }
    },
    request_id: crypto.randomUUID(),
    priority: 5,
    metadata: { test: true },
    ...overrides
  };
}

// Test functions
async function testHealthEndpoint() {
  console.log('\n=== Testing Health Endpoint ===');
  
  try {
    const response = await fetch(`${API_BASE_URL}/health`);
    const data = await response.json();
    
    console.log('Response status:', response.status);
    console.log('Response data:', JSON.stringify(data, null, 2));
    
    const passed = response.status === 200 && data.status === 'healthy';
    logTestResult('Health endpoint', passed, `Status: ${response.status}`);
  } catch (error) {
    logTestResult('Health endpoint', false, `Error: ${error.message}`);
  }
}

async function testValidEmailNotification() {
  console.log('\n=== Testing Valid Email Notification ===');
  
  try {
    const testNotification = generateTestNotification({
      notification_type: 'email',
      user_id: 'valid-user-id',
      template_code: 'welcome-email',
      variables: {
        name: 'Test User',
        link: 'https://example.com/verify',
        meta: { source: 'test' }
      }
    });
    
    const response = await fetch(`${API_BASE_URL}/api/v1/notifications/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${generateTestJWT('valid-user-id')}`,
        'X-Correlation-Id': 'test-correlation-email'
      },
      body: JSON.stringify(testNotification)
    });

    const responseData = await response.json();
    
    console.log('Response status:', response.status);
    console.log('Response data:', JSON.stringify(responseData, null, 2));
    
    const passed = response.status === 202 && 
                   responseData.success === true && 
                   responseData.data?.notification_id === testNotification.request_id;
    
    logTestResult('Valid email notification', passed, `Status: ${response.status}`);
  } catch (error) {
    logTestResult('Valid email notification', false, `Error: ${error.message}`);
  }
}

async function testValidPushNotification() {
  console.log('\n=== Testing Valid Push Notification ===');
  
  try {
    const testNotification = generateTestNotification({
      notification_type: 'push',
      user_id: 'valid-user-id',
      template_code: 'welcome-push',
      variables: {
        name: 'Test User'
      }
    });
    
    const response = await fetch(`${API_BASE_URL}/api/v1/notifications/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${generateTestJWT('valid-user-id')}`,
        'X-Correlation-Id': 'test-correlation-push'
      },
      body: JSON.stringify(testNotification)
    });

    const responseData = await response.json();
    
    console.log('Response status:', response.status);
    console.log('Response data:', JSON.stringify(responseData, null, 2));
    
    const passed = response.status === 202 && 
                   responseData.success === true && 
                   responseData.data?.notification_id === testNotification.request_id;
    
    logTestResult('Valid push notification', passed, `Status: ${response.status}`);
  } catch (error) {
    logTestResult('Valid push notification', false, `Error: ${error.message}`);
  }
}

async function testIdempotency() {
  console.log('\n=== Testing Idempotency ===');
  
  try {
    const testNotification = generateTestNotification({
      notification_type: 'email',
      user_id: 'valid-user-id',
      template_code: 'welcome-email'
    });
    
    // First request
    const firstResponse = await fetch(`${API_BASE_URL}/api/v1/notifications/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${generateTestJWT('valid-user-id')}`,
        'X-Correlation-Id': 'test-correlation-idempotency-1'
      },
      body: JSON.stringify(testNotification)
    });

    const firstData = await firstResponse.json();
    
    // Second request with same request_id
    const secondResponse = await fetch(`${API_BASE_URL}/api/v1/notifications/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${generateTestJWT('valid-user-id')}`,
        'X-Correlation-Id': 'test-correlation-idempotency-2'
      },
      body: JSON.stringify(testNotification) // Same request_id
    });

    const secondData = await secondResponse.json();
    
    console.log('First response status:', firstResponse.status);
    console.log('Second response status:', secondResponse.status);
    console.log('First notification_id:', firstData.data?.notification_id);
    console.log('Second notification_id:', secondData.data?.notification_id);
    
    const passed = firstResponse.status === 202 && 
                   secondResponse.status === 202 &&
                   firstData.success === true && 
                   secondData.success === true &&
                   firstData.data?.notification_id === secondData.data?.notification_id;
    
    logTestResult('Idempotency', passed, 'Same notification_id returned');
  } catch (error) {
    logTestResult('Idempotency', false, `Error: ${error.message}`);
  }
}

async function testInvalidNotificationType() {
  console.log('\n=== Testing Invalid Notification Type ===');
  
  try {
    const testNotification = generateTestNotification({
      notification_type: 'invalid-type', // Invalid type
      user_id: 'valid-user-id',
      template_code: 'welcome-email'
    });
    
    const response = await fetch(`${API_BASE_URL}/api/v1/notifications/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${generateTestJWT('valid-user-id')}`,
        'X-Correlation-Id': 'test-correlation-invalid'
      },
      body: JSON.stringify(testNotification)
    });

    const responseData = await response.json();
    
    console.log('Response status:', response.status);
    console.log('Response data:', JSON.stringify(responseData, null, 2));
    
    const passed = response.status === 400 && responseData.success === false;
    
    logTestResult('Invalid notification type', passed, `Status: ${response.status}`);
  } catch (error) {
    logTestResult('Invalid notification type', false, `Error: ${error.message}`);
  }
}

async function testMissingRequiredFields() {
  console.log('\n=== Testing Missing Required Fields ===');
  
  try {
    const testNotification = {
      // Missing notification_type
      user_id: 'valid-user-id',
      template_code: 'welcome-email',
      variables: {
        name: 'Test User',
        link: 'https://example.com/verify'
      },
      request_id: 'test-request-id',
      priority: 5
    };
    
    const response = await fetch(`${API_BASE_URL}/api/v1/notifications/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${generateTestJWT('valid-user-id')}`,
        'X-Correlation-Id': 'test-correlation-missing'
      },
      body: JSON.stringify(testNotification)
    });

    const responseData = await response.json();
    
    console.log('Response status:', response.status);
    console.log('Response data:', JSON.stringify(responseData, null, 2));
    
    const passed = response.status === 400 && responseData.success === false;
    
    logTestResult('Missing required fields', passed, `Status: ${response.status}`);
  } catch (error) {
    logTestResult('Missing required fields', false, `Error: ${error.message}`);
  }
}

async function testUnauthorizedAccess() {
  console.log('\n=== Testing Unauthorized Access ===');
  
  try {
    const testNotification = generateTestNotification();
    
    // Request without Authorization header
    const response = await fetch(`${API_BASE_URL}/api/v1/notifications/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Correlation-Id': 'test-correlation-unauthorized'
        // No Authorization header
      },
      body: JSON.stringify(testNotification)
    });

    const responseData = await response.json();
    
    console.log('Response status:', response.status);
    console.log('Response data:', JSON.stringify(responseData, null, 2));
    
    const passed = response.status === 401 && responseData.success === false;
    
    logTestResult('Unauthorized access', passed, `Status: ${response.status}`);
  } catch (error) {
    logTestResult('Unauthorized access', false, `Error: ${error.message}`);
  }
}

async function testNotificationStatus() {
  console.log('\n=== Testing Notification Status ===');
  
  try {
    // First, create a notification
    const testNotification = generateTestNotification();
    
    const createResponse = await fetch(`${API_BASE_URL}/api/v1/notifications/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${generateTestJWT('valid-user-id')}`,
        'X-Correlation-Id': 'test-correlation-status-create'
      },
      body: JSON.stringify(testNotification)
    });

    const createData = await createResponse.json();
    const notificationId = createData.data?.notification_id;
    
    if (createData.success && notificationId) {
      // Now, check the status
      const statusResponse = await fetch(`${API_BASE_URL}/api/v1/notifications/${notificationId}/status`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${generateTestJWT('valid-user-id')}`,
          'X-Correlation-Id': 'test-correlation-status-check'
        }
      });

      const statusData = await statusResponse.json();
      
      console.log('Status response status:', statusResponse.status);
      console.log('Status response data:', JSON.stringify(statusData, null, 2));
      
      const passed = statusResponse.status === 200 && statusData.success === true;
      
      logTestResult('Notification status', passed, `Status: ${statusResponse.status}`);
    } else {
      logTestResult('Notification status', false, 'Failed to create notification');
    }
  } catch (error) {
    logTestResult('Notification status', false, `Error: ${error.message}`);
  }
}

// Main test runner
async function runTests() {
  console.log('🚀 Starting Refactored API Gateway Tests (v3)');
  console.log('=====================================');
  
  let server;
  
  try {
    // Create a mock server
    console.log('\n=== Creating Mock Server ===');
    const { server: serverInstance, cleanup } = await createIsolatedTestServer();
    server = serverInstance;
    
    // Start listening
    await server.listen({ port: TEST_PORT, host: TEST_HOST });
    console.log(`Mock server listening on ${TEST_HOST}:${TEST_PORT}`);
    
    // Run tests
    await testHealthEndpoint();
    await testValidEmailNotification();
    await testValidPushNotification();
    await testIdempotency();
    await testInvalidNotificationType();
    await testMissingRequiredFields();
    await testUnauthorizedAccess();
    await testNotificationStatus();
    
    // Print test summary
    console.log('\n=====================================');
    console.log('📊 Test Summary:');
    console.log(`Total tests: ${testResults.total}`);
    console.log(`Passed: ${testResults.passed}`);
    console.log(`Failed: ${testResults.failed}`);
    console.log(`Success rate: ${((testResults.passed / testResults.total) * 100).toFixed(2)}%`);
    
    if (testResults.failed === 0) {
      console.log('\n🎉 All tests passed successfully!');
      console.log('\nThe refactored test using new test helper is working correctly.');
    } else {
      console.log('\n❌ Some tests failed. Please check output above.');
    }
    
    // Cleanup
    console.log('\n=== Cleanup ===');
    await cleanup();
    console.log('Mock server stopped');
  } catch (error) {
    console.error('\n❌ Test runner failed:', error.message);
    console.error(error.stack);
  }
}

// Handle uncaught errors
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

// Run tests
runTests();