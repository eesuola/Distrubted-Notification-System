import { randomUUID } from 'crypto';
import { createServer } from 'http';

// Simple in-memory Redis mock
const createRedisMock = () => {
  const data = new Map();
  const ttlMap = new Map();
  
  const checkTTL = (key) => {
    if (ttlMap.has(key)) {
      const expiry = ttlMap.get(key);
      if (Date.now() > expiry) {
        data.delete(key);
        ttlMap.delete(key);
        return false;
      }
    }
    return true;
  };
  
  return {
    get: async (key) => {
      if (!checkTTL(key)) return null;
      return data.get(key) || null;
    },
    setex: async (key, ttl, value) => {
      data.set(key, value);
      ttlMap.set(key, Date.now() + (ttl * 1000));
      return 'OK';
    },
    del: async (key) => {
      const existed = data.has(key);
      data.delete(key);
      ttlMap.delete(key);
      return existed ? 1 : 0;
    },
    quit: async () => 'OK'
  };
};

// Test configuration
const TEST_PORT = 3004;
const TEST_HOST = '127.0.0.1';
const API_BASE_URL = `http://${TEST_HOST}:${TEST_PORT}`;

// Test state
let server;
let redis;
let testResults = {
  passed: 0,
  failed: 0,
  total: 0
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

      // Status endpoint
      if (path.startsWith('/api/v1/notifications/') && path.endsWith('/status') && method === 'GET') {
        // Extract notification_id from path
        const pathParts = path.split('/');
        const notificationId = pathParts[4]; // /api/v1/notifications/{notification_id}/status

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

        // Get notification status from Redis
        const statusKey = `notification_status:${notificationId}`;
        const statusData = await redis.get(statusKey);
        
        if (!statusData) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: false,
            message: 'Notification status not found',
            error: `No status found for notification ID: ${notificationId}`
          }));
          return;
        }

        const parsedStatusData = JSON.parse(statusData);
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          message: 'Notification status retrieved successfully',
          data: parsedStatusData
        }));
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

async function testGetExistingNotificationStatus() {
  console.log('\n=== Testing GET Existing Notification Status ===');
  
  try {
    // Create test notification status data
    const notificationId = 'test-notification-123';
    const statusData = {
      notification_id: notificationId,
      status: 'delivered',
      timestamp: new Date().toISOString(),
      error: null,
      correlation_id: 'test-correlation-456',
      updated_by: 'email-service'
    };
    
    // Store test data in Redis
    const statusKey = `notification_status:${notificationId}`;
    await redis.setex(statusKey, 3600, JSON.stringify(statusData));
    
    // Make request to get status
    const response = await fetch(`${API_BASE_URL}/api/v1/notifications/${notificationId}/status`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${generateJWT('test-user')}`,
        'X-Correlation-Id': randomUUID()
      }
    });

    const responseData = await response.json();
    
    console.log('Response status:', response.status);
    console.log('Response data:', JSON.stringify(responseData, null, 2));
    
    const passed = response.status === 200 && 
                   responseData.success === true && 
                   responseData.data?.notification_id === notificationId &&
                   responseData.data?.status === 'delivered';
    
    logTestResult('GET existing notification status', passed, `Status: ${response.status}`);
    
    // Clean up test data
    await redis.del(statusKey);
  } catch (error) {
    logTestResult('GET existing notification status', false, `Error: ${error.message}`);
  }
}

async function testGetNonExistingNotificationStatus() {
  console.log('\n=== Testing GET Non-Existing Notification Status ===');
  
  try {
    const notificationId = 'non-existing-notification-456';
    
    // Make request to get status
    const response = await fetch(`${API_BASE_URL}/api/v1/notifications/${notificationId}/status`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${generateJWT('test-user')}`,
        'X-Correlation-Id': randomUUID()
      }
    });

    const responseData = await response.json();
    
    console.log('Response status:', response.status);
    console.log('Response data:', JSON.stringify(responseData, null, 2));
    
    const passed = response.status === 404 && 
                   responseData.success === false && 
                   responseData.error.includes('No status found');
    
    logTestResult('GET non-existing notification status', passed, `Status: ${response.status}`);
  } catch (error) {
    logTestResult('GET non-existing notification status', false, `Error: ${error.message}`);
  }
}

