# API Gateway Test Helper

This directory contains test helpers for the API Gateway service to create isolated Fastify instances for testing.

## Overview

The test helper addresses race conditions that can occur when:
1. Plugins are not registered in the correct order
2. Routes are registered before plugins are fully initialized
3. Multiple test servers interfere with each other

## Files

### `test-helper.js`

The original test helper that attempts to dynamically import real plugins and falls back to mock implementations when dependencies are missing.

### `test-helper-simple.js`

A simplified version that uses only mock implementations to avoid dependency issues.

### `test-helper-isolated.js`

A completely isolated version that creates fresh instances with in-memory mocks, avoiding any potential conflicts.

## Usage

### Basic Usage

```javascript
import { createMockServer, generateTestJWT, generateTestNotification } from './test-helper-isolated.js';

// Create a mock server with all dependencies mocked
const { server, cleanup } = await createMockServer();

// Start the server
await server.listen({ port: 3000, host: '127.0.0.1' });

// Run your tests...

// Cleanup when done
await cleanup();
```

### Advanced Usage

```javascript
import { createMockServer, generateTestJWT, generateTestNotification } from './test-helper-isolated.js';

// Create a mock server with custom options
const { server, cleanup } = await createMockServer({
  env: {
    NODE_ENV: 'test',
    LOG_LEVEL: 'debug'
  },
  logger: {
    level: 'debug',
    prettyPrint: true
  },
  skipAuth: true // Skip authentication if needed
});

// Generate test data
const testNotification = generateTestNotification({
  notification_type: 'push',
  user_id: 'custom-user-id'
});

// Generate test JWT
const testJWT = generateTestJWT('custom-user-id');
```

## Available Functions

### `createMockServer(options)`

Creates a Fastify server with all dependencies mocked.

**Options:**
- `env` - Environment variable overrides
- `logger` - Logger configuration overrides
- `skipAuth` - Skip authentication plugin (default: false)

**Returns:**
- `server` - Fastify server instance
- `cleanup` - Cleanup function to call when done

### `createTestServer(options)`

Creates a Fastify server with real plugins if available, falls back to mocks if not.

**Options:**
- `useMocks` - Force use of mock implementations (default: false)
- `env` - Environment variable overrides
- `logger` - Logger configuration overrides
- `skipAuth` - Skip authentication plugin (default: false)

**Returns:**
- `server` - Fastify server instance
- `cleanup` - Cleanup function to call when done

### `generateTestJWT(userId)`

Generates a mock JWT token for testing.

**Parameters:**
- `userId` - User ID for the token

**Returns:**
- Mock JWT token string

### `generateTestNotification(overrides)`

Generates test notification data.

**Parameters:**
- `overrides` - Object with properties to override defaults

**Returns:**
- Test notification object

### `waitForServerReady(server, timeout)`

Waits for a server to be fully ready.

**Parameters:**
- `server` - Fastify server instance
- `timeout` - Maximum time to wait in milliseconds (default: 5000)

**Returns:**
- Promise that resolves when ready

### `getMockData()`

Gets the mock data objects for testing.

**Returns:**
- Object with mock implementations of Redis, Consul, and RabbitMQ

### `resetMockData()`

Resets all mock data between tests.

## Example Test

```javascript
import { createMockServer, generateTestJWT, generateTestNotification } from './test-helper-isolated.js';

async function testNotificationEndpoint() {
  // Create a mock server
  const { server, cleanup } = await createMockServer();
  
  try {
    // Start the server
    await server.listen({ port: 3000, host: '127.0.0.1' });
    
    // Generate test data
    const testNotification = generateTestNotification();
    const testJWT = generateTestJWT('test-user');
    
    // Test the notification endpoint
    const response = await fetch('http://127.0.0.1:3000/api/v1/notifications/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${testJWT}`,
        'X-Correlation-Id': 'test-correlation-123'
      },
      body: JSON.stringify(testNotification)
    });
    
    const data = await response.json();
    console.log('Response:', data);
    
    // Cleanup
    await cleanup();
  } catch (error) {
    console.error('Test failed:', error);
  }
}

testNotificationEndpoint();
```

## Key Features

1. **Proper Plugin Registration Order**
   - Correlation ID plugin first
   - Redis plugin second
   - Consul plugin third
   - RabbitMQ plugin fourth
   - Authentication plugin fifth
   - Routes registered last

2. **Race Condition Prevention**
   - Waits for `server.ready()` to ensure all hooks complete
   - Only registers routes after plugins are fully initialized

3. **Complete Mock Implementations**
   - In-memory Redis with all required methods
   - Mock Consul with service discovery
   - Mock RabbitMQ with message publishing
   - Mock JWT authentication

4. **Isolation**
   - Each server instance is completely isolated
   - No shared state between test runs
   - Proper cleanup of resources

## Migration from Existing Tests

To refactor existing tests to use the new test helper:

1. Replace manual server creation with `createMockServer()`
2. Replace manual JWT generation with `generateTestJWT()`
3. Replace manual notification data creation with `generateTestNotification()`
4. Add proper cleanup with the returned cleanup function
5. Use the mock data from `getMockData()` if needed for assertions

## Benefits

1. **Reliability**: Eliminates race conditions
2. **Isolation**: Tests don't interfere with each other
3. **Speed**: No need to wait for real connections
4. **Simplicity**: Easy to use and understand
5. **Maintainability**: Centralized test logic