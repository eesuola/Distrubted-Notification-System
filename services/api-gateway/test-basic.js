import { randomUUID } from 'crypto';
import { createServer } from 'http';

// Test configuration
const TEST_PORT = 3003;
const TEST_HOST = '127.0.0.1';
const API_BASE_URL = `http://${TEST_HOST}:${TEST_PORT}`;

// Test state
let server;
let testResults = {
  passed: 0,
  failed: 0,
  total: 0
};

// In-memory Redis mock for idempotency
const redisMock = {
  data: new Map(),
  get: async (key) => redisMock.data.get(key) || null,
  set: async (key, value, options) => {
    redisMock.data.set(key, value);
    return 'OK';
  },
  setex: async (key, ttl, value) => {
    redisMock.data.set(key, value);
    return 'OK';
  },
  del: async (key) => {
    const existed = redisMock.data.has(key);
    redisMock.data.delete(key);
    return existed ? 1 : 0;
  },
  quit: async () => 'OK'
};

// Mock data for User Service
const mockUsers = {
  'valid-user-id': {
    success: true,
    data: {
      user_id: 'valid-user-id',
      name: 'Test User',
      email: 'test@example.com',
      push_token: 'valid-push-token',
      preferences: {
        email: true,
        push: true
      }
    }
  },
  'email-disabled-user': {
    success: true,
    data: {
      user_id: 'email-disabled-user',
      name: 'Email Disabled User',
      email: 'email.disabled@example.com',
      push_token: 'valid-push-token',
      preferences: {
        email: false,
        push: true
      }
    }
  }
};

