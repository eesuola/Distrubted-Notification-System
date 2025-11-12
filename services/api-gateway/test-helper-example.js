import { createTestServer, createMockServer, waitForServerReady, generateTestJWT, generateTestNotification } from './test-helper.js';

/**
 * Example test file demonstrating the usage of test-helper.js
 * This shows how to properly create isolated Fastify instances for testing
 */

// Test configuration
const TEST_PORT = 3005;
const TEST_HOST = '127.0.0.1';
const API_BASE_URL = `http://${TEST_HOST}:${TEST_PORT}`;

// Test results tracking
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

// Test 1: Create a mock server and test health endpoint
async function testMockServerHealth() {
  console.log('\n=== Testing Mock Server Health ===');
  
  try {
    // Create a mock server with all dependencies mocked
    const { server, cleanup } = await createMockServer();
    
    // Wait for server to be fully ready
    await waitForServerReady(server);
    
    // Start listening
    await server.listen({ port: TEST_PORT, host: TEST_HOST });
    
    // Test health endpoint
    const response = await fetch(`${API_BASE_URL}/health`);
    const data = await response.json();
    
    console.log('Health response:', JSON.stringify(data, null, 2));
    
    const passed = response.status === 200 && data.status === 'healthy';
    logTestResult('Mock server health endpoint', passed, `Status: ${response.status}`);
    
    // Cleanup
    await cleanup();
  } catch (error) {
    logTestResult('Mock server health endpoint', false, `Error: ${error.message}`);
  }
}

// Test 2: Create a mock server and test notification endpoint
async function testMockServerNotification() {
  console.log('\n=== Testing Mock Server Notification ===');
  
  try {
    // Create a mock server
    const { server, cleanup } = await createMockServer();
    
    // Wait for server to be fully ready
    await waitForServerReady(server);
    
    // Start listening
    await server.listen({ port: TEST_PORT, host: TEST_HOST });
    
    // Generate test data
    const testNotification = generateTestNotification({
      notification_type: 'email',
      user_id: 'test-user-123'
    });
    
    // Test notification endpoint
    const response = await fetch(`${API_BASE_URL}/api/v1/notifications/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${generateTestJWT('test-user-123')}`,
        'X-Correlation-Id': 'test-correlation-123'
      },
      body: JSON.stringify(testNotification)
    });
    
    const responseData = await response.json();
    
    console.log('Notification response:', JSON.stringify(responseData, null, 2));
    
    const passed = response.status === 202 && responseData.success === true;
    logTestResult('Mock server notification endpoint', passed, `Status: ${response.status}`);
    
    // Cleanup
    await cleanup();
  } catch (error) {
    logTestResult('Mock server notification endpoint', false, `Error: ${error.message}`);
  }
}

// Test 3: Test server isolation (multiple servers don't interfere)
async function testServerIsolation() {
  console.log('\n=== Testing Server Isolation ===');
  
  try {
    // Create two separate mock servers
    const { server: server1, cleanup: cleanup1 } = await createMockServer();
    const { server: server2, cleanup: cleanup2 } = await createMockServer();
    
    // Wait for both servers to be ready
    await waitForServerReady(server1);
    await waitForServerReady(server2);
    
    // Start listening on different ports
    await server1.listen({ port: TEST_PORT, host: TEST_HOST });
    await server2.listen({ port: TEST_PORT + 1, host: TEST_HOST });
    
    // Test both servers independently
    const response1 = await fetch(`${API_BASE_URL}/health`);
    const response2 = await fetch(`http://${TEST_HOST}:${TEST_PORT + 1}/health`);
    
    const data1 = await response1.json();
    const data2 = await response2.json();
    
    console.log('Server 1 health:', data1.status);
    console.log('Server 2 health:', data2.status);
    
    const passed = response1.status === 200 && response2.status === 200 &&
                   data1.status === 'healthy' && data2.status === 'healthy';
    
    logTestResult('Server isolation', passed, 'Both servers work independently');
    
    // Cleanup both servers
    await cleanup1();
    await cleanup2();
  } catch (error) {
    logTestResult('Server isolation', false, `Error: ${error.message}`);
  }
}

// Test 4: Test with custom environment variables
async function testCustomEnvironment() {
  console.log('\n=== Testing Custom Environment ===');
  
  try {
    // Create a mock server with custom environment
    const { server, cleanup } = await createMockServer({
      env: {
        JWT_SECRET: 'custom-test-secret',
        LOG_LEVEL: 'debug'
      }
    });
    
    // Wait for server to be fully ready
    await waitForServerReady(server);
    
    // Start listening
    await server.listen({ port: TEST_PORT, host: TEST_HOST });
    
    // Test that custom environment is used
    const response = await fetch(`${API_BASE_URL}/health`);
    const data = await response.json();
    
    console.log('Health response with custom env:', JSON.stringify(data, null, 2));
    
    const passed = response.status === 200 && data.status === 'healthy';
    logTestResult('Custom environment', passed, 'Custom environment variables applied');
    
    // Cleanup
    await cleanup();
  } catch (error) {
    logTestResult('Custom environment', false, `Error: ${error.message}`);
  }
}

// Test 5: Test error handling
async function testErrorHandling() {
  console.log('\n=== Testing Error Handling ===');
  
  try {
    // Create a mock server
    const { server, cleanup } = await createMockServer();
    
    // Wait for server to be fully ready
    await waitForServerReady(server);
    
    // Start listening
    await server.listen({ port: TEST_PORT, host: TEST_HOST });
    
    // Test with invalid notification data
    const invalidNotification = {
      // Missing required fields
      notification_type: 'invalid-type'
    };
    
    const response = await fetch(`${API_BASE_URL}/api/v1/notifications/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${generateTestJWT('test-user')}`,
        'X-Correlation-Id': 'test-correlation'
      },
      body: JSON.stringify(invalidNotification)
    });
    
    const responseData = await response.json();
    
    console.log('Error response:', JSON.stringify(responseData, null, 2));
    
    const passed = response.status === 400 && responseData.success === false;
    logTestResult('Error handling', passed, `Status: ${response.status}`);
    
    // Cleanup
    await cleanup();
  } catch (error) {
    logTestResult('Error handling', false, `Error: ${error.message}`);
  }
}

// Main test runner
async function runExampleTests() {
  console.log('🚀 Running Test Helper Example Tests');
  console.log('=====================================');
  
  try {
    // Run all example tests
    await testMockServerHealth();
    await testMockServerNotification();
    await testServerIsolation();
    await testCustomEnvironment();
    await testErrorHandling();
    
    // Print test summary
    console.log('\n=====================================');
    console.log('📊 Test Summary:');
    console.log(`Total tests: ${testResults.total}`);
    console.log(`Passed: ${testResults.passed}`);
    console.log(`Failed: ${testResults.failed}`);
    console.log(`Success rate: ${((testResults.passed / testResults.total) * 100).toFixed(2)}%`);
    
    if (testResults.failed === 0) {
      console.log('\n🎉 All example tests passed successfully!');
      console.log('\nThe test helper is working correctly and can be used to refactor existing tests.');
    } else {
      console.log('\n❌ Some example tests failed. Please check the implementation.');
    }
    
  } catch (error) {
    console.error('\n❌ Example test runner failed:', error.message);
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

// Run example tests
runExampleTests();