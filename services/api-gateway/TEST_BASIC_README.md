# Basic API Gateway Test

This document explains how to use the `test-basic.js` script to verify the core functionality of the API Gateway service.

## Overview

The `test-basic.js` script is a lightweight test suite that verifies the basic functionality of the API Gateway notification endpoint without requiring external dependencies. It uses in-memory mocks for:

- User Service responses
- Template Service responses
- Redis for idempotency
- HTTP server to simulate the API Gateway

## Test Cases

The test suite includes the following test cases:

1. **Health Endpoint Test**
   - Verifies the `/health` endpoint returns a 200 status code
   - Checks that the response contains the expected health status

2. **Valid Email Notification Test**
   - Sends a properly formatted email notification request
   - Verifies the response format and status code (202)
   - Checks that the notification_id matches the request_id

3. **Valid Push Notification Test**
   - Sends a properly formatted push notification request
   - Verifies the response format and status code (202)
   - Checks that the notification_id matches the request_id

4. **Idempotency Test**
   - Sends two identical requests with the same request_id
   - Verifies that both requests return the same response
   - Ensures the second request is served from cache

5. **Invalid Notification Type Test**
   - Sends a request with an invalid notification_type
   - Verifies the response returns a 400 status code
   - Checks that the error message is appropriate

6. **Missing Required Fields Test**
   - Sends a request with missing required fields
   - Verifies the response returns a 400 status code
   - Checks that the error message is appropriate

7. **Invalid User ID Test**
   - Sends a request with a non-existent user_id
   - Verifies the response returns a 400 status code
   - Checks that the error message indicates user not found

8. **Disabled Notifications Test**
   - Sends a request for a user who has disabled notifications
   - Verifies the response returns a 400 status code
   - Checks that the error message mentions disabled notifications

9. **Unauthorized Access Test**
   - Sends a request without an Authorization header
   - Verifies the response returns a 401 status code
   - Checks that the error message indicates unauthorized access

## Running the Tests

### Prerequisites

- Node.js 20+ installed
- No external dependencies required (uses built-in Node.js modules)

### Execution

To run the basic test suite:

```bash
# From the services/api-gateway directory
npm run test:basic
```

Or directly:

```bash
node test-basic.js
```

### Expected Output

The test output will show:

1. Progress of each test case with pass/fail status
2. Response data for each test
3. A summary showing total tests, passed, failed, and success rate

Example output:
```
🚀 Starting Basic API Gateway Tests
=====================================

=== Starting Mock Server ===
Mock server listening on 127.0.0.1:3003

=== Testing Health Endpoint ===
Response status: 200
Response data: {
  "status": "healthy",
  "timestamp": "2025-11-12T20:25:00.000Z",
  "service": "api-gateway",
  "uptime": 0.123
}
✅ Health endpoint: PASSED - Status: 200

=== Testing Valid Email Notification ===
Response status: 202
Response data: {
  "success": true,
  "message": "Notification accepted for processing",
  "data": {
    "notification_id": "abc-123-def-456",
    "request_id": "abc-123-def-456",
    "status": "accepted"
  }
}
✅ Valid email notification: PASSED - Status: 202

...

=====================================
📊 Test Summary:
Total tests: 9
Passed: 9
Failed: 0
Success rate: 100.00%

🎉 All tests passed successfully!
```

## Mock Data

The test script uses the following mock data:

### Users

1. **valid-user-id**: A user with both email and push notifications enabled
2. **email-disabled-user**: A user with email notifications disabled but push enabled

### Templates

1. **welcome-email**: An email template with subject and body
2. **welcome-push**: A push notification template with title and body

## Implementation Details

### Mock Server

The test script creates a simple HTTP server that mimics the API Gateway behavior:

- Handles CORS headers
- Implements JWT validation (mock)
- Validates request bodies
- Checks idempotency using in-memory Redis
- Returns appropriate error responses

### Idempotency

Idempotency is tested using an in-memory Redis mock that stores responses by request_id. When a duplicate request is received, the cached response is returned.

### Authentication

JWT authentication is mocked with a simple token format: `mock-jwt-token-{userId}`. The server validates this format and extracts the user ID.

## Troubleshooting

### Port Already in Use

If you get an error about the port being in use, you can change the TEST_PORT constant at the top of the file:

```javascript
const TEST_PORT = 3004; // Change to an available port
```

### Test Failures

If tests fail, check the output for:

1. Response status codes - should match expected values
2. Response data structure - should match expected format
3. Error messages - should be appropriate for the test case

### Debugging

To add more debugging output, you can modify the test functions to log additional information:

```javascript
console.log('Request body:', JSON.stringify(testNotification, null, 2));
console.log('Request headers:', headers);
```

## Integration with CI/CD

This test script can be integrated into CI/CD pipelines as a quick smoke test to verify basic functionality before deploying more comprehensive test suites.

## Limitations

This test script has the following limitations:

1. Does not test actual RabbitMQ message publishing
2. Does not test actual Redis persistence
3. Does not test actual service discovery via Consul
4. Uses simplified mock implementations

For more comprehensive testing, use the other test scripts in the project:

- `test-notifications.js` - More comprehensive notification testing
- `test-complete-flow.js` - End-to-end flow testing
- `test-rabbitmq.js` - RabbitMQ-specific testing