async function testGetNotificationStatusWithoutAuth() {
  console.log('\n=== Testing GET Notification Status Without Auth ===');
  
  try {
    const notificationId = 'test-notification-789';
    
    // Make request without Authorization header
    const response = await fetch(`${API_BASE_URL}/api/v1/notifications/${notificationId}/status`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-Correlation-Id': randomUUID()
      }
    });

    const responseData = await response.json();
    
    console.log('Response status:', response.status);
    console.log('Response data:', JSON.stringify(responseData, null, 2));
    
    const passed = response.status === 401 && 
                   responseData.success === false && 
                   responseData.error.includes('authorization');
    
    logTestResult('GET notification status without auth', passed, `Status: ${response.status}`);
  } catch (error) {
    logTestResult('GET notification status without auth', false, `Error: ${error.message}`);
  }
}

async function testGetNotificationStatusWithInvalidAuth() {
  console.log('\n=== Testing GET Notification Status With Invalid Auth ===');
  
  try {
    const notificationId = 'test-notification-999';
    
    // Make request with invalid Authorization header
    const response = await fetch(`${API_BASE_URL}/api/v1/notifications/${notificationId}/status`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer invalid-token',
        'X-Correlation-Id': randomUUID()
      }
    });

    const responseData = await response.json();
    
    console.log('Response status:', response.status);
    console.log('Response data:', JSON.stringify(responseData, null, 2));
    
    const passed = response.status === 401 && 
                   responseData.success === false && 
                   responseData.error.includes('Invalid JWT');
    
    logTestResult('GET notification status with invalid auth', passed, `Status: ${response.status}`);
  } catch (error) {
    logTestResult('GET notification status with invalid auth', false, `Error: ${error.message}`);
  }
}

async function testGetNotificationStatusWithFailedStatus() {
  console.log('\n=== Testing GET Notification Status With Failed Status ===');
  
  try {
    // Create test notification status data with failed status
    const notificationId = 'test-notification-failed';
    const statusData = {
      notification_id: notificationId,
      status: 'failed',
      timestamp: new Date().toISOString(),
      error: 'SMTP server not responding',
      correlation_id: 'test-correlation-failed',
      updated_by: 'email-service'
    };
    
    // Store test data in Redis
    const statusKey = `notification_status:${notificationId}`;
    await redis.setex(statusKey, 3600, JSON.stringify(statusData));
    
    // Make request to get status
    const response = await fetch(`${API_BASE_URL}/api/v1/notifications/${notificationId}/status`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${generateJWT('test-user')}`,
        'X-Correlation-Id': randomUUID()
      }
    });

    const responseData = await response.json();
    
    console.log('Response status:', response.status);
    console.log('Response data:', JSON.stringify(responseData, null, 2));
    
    const passed = response.status === 200 && 
                   responseData.success === true && 
                   responseData.data?.notification_id === notificationId &&
                   responseData.data?.status === 'failed' &&
                   responseData.data?.error === 'SMTP server not responding';
    
    logTestResult('GET notification status with failed status', passed, `Status: ${response.status}`);
    
    // Clean up test data
    await redis.del(statusKey);
  } catch (error) {
    logTestResult('GET notification status with failed status', false, `Error: ${error.message}`);
  }
}

// Main test runner
async function runTests() {
  console.log('🚀 Starting Status Endpoint Tests');
  console.log('===================================');
  
  try {
    // Initialize Redis mock
    redis = createRedisMock();
    console.log('Redis mock initialized');
    
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
    await testGetExistingNotificationStatus();
    await testGetNonExistingNotificationStatus();
    await testGetNotificationStatusWithoutAuth();
    await testGetNotificationStatusWithInvalidAuth();
    await testGetNotificationStatusWithFailedStatus();
    
    // Print test summary
    console.log('\n===================================');
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
    
    if (redis) {
      await redis.quit();
      console.log('✅ Redis connection closed');
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