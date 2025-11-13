# Status Endpoint Test

This document describes the test script for verifying the status endpoint implementation in the API Gateway service.

## Overview

The `test-status-endpoint.js` script tests the GET `/api/v1/notifications/:notification_id/status` endpoint, which retrieves the status of a notification from Redis.

## Test Cases

The test script covers the following scenarios:

1. **Health Endpoint**: Verifies that the health endpoint returns a 200 status code.
2. **GET Existing Notification Status**: Tests retrieving a notification status that exists in Redis.
3. **GET Non-Existing Notification Status**: Tests retrieving a notification status that doesn't exist in Redis (should return 404).
4. **GET Notification Status Without Auth**: Tests accessing the endpoint without authentication (should return 401).
5. **GET Notification Status With Invalid Auth**: Tests accessing the endpoint with invalid authentication (should return 401).
6. **GET Notification Status With Failed Status**: Tests retrieving a notification with a failed status.

## Running the Test

To run the test script:

```bash
cd services/api-gateway
node test-status-endpoint.js
```

Or using the npm script:

```bash
cd services/api-gateway
npm run test:status
```

## Test Implementation Details

### Mock Server

The test script creates a mock HTTP server that simulates the API Gateway service. It includes:

- Authentication middleware that validates JWT tokens
- Status endpoint that retrieves notification status from Redis
- Health check endpoint

### Redis Mock

The script uses an in-memory Redis mock that implements the essential Redis operations:

- `get`: Retrieves a value by key
- `setex`: Sets a value with an expiration time
- `del`: Deletes a key
- `quit`: Closes the connection

### Test Data

The test script creates and manages test data in Redis:

- Test notification statuses are stored with the key pattern `notification_status:{notification_id}`
- Test data is cleaned up after each test to ensure test isolation

### Assertions

Each test case includes assertions to verify:

- HTTP status codes
- Response format (success, message, data, error fields)
- Specific data values in the response
- Error messages for failure scenarios

## Expected Output

When all tests pass, you should see output similar to:

```
🚀 Starting Status Endpoint Tests
===================================
Redis mock initialized

=== Starting Mock Server ===
Mock server listening on 127.0.0.1:3004

=== Testing Health Endpoint ===
Response status: 200
Response data: {
  "status": "healthy",
  "timestamp": "2025-11-12T23:23:46.430Z",
  "service": "api-gateway",
  "uptime": 0.4162607
}
✅ Health endpoint: PASSED - Status: 200

[... other test outputs ...]

===================================
📊 Test Summary:
Total tests: 6
Passed: 6
Failed: 0
Success rate: 100.00%

🎉 All tests passed successfully!
✅ Redis connection closed
✅ Mock server stopped
```

## Troubleshooting

If tests fail:

1. Check the error messages in the output
2. Verify that the mock server is starting correctly
3. Ensure the Redis mock is functioning properly
4. Check that the test data is being stored and retrieved correctly

## Integration with Real API Gateway

This test script uses a mock server to isolate the testing of the status endpoint logic. To test against the actual API Gateway service:

1. Start the API Gateway service
2. Start Redis
3. Update the test script to use the actual service URL instead of the mock server
4. Ensure the test data is properly set up in Redis before running the tests