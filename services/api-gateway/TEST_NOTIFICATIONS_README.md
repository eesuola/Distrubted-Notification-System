# API Gateway Notification Tests

This document describes the comprehensive test suite for the API Gateway's notification endpoint (`POST /api/v1/notifications/`).

## Overview

The `test-notifications.js` script provides comprehensive testing of the notification endpoint, covering all aspects of the notification flow including:

1. Valid notification requests (email and push)
2. Idempotency checks
3. Error handling for invalid requests
4. User preference validation
5. Service discovery failures (circuit breaker)
6. Message queue integration

## Prerequisites

Before running the tests, ensure you have the following services available:

- **Redis**: For idempotency checks and status tracking
- **RabbitMQ**: For message queuing (optional - tests will work with mocks if not available)
- **Node.js**: Version 20 or higher

## Running the Tests

### Option 1: Using npm script

```bash
cd services/api-gateway
npm run test:notifications
```

### Option 2: Direct execution

```bash
cd services/api-gateway
node test-notifications.js
```

## Test Cases

The test suite includes the following test cases:

### 1. Valid Email Notification Request
- Sends a valid email notification request
- Verifies 202 Accepted response
- Checks response structure and notification_id

### 2. Valid Push Notification Request
- Sends a valid push notification request
- Verifies 202 Accepted response
- Checks response structure and notification_id

### 3. Idempotency Check
- Sends the same request twice with the same request_id
- Verifies both requests return the same response
- Ensures duplicate requests don't create duplicate notifications

### 4. Invalid Notification Type
- Sends a request with an invalid notification_type
- Verifies 400 Bad Request response
- Checks appropriate error message

### 5. Missing Required Fields
- Sends requests with missing required fields
- Tests multiple scenarios (missing notification_type, user_id, etc.)
- Verifies 400 Bad Request responses

### 6. Invalid User ID
- Sends a request with a non-existent user_id
- Verifies 400 Bad Request response
- Checks appropriate error message

### 7. Invalid Template Code
- Sends a request with a non-existent template_code
- Verifies 400 Bad Request response
- Checks appropriate error message

### 8. Email Notifications Disabled
- Sends an email notification to a user who has disabled email notifications
- Verifies 400 Bad Request response
- Checks error message about disabled notifications

### 9. Push Notifications Disabled
- Sends a push notification to a user who has disabled push notifications
- Verifies 400 Bad Request response
- Checks error message about disabled notifications

### 10. Service Discovery Failure (Circuit Breaker)
- Simulates a service discovery failure
- Verifies 503 Service Unavailable response
- Checks circuit breaker functionality

### 11. RabbitMQ Message Verification
- Verifies messages are correctly published to the appropriate queues
- Checks message structure and content
- Validates routing to email.queue or push.queue based on notification_type

## Mock Services

The test script uses mocks for external services:

### User Service Mock
- Provides mock user data for different scenarios
- Supports users with different notification preferences
- Handles non-existent user scenarios

### Template Service Mock
- Provides mock template data
- Supports different template types
- Handles non-existent template scenarios

### Redis Mock
- Uses `ioredis-mock` for in-memory Redis operations
- Supports idempotency checks
- Stores notification status

### RabbitMQ Integration
- Attempts to connect to real RabbitMQ instance if available
- Falls back to mock behavior if RabbitMQ is not available
- Captures messages for verification

## Test Output

The test script provides detailed output for each test case:

```
🚀 Starting API Gateway Notification Tests
==========================================

=== Setup ===
RabbitMQ setup completed
Redis setup completed
Starting API Gateway server...
Server started on 127.0.0.1:3002

=== Test 1: Valid email notification request ===
Response status: 202
Response data: {
  "success": true,
  "message": "Notification accepted for processing",
  "data": {
    "notification_id": "550e8400-e29b-41d4-a716-446655440000",
    "request_id": "550e8400-e29b-41d4-a716-446655440000",
    "status": "accepted"
  }
}
✅ Test 1 passed: Valid email notification request

...

=== Verifying RabbitMQ Messages ===
Found 2 messages in email queue
Found 1 messages in push queue
Email message content: {
  "notification_id": "550e8400-e29b-41d4-a716-446655440000",
  "user_id": "user-123",
  "notification_type": "email",
  ...
}
✅ Email queue message structure verified
✅ Push queue message structure verified

🎉 All tests passed successfully!
```

## Troubleshooting

### Port Already in Use
If you get a port conflict error, you can change the test port in the script:

```javascript
const TEST_PORT = 3003; // Change to an available port
```

### RabbitMQ Connection Issues
If RabbitMQ is not available, tests will continue with mock behavior. You'll see a warning message:

```
⚠️  No messages in queues (RabbitMQ might not be available)
```

### Authentication Issues
The test script uses a default JWT secret. If your API Gateway is configured with a different secret, set the environment variable:

```bash
export JWT_SECRET="your-secret-key"
npm run test:notifications
```

## Environment Variables

The test script respects the following environment variables:

- `JWT_SECRET`: Secret for JWT token generation (default: 'default-secret-key')
- `RABBITMQ_URL`: RabbitMQ connection URL (default: 'amqp://localhost:5672')

## Customization

You can customize the test script by:

1. **Adding new test cases**: Follow the existing pattern in the script
2. **Modifying mock data**: Update the `mockUsers` and `mockTemplates` objects
3. **Changing test configuration**: Modify the constants at the top of the script

## Integration with CI/CD

This test script can be integrated into CI/CD pipelines:

```yaml
# Example GitHub Actions step
- name: Run API Gateway Tests
  run: |
    cd services/api-gateway
    npm run test:notifications
```

## Related Files

- `test-complete-flow.js`: Tests the complete notification flow
- `test-rabbitmq.js`: Tests RabbitMQ integration specifically
- `test-notification-status.js`: Tests notification status tracking