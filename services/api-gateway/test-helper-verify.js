import { createMockServer, generateTestJWT, generateTestNotification } from './test-helper-simple.js';

async function testHelperFunctionality() {
  console.log('🚀 Verifying Test Helper Functionality');
  console.log('=====================================');
  
  let testResults = {
    passed: 0,
    failed: 0,
    total: 0
  };

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

  try {
    // Test 1: Create a mock server
    console.log('\n=== Test 1: Create Mock Server ===');
    const { server, cleanup } = await createMockServer();
    logTestResult('Create mock server', true, 'Server instance created');
    
    // Test 2: Start server
    console.log('\n=== Test 2: Start Server ===');
    await server.listen({ port: 3005, host: '127.0.0.1' });
    logTestResult('Start server', true, 'Server listening on port 3005');
    
    // Test 3: Health endpoint
    console.log('\n=== Test 3: Health Endpoint ===');
    const healthResponse = await fetch('http://127.0.0.1:3005/health');
    const healthData = await healthResponse.json();
    const healthPassed = healthResponse.status === 200 && healthData.status === 'healthy';
    logTestResult('Health endpoint', healthPassed, `Status: ${healthResponse.status}`);
    
    // Test 4: Notification endpoint with valid data
    console.log('\n=== Test 4: Valid Notification ===');
    const testNotification = generateTestNotification();
    const notificationResponse = await fetch('http://127.0.0.1:3005/api/v1/notifications/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${generateTestJWT('test-user')}`,
        'X-Correlation-Id': 'test-correlation-123'
      },
      body: JSON.stringify(testNotification)
    });
    
    const notificationData = await notificationResponse.json();
    const notificationPassed = notificationResponse.status === 202 && notificationData.success === true;
    logTestResult('Valid notification', notificationPassed, `Status: ${notificationResponse.status}`);
    
    // Test 5: Idempotency (same request_id)
    console.log('\n=== Test 5: Idempotency ===');
    const idempotencyResponse = await fetch('http://127.0.0.1:3005/api/v1/notifications/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${generateTestJWT('test-user')}`,
        'X-Correlation-Id': 'test-correlation-456'
      },
      body: JSON.stringify(testNotification) // Same request_id
    });
    
    const idempotencyData = await idempotencyResponse.json();
    const idempotencyPassed = idempotencyResponse.status === 202 && 
                               idempotencyData.success === true && 
                               idempotencyData.data.notification_id === notificationData.data.notification_id;
    logTestResult('Idempotency', idempotencyPassed, 'Same notification_id returned');
    
    // Test 6: Invalid notification type
    console.log('\n=== Test 6: Invalid Notification Type ===');
    const invalidNotification = {
      ...testNotification,
      notification_type: 'invalid-type'
    };
    
    const invalidResponse = await fetch('http://127.0.0.1:3005/api/v1/notifications/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${generateTestJWT('test-user')}`,
        'X-Correlation-Id': 'test-correlation-789'
      },
      body: JSON.stringify(invalidNotification)
    });
    
    const invalidData = await invalidResponse.json();
    const invalidPassed = invalidResponse.status === 400 && invalidData.success === false;
    logTestResult('Invalid notification type', invalidPassed, `Status: ${invalidResponse.status}`);
    
    // Test 7: Missing authentication
    console.log('\n=== Test 7: Missing Authentication ===');
    const noAuthResponse = await fetch('http://127.0.0.1:3005/api/v1/notifications/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Correlation-Id': 'test-correlation-999'
        // No Authorization header
      },
      body: JSON.stringify(testNotification)
    });
    
    const noAuthData = await noAuthResponse.json();
    const noAuthPassed = noAuthResponse.status === 401 && noAuthData.success === false;
    logTestResult('Missing authentication', noAuthPassed, `Status: ${noAuthResponse.status}`);
    
    // Cleanup
    console.log('\n=== Cleanup ===');
    await cleanup();
    logTestResult('Cleanup', true, 'Server closed successfully');
    
  } catch (error) {
    console.error('❌ Test suite failed:', error.message);
    logTestResult('Test suite', false, `Error: ${error.message}`);
  }
  
  // Print summary
  console.log('\n=====================================');
  console.log('📊 Test Summary:');
  console.log(`Total tests: ${testResults.total}`);
  console.log(`Passed: ${testResults.passed}`);
  console.log(`Failed: ${testResults.failed}`);
  console.log(`Success rate: ${((testResults.passed / testResults.total) * 100).toFixed(2)}%`);
  
  if (testResults.failed === 0) {
    console.log('\n🎉 All tests passed successfully!');
    console.log('\nThe test helper is working correctly and can be used to refactor existing tests.');
  } else {
    console.log('\n❌ Some tests failed. Please check implementation.');
  }
}

testHelperFunctionality();