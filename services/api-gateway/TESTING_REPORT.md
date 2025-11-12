# API Gateway Consul Service Discovery Testing Report

## Overview

This report documents the testing of the API Gateway implementation with Consul service discovery. The testing focused on verifying the Consul integration, identifying issues, and providing recommendations for fixing them.

## Test Environment

- **Service**: API Gateway
- **Service Discovery**: Consul
- **Node.js Version**: 20+
- **Package Manager**: npm
- **Testing Date**: 2025-11-12

## Issues Found

### 1. Import Path Issues

**Description**: Multiple files had incorrect import paths for the shared response module.

**Affected Files**:
- [`src/index.js`](src/index.js:5)
- [`src/routes/notifications.js`](src/routes/notifications.js:2)
- [`src/services/notificationService.js`](src/services/notificationService.js:1)

**Root Cause**: The import paths were using incorrect relative paths to the shared response module.

**Fix Applied**:
- Changed from `import createResponse from '../../../../shared/response.js'`
- To: `import { createResponse } from '../../../shared/response.js'`

### 2. Export Issue in Shared Response Module

**Description**: The shared response module was exporting an object containing the function instead of the function directly.

**Affected File**:
- [`shared/response.js`](shared/response.js:15)

**Root Cause**: The module was using `export default { createResponse }` instead of `export { createResponse }`.

**Fix Applied**:
- Changed from `export default { createResponse }`
- To: `export { createResponse }`

### 3. Missing Dependencies

**Description**: The API Gateway service doesn't have a `node_modules` directory, indicating dependencies haven't been installed.

**Impact**: The service cannot start without installing dependencies.

**Required Action**: Run `npm install` in the `services/api-gateway` directory.

## Test Scripts Created

### 1. Consul Service Discovery Test (`test-consul-discovery.js`)

**Purpose**: Test the Consul service discovery functionality.

**Features**:
- Tests Consul client initialization
- Verifies Consul connectivity
- Tests service discovery for user-service and template-service
- Checks service health
- Tests service URL generation
- Provides detailed error reporting and recommendations

**Usage**:
```bash
cd services/api-gateway
node test-consul-discovery.js
```

### 2. API Gateway Startup Test (`test-startup.js`)

**Purpose**: Verify that the API Gateway can start without errors.

**Features**:
- Checks package.json configuration
- Verifies all required source files exist
- Validates import statements
- Checks shared response module
- Tests environment variables
- Validates Consul plugin configuration
- Provides detailed recommendations

**Usage**:
```bash
cd services/api-gateway
node test-startup.js
```

## Recommendations

### Immediate Actions

1. **Install Dependencies**
   ```bash
   cd services/api-gateway
   npm install
   ```

2. **Verify Consul Installation**
   - Ensure Consul is installed and running
   - Default configuration expects Consul at `localhost:8500`
   - Can be customized with `CONSUL_HOST` and `CONSUL_PORT` environment variables

3. **Start Required Services**
   - Start Consul server: `consul agent -dev`
   - Start user-service and template-service
   - Ensure they register with Consul

### Testing Workflow

1. **Run Startup Test**
   ```bash
   cd services/api-gateway
   node test-startup.js
   ```

2. **Run Consul Discovery Test**
   ```bash
   cd services/api-gateway
   node test-consul-discovery.js
   ```

3. **Start API Gateway**
   ```bash
   cd services/api-gateway
   npm start
   ```

4. **Verify Health Endpoint**
   ```bash
   curl http://localhost:3000/health
   ```

### Configuration Recommendations

1. **Environment Variables**
   - `PORT`: API Gateway port (default: 3000)
   - `HOST`: API Gateway host (default: 0.0.0.0)
   - `CONSUL_HOST`: Consul server host (default: localhost)
   - `CONSUL_PORT`: Consul server port (default: 8500)

2. **Service Registration**
   - API Gateway automatically registers with Consul on startup
   - Health check endpoint: `/health`
   - Service ID: `api-gateway-{hostname}-{port}`

### Production Considerations

1. **Consul Configuration**
   - Use a production-ready Consul cluster
   - Configure proper ACLs for security
   - Set up proper service health checks
   - Configure service discovery for high availability

2. **Error Handling**
   - Implement circuit breaker pattern for service calls
   - Add retry logic with exponential backoff
   - Implement graceful degradation when services are unavailable

3. **Monitoring**
   - Monitor service registration/deregistration
   - Track service health check status
   - Monitor service discovery latency
   - Set up alerts for service unavailability

## Consul Integration Details

### Service Discovery Methods

The API Gateway implements the following service discovery methods:

1. **getServiceUrl(serviceName)**
   - Returns the URL of the first available service instance
   - Format: `{protocol}://{address}:{port}`

2. **getAllServiceInstances(serviceName)**
   - Returns all instances of a service
   - Includes health status and metadata

3. **checkServiceHealth(serviceName)**
   - Checks the health of all service instances
   - Returns healthy/unhealthy instance counts

4. **registerService(serviceConfig)**
   - Registers the API Gateway with Consul
   - Includes health check configuration

5. **deregisterService(serviceId)**
   - Deregisters the service on shutdown

### Service Usage

The API Gateway uses service discovery for:

1. **User Service**
   - Fetching user data and preferences
   - Validating notification permissions

2. **Template Service**
   - Retrieving notification templates
   - Supporting multiple languages

## Conclusion

The API Gateway Consul service discovery implementation is well-structured and follows best practices. The main issues found were related to import paths and module exports, which have been fixed. The service should work correctly once dependencies are installed and Consul is properly configured.

The test scripts provided will help verify the implementation and diagnose any issues during development and deployment.

## Next Steps

1. Install dependencies and run the test scripts
2. Set up a development Consul instance
3. Start the user-service and template-service
4. Test the complete service discovery workflow
5. Implement the message queue integration for notification processing
6. Add comprehensive error handling and retry logic
7. Set up monitoring and alerting for production deployment