// Mock data for Template Service
const mockTemplates = {
  'welcome-email': {
    success: true,
    data: {
      template_code: 'welcome-email',
      language: 'en',
      subject: 'Welcome to our service',
      body: 'Hello {{name}}, welcome to our service! Click here: {{link}}',
      variables: ['name', 'link']
    }
  },
  'welcome-push': {
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

// Helper function to generate JWT token (mock)
function generateJWT(userId) {
  return `mock-jwt-token-${userId}`;
}

// Helper function to validate JWT token (mock)
function validateJWT(token) {
  if (token.startsWith('mock-jwt-token-')) {
    const userId = token.replace('mock-jwt-token-', '');
    return { sub: userId, userId: userId };
  }
  return null;
}

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

// Create a simple HTTP server to mock the API Gateway
function createMockServer() {
  const requestHandler = async (req, res) => {
    try {
      const url = new URL(req.url, `http://${TEST_HOST}:${TEST_PORT}`);
      const method = req.method;
      const path = url.pathname;

      // Set CORS headers
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Correlation-Id');

      // Handle preflight requests
      if (method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
      }

      // Health check endpoint
      if (path === '/health' && method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          status: 'healthy',
          timestamp: new Date().toISOString(),
          service: 'api-gateway',
          uptime: process.uptime()
        }));
        return;
      }

      // Notification endpoint
      if (path === '/api/v1/notifications/' && method === 'POST') {
        // Read request body
        const chunks = [];
        for await (const chunk of req) {
          chunks.push(chunk);
        }
        const body = JSON.parse(Buffer.concat(chunks).toString());

        // Extract headers
        const authHeader = req.headers.authorization;
        const correlationId = req.headers['x-correlation-id'] || randomUUID();

        // Validate JWT
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: false,
            message: 'Unauthorized',
            error: 'Missing or invalid authorization header'
          }));
          return;
        }

        const token = authHeader.substring(7);
        const user = validateJWT(token);
        if (!user) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: false,
            message: 'Unauthorized',
            error: 'Invalid JWT token'
          }));
          return;
        }

        // Validate request body
        if (!body.notification_type || !body.user_id || !body.template_code || !body.variables || !body.request_id) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: false,
            message: 'Invalid request',
            error: 'Missing required fields'
          }));
          return;
        }

        // Validate notification_type
        if (!['email', 'push'].includes(body.notification_type)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: false,
            message: 'Invalid request',
            error: 'Invalid notification_type'
          }));
          return;
        }

        // Check for idempotency
        const idempotencyKey = `idempotency:${body.request_id}`;
        const cachedResponse = await redisMock.get(idempotencyKey);
        if (cachedResponse) {
          res.writeHead(202, { 'Content-Type': 'application/json' });
          res.end(cachedResponse);
          return;
        }

        // Mock user service call
        const userData = mockUsers[body.user_id];
        if (!userData) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: false,
            message: 'Invalid request',
            error: 'User not found'
          }));
          return;
        }

        // Mock template service call
        const templateData = mockTemplates[body.template_code];
        if (!templateData) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: false,
            message: 'Invalid request',
            error: 'Template not found'
          }));
          return;
        }

        // Check user preferences
        if (body.notification_type === 'email' && !userData.data.preferences.email) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: false,
            message: 'Notification not sent',
            error: 'User has disabled email notifications'
          }));
          return;
        }

        if (body.notification_type === 'push' && !userData.data.preferences.push) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: false,
            message: 'Notification not sent',
            error: 'User has disabled push notifications'
          }));
          return;
        }

        // Create success response
        const response = {
          success: true,
          message: 'Notification accepted for processing',
          data: {
            notification_id: body.request_id,
            request_id: body.request_id,
            status: 'accepted'
          }
        };

        // Store response for idempotency
        await redisMock.set(idempotencyKey, JSON.stringify(response));

        // Send response
        res.writeHead(202, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(response));
        return;
      }

      // Default 404 response
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not Found' }));
    } catch (error) {
      console.error('Error handling request:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal Server Error' }));
    }
  };

  return createServer(requestHandler);
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
    const testNotification = {
      notification_type: 'email',
      user_id: 'valid-user-id',
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
        'Authorization': `Bearer ${generateJWT('valid-user-id')}`,
        'X-Correlation-Id': randomUUID()
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
    const testNotification = {
      notification_type: 'push',
      user_id: 'valid-user-id',
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
        'Authorization': `Bearer ${generateJWT('valid-user-id')}`,
        'X-Correlation-Id': randomUUID()
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
    const testNotification = {
      notification_type: 'email',
      user_id: 'valid-user-id',
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
        'Authorization': `Bearer ${generateJWT('valid-user-id')}`,
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
        'Authorization': `Bearer ${generateJWT('valid-user-id')}`,
        'X-Correlation-Id': randomUUID()
      },
      body: JSON.stringify(testNotification)
    });

    const secondResponseData = await secondResponse.json();
    
    console.log('First response status:', firstResponse.status);
    console.log('Second response status:', secondResponse.status);
    console.log('First response data:', JSON.stringify(firstResponseData, null, 2));
    console.log('Second response data:', JSON.stringify(secondResponseData, null, 2));
    
    const passed = firstResponse.status === 202 && 
                   secondResponse.status === 202 &&
                   firstResponseData.data.notification_id === secondResponseData.data.notification_id;
    
    logTestResult('Idempotency', passed, `Both requests returned same notification_id`);
  } catch (error) {
    logTestResult('Idempotency', false, `Error: ${error.message}`);
  }
}

