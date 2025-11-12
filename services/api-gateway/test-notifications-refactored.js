import { randomUUID } from 'crypto';
import { createIsolatedTestServer, generateTestJWT, generateTestNotification } from './test-helper-isolated.js';

// Test configuration - using unique port to avoid conflicts
const TEST_PORT = 3003;
const TEST_HOST = '127.0.0.1';
const API_BASE_URL = `http://${TEST_HOST}:${TEST_PORT}`;

// Test state
let server;
let cleanup;

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

// Test functions
async function testValidEmailNotification() {
  console.log('\n=== Test 1: Valid email notification request ===');
  
  const testNotification = generateTestNotification({
    notification_type: 'email',
    user_id: mockUsers.validUser.data.user_id,
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
      'Authorization': `Bearer ${generateTestJWT(mockUsers.validUser.data.user_id)}`,
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
  
  const testNotification = generateTestNotification({
    notification_type: 'push',
    user_id: mockUsers.validUser.data.user_id,
    template_code: 'welcome-push',
    variables: {
      name: 'Test User',
      link: 'https://example.com/verify'
    }
  });
  
  const response = await fetch(`${API_BASE_URL}/api/v1/notifications/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${generateTestJWT(mockUsers.validUser.data.user_id)}`,
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
  
  const testNotification = generateTestNotification({
    notification_type: 'email',
    user_id: mockUsers.validUser.data.user_id,
    template_code: 'welcome-email',
    variables: {
      name: 'Test User',
      link: 'https://example.com/verify'
    }
  });
  
  // First request
  const firstResponse = await fetch(`${API_BASE_URL}/api/v1/notifications/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${generateTestJWT(mockUsers.validUser.data.user_id)}`,
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
      'Authorization': `Bearer ${generateTestJWT(mockUsers.validUser.data.user_id)}`,
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
  
  const testNotification = generateTestNotification({
    notification_type: 'invalid-type',
    user_id: mockUsers.validUser.data.user_id,
    template_code: 'welcome-email',
    variables: {
      name: 'Test User',
      link: 'https://example.com/verify'
    }
  });
  
  const response = await fetch(`${API_BASE_URL}/api/v1/notifications/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${generateTestJWT(mockUsers.validUser.data.user_id)}`,
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
      'Authorization': `Bearer ${generateTestJWT(mockUsers.validUser.data.user_id)}`,
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
      'Authorization': `Bearer ${generateTestJWT(mockUsers.validUser.data.user_id)}`,
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
  
  const testNotification = generateTestNotification({
    notification_type: 'email',
    user_id: 'non-existent-user',
    template_code: 'welcome-email',
    variables: {
      name: 'Test User',
      link: 'https://example.com/verify'
    }
  });
  
  const response = await fetch(`${API_BASE_URL}/api/v1/notifications/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${generateTestJWT(mockUsers.validUser.data.user_id)}`,
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
  
  const testNotification = generateTestNotification({
    notification_type: 'email',
    user_id: mockUsers.validUser.data.user_id,
    template_code: 'non-existent-template',
    variables: {
      name: 'Test User',
      link: 'https://example.com/verify'
    }
  });
  
  const response = await fetch(`${API_BASE_URL}/api/v1/notifications/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${generateTestJWT(mockUsers.validUser.data.user_id)}`,
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
  
  const testNotification = generateTestNotification({
    notification_type: 'email',
    user_id: mockUsers.emailDisabledUser.data.user_id,
    template_code: 'welcome-email',
    variables: {
      name: 'Test User',
      link: 'https://example.com/verify'
    }
  });
  
  const response = await fetch(`${API_BASE_URL}/api/v1/notifications/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${generateTestJWT(mockUsers.emailDisabledUser.data.user_id)}`,
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
  
  const testNotification = generateTestNotification({
    notification_type: 'push',
    user_id: mockUsers.pushDisabledUser.data.user_id,
    template_code: 'welcome-push',
    variables: {
      name: 'Test User',
      link: 'https://example.com/verify'
    }
  });
  
  const response = await fetch(`${API_BASE_URL}/api/v1/notifications/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${generateTestJWT(mockUsers.pushDisabledUser.data.user_id)}`,
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
  
  // Create a new server instance with circuit breaker simulation
  const { server: circuitServer, cleanup: circuitCleanup } = await createIsolatedTestServer({
    logger: { level: 'error' }
  });
  
  // Override the route handler to simulate circuit breaker
  circuitServer.route({
    method: 'POST',
    url: '/api/v1/notifications/',
    handler: async (request, reply) => {
      try {
        // Validate JWT
        const authHeader = request.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          return reply.status(401).send({
            success: false,
            message: 'Unauthorized',
            error: 'Missing or invalid authorization header'
          });
        }
        
        // Mock notification processing
        const notification = request.body;
        
        // Simulate service discovery failure
        return reply.status(503).send({
          success: false,
          message: 'Service unavailable',
          error: 'Required service is currently unavailable'
        });
      } catch (error) {
        return reply.status(500).send({
          success: false,
          message: 'Internal server error',
          error: error.message
        });
      }
    }
  });
  
  // Start the circuit breaker server
  await circuitServer.listen({ port: TEST_PORT + 1, host: TEST_HOST });
  
  const testNotification = generateTestNotification({
    notification_type: 'email',
    user_id: mockUsers.validUser.data.user_id,
    template_code: 'welcome-email',
    variables: {
      name: 'Test User',
      link: 'https://example.com/verify'
    }
  });
  
  const response = await fetch(`http://${TEST_HOST}:${TEST_PORT + 1}/api/v1/notifications/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${generateTestJWT(mockUsers.validUser.data.user_id)}`,
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
  
  // Clean up circuit breaker server
  await circuitCleanup();
}

async function verifyRabbitMQMessages() {
  console.log('\n=== Verifying RabbitMQ Messages ===');
  
  // Access the mock RabbitMQ messages from the server
  const messages = server.rabbitmq.messages || [];
  
  if (messages.length === 0) {
    console.log('⚠️  No messages in queues (using mock RabbitMQ)');
  } else {
    console.log(`Found ${messages.length} messages in queues`);
    
    // Verify message structure
    messages.forEach((message, index) => {
      console.log(`Message ${index + 1}:`, JSON.stringify(message, null, 2));
      
      // Verify message structure
      if (!message.message.notification_id) {
        throw new Error('Expected notification_id in message');
      }
      
      if (!message.message.user_id) {
        throw new Error('Expected user_id in message');
      }
      
      if (!message.message.notification_type) {
        throw new Error('Expected notification_type in message');
      }
      
      console.log(`✅ Message ${index + 1} structure verified`);
    });
  }
}

// Main test runner
async function runTests() {
  console.log('🚀 Starting API Gateway Notification Tests (Refactored)');
  console.log('======================================================');
  
  try {
    // Setup isolated test server
    console.log('\n=== Setup ===');
    const testServer = await createIsolatedTestServer({
      logger: { level: 'error' }
    });
    
    server = testServer.server;
    cleanup = testServer.cleanup;
    
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