async function testInvalidNotificationType() {
  console.log('\n=== Testing Invalid Notification Type ===');
  
  try {
    const testNotification = {
      notification_type: 'invalid-type',
      user_id: 'valid-user-id',
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
        'Authorization': `Bearer ${generateJWT('valid-user-id')}`,
        'X-Correlation-Id': randomUUID()
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
    // Test with missing notification_type
    const testNotification = {
      user_id: 'valid-user-id',
      template_code: 'welcome-email',
      variables: {
        name: 'Test User',
        link: 'https://example.com/verify'
      },
      request_id: randomUUID(),
      priority: 5
    };
    
    const response = await fetch(`${API_BASE_URL}/api/v1/notifications/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${generateJWT('valid-user-id')}`,
        'X-Correlation-Id': randomUUID()
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

async function testInvalidUserId() {
  console.log('\n=== Testing Invalid User ID ===');
  
  try {
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
        'Authorization': `Bearer ${generateJWT('valid-user-id')}`,
        'X-Correlation-Id': randomUUID()
      },
      body: JSON.stringify(testNotification)
    });

    const responseData = await response.json();
    
    console.log('Response status:', response.status);
    console.log('Response data:', JSON.stringify(responseData, null, 2));
    
    const passed = response.status === 400 && responseData.success === false;
    
    logTestResult('Invalid user ID', passed, `Status: ${response.status}`);
  } catch (error) {
    logTestResult('Invalid user ID', false, `Error: ${error.message}`);
  }
}

async function testDisabledNotifications() {
  console.log('\n=== Testing Disabled Notifications ===');
  
  try {
    const testNotification = {
      notification_type: 'email',
      user_id: 'email-disabled-user',
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
        'Authorization': `Bearer ${generateJWT('email-disabled-user')}`,
        'X-Correlation-Id': randomUUID()
      },
      body: JSON.stringify(testNotification)
    });

    const responseData = await response.json();
    
    console.log('Response status:', response.status);
    console.log('Response data:', JSON.stringify(responseData, null, 2));
    
    const passed = response.status === 400 && 
                   responseData.success === false && 
                   responseData.error.includes('disabled');
    
    logTestResult('Disabled notifications', passed, `Status: ${response.status}`);
  } catch (error) {
    logTestResult('Disabled notifications', false, `Error: ${error.message}`);
  }
}

async function testUnauthorizedAccess() {
  console.log('\n=== Testing Unauthorized Access ===');
  
  try {
    const testNotification = {
      notification_type: 'email',
      user_id: 'valid-user-id',
      template_code: 'welcome-email',
      variables: {
        name: 'Test User',
        link: 'https://example.com/verify'
      },
      request_id: randomUUID(),
      priority: 5,
      metadata: { test: true }
    };
    
    // Request without Authorization header
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
    
    const passed = response.status === 401 && responseData.success === false;
    
    logTestResult('Unauthorized access', passed, `Status: ${response.status}`);
  } catch (error) {
    logTestResult('Unauthorized access', false, `Error: ${error.message}`);
  }
}

// Main test runner
async function runTests() {
  console.log('🚀 Starting Basic API Gateway Tests');
  console.log('=====================================');
  
  try {
    // Start the mock server
    console.log('\n=== Starting Mock Server ===');
    server = createMockServer();
    server.listen(TEST_PORT, TEST_HOST, () => {
      console.log(`Mock server listening on ${TEST_HOST}:${TEST_PORT}`);
    });
    
    // Wait a bit for the server to start
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Run tests
    await testHealthEndpoint();
    await testValidEmailNotification();
    await testValidPushNotification();
    await testIdempotency();
    await testInvalidNotificationType();
    await testMissingRequiredFields();
    await testInvalidUserId();
    await testDisabledNotifications();
    await testUnauthorizedAccess();
    
    // Print test summary
    console.log('\n=====================================');
    console.log('📊 Test Summary:');
    console.log(`Total tests: ${testResults.total}`);
    console.log(`Passed: ${testResults.passed}`);
    console.log(`Failed: ${testResults.failed}`);
    console.log(`Success rate: ${((testResults.passed / testResults.total) * 100).toFixed(2)}%`);
    
    if (testResults.failed === 0) {
      console.log('\n🎉 All tests passed successfully!');
    } else {
      console.log('\n❌ Some tests failed. Please check the output above.');
    }
    
  } catch (error) {
    console.error('\n❌ Test runner failed:', error.message);
    console.error(error.stack);
  } finally {
    // Cleanup
    if (server) {
      server.close(() => {
        console.log('\n✅ Mock server stopped');
      });
    }
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