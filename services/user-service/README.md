# User Service

Microservice for user management and authentication in the Distributed Notification System.

## Tech Stack

- **Framework**: Fastify 4.x
- **Database**: PostgreSQL
- **ORM**: Prisma
- **Authentication**: JWT with bcrypt password hashing
- **Service Discovery**: Consul service registration
- **Documentation**: Swagger/OpenAPI

## Features

- User registration with bcrypt password hashing (10 salt rounds)
- User authentication with JWT tokens
- User profile management
- Push token management for notifications
- Notification preferences management (email, push, sms)
- **Health check with database connectivity monitoring**
- **Distributed tracing with correlation IDs**
- **Structured logging with Pino**
- **Service registration with Consul**

## API Endpoints

### Health Check
- **GET** `/health`
- **Description**: Check service health and database connectivity
- **Auth**: Not required
- **Response** (200 - Healthy):
  ```json
  {
    "status": "ok",
    "timestamp": "2024-01-01T00:00:00.000Z",
    "database": "connected"
  }
  ```
- **Response** (503 - Unhealthy):
  ```json
  {
    "status": "error",
    "timestamp": "2024-01-01T00:00:00.000Z",
    "database": "disconnected",
    "error": "Connection error message"
  }
  ```

### User Management

### 1. Create User
- **POST** `/api/v1/users/`
- **Description**: Register a new user with hashed password
- **Auth**: Not required
- **Request Body**:
  ```json
  {
    "email": "user@example.com",
    "password": "password123",
    "name": "John Doe"
  }
  ```
- **Response** (201):
  ```json
  {
    "success": true,
    "message": "User created successfully",
    "data": {
      "user": {
        "id": "uuid",
        "email": "user@example.com",
        "name": "John Doe",
        "push_token": null,
        "notification_preferences": {
          "email": true,
          "push": true,
          "sms": false
        },
        "created_at": "2024-01-01T00:00:00.000Z",
        "updated_at": "2024-01-01T00:00:00.000Z"
      },
      "token": "jwt.token.here"
    }
  }
  ```

### 2. Login
- **POST** `/api/v1/users/login/`
- **Description**: Authenticate user and receive JWT token
- **Auth**: Not required
- **Request Body**:
  ```json
  {
    "email": "user@example.com",
    "password": "password123"
  }
  ```
- **Response** (200):
  ```json
  {
    "success": true,
    "message": "Login successful",
    "data": {
      "user": {
        "id": "uuid",
        "email": "user@example.com",
        "name": "John Doe",
        "push_token": "expo_token_xyz",
        "notification_preferences": {
          "email": true,
          "push": true,
          "sms": false
        },
        "created_at": "2024-01-01T00:00:00.000Z",
        "updated_at": "2024-01-01T00:00:00.000Z"
      },
      "token": "jwt.token.here"
    }
  }
  ```

### 3. Get User Profile
- **GET** `/api/v1/users/:user_id/`
- **Description**: Retrieve user profile (designed for API Gateway to call)
- **Auth**: Not required (for internal microservice communication)
- **Response** (200):
  ```json
  {
    "success": true,
    "message": "User profile retrieved successfully",
    "data": {
      "id": "uuid",
      "email": "user@example.com",
      "name": "John Doe",
      "push_token": "expo_token_xyz",
      "notification_preferences": {
        "email": true,
        "push": true,
        "sms": false
      },
      "created_at": "2024-01-01T00:00:00.000Z",
      "updated_at": "2024-01-01T00:00:00.000Z"
    }
  }
  ```

### 4. Update User
- **PATCH** `/api/v1/users/:user_id/`
- **Description**: Update user information (e.g., name, push_token)
- **Auth**: Required (Bearer token)
- **Request Headers**:
  ```
  Authorization: Bearer <token>
  ```
- **Request Body**:
  ```json
  {
    "name": "Jane Doe",
    "push_token": "expo_push_token_xyz"
  }
  ```
- **Response** (200):
  ```json
  {
    "success": true,
    "message": "User updated successfully",
    "data": {
      "id": "uuid",
      "email": "user@example.com",
      "name": "Jane Doe",
      "push_token": "expo_push_token_xyz",
      "notification_preferences": {
        "email": true,
        "push": true,
        "sms": false
      },
      "created_at": "2024-01-01T00:00:00.000Z",
      "updated_at": "2024-01-01T00:00:00.000Z"
    }
  }
  ```

### 5. Update Notification Preferences
- **PATCH** `/api/v1/users/:user_id/preferences/`
- **Description**: Update notification preferences
- **Auth**: Required (Bearer token)
- **Request Headers**:
  ```
  Authorization: Bearer <token>
  ```
- **Request Body**:
  ```json
  {
    "email": true,
    "push": false,
    "sms": true
  }
  ```
- **Response** (200):
  ```json
  {
    "success": true,
    "message": "Notification preferences updated successfully",
    "data": {
      "id": "uuid",
      "notification_preferences": {
        "email": true,
        "push": false,
        "sms": true
      },
      "updated_at": "2024-01-01T00:00:00.000Z"
    }
  }
  ```

## Setup Instructions

### Prerequisites
- Node.js 20+
- PostgreSQL 14+
- npm

### Installation

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Setup environment variables**:
   ```bash
   cp .env.example .env
   ```
   
   Update `.env` with your configuration:
   ```env
   PORT=3001
   NODE_ENV=development
   HOST=0.0.0.0
   DATABASE_URL="postgresql://user:password@localhost:5432/user_service?schema=public"
   JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
   JWT_EXPIRES_IN=7d
   ```

3. **Generate Prisma client**:
   ```bash
   npm run prisma:generate
   ```

4. **Run database migrations**:
   ```bash
   npm run prisma:migrate
   ```

5. **Start the service**:
   ```bash
   # Production
   npm start
   
   # Development (with auto-reload)
   npm run dev
   ```

6. **View API documentation**:
   - Open browser at `http://localhost:3001/documentation`

## Docker Deployment

### Using Docker Compose (Recommended)

The easiest way to run the User Service with all dependencies (PostgreSQL and Consul) is using Docker Compose:

1. **Start all services**:
   ```bash
   docker-compose up -d
   ```

2. **View logs**:
   ```bash
   docker-compose logs -f user-service
   ```

3. **Stop services**:
   ```bash
   docker-compose down
   ```

4. **Access services**:
   - User Service API: http://localhost:3001
   - API Documentation: http://localhost:3001/documentation
   - Consul UI: http://localhost:8500
   - PostgreSQL: localhost:5432

### Using Docker Standalone

If you already have PostgreSQL and Consul running, you can build and run just the User Service:

1. **Build the Docker image**:
   ```bash
   docker build -t user-service .
   ```

2. **Run the container**:
   ```bash
   docker run -d \
     --name user-service \
     -p 3001:3001 \
     -e PORT=3001 \
     -e HOST=0.0.0.0 \
     -e DATABASE_URL="postgresql://user:password@host.docker.internal:5432/user_service?schema=public" \
     -e JWT_SECRET=your-super-secret-jwt-key-change-this-in-production \
     -e JWT_EXPIRES_IN=7d \
     -e CONSUL_HOST=host.docker.internal \
     -e CONSUL_PORT=8500 \
     user-service
   ```

### Docker Health Checks

The Dockerfile includes a health check that monitors the `/health` endpoint:
- Checks every 30 seconds
- Times out after 3 seconds
- Starts after 5 seconds of container startup
- Retries 3 times before marking as unhealthy

This integrates with Docker's health monitoring and can be used by orchestration systems like Kubernetes for liveness and readiness probes.

## Database Schema

### User Table
```prisma
model User {
  id                       String   @id @default(uuid())
  email                    String   @unique
  password                 String
  name                     String
  push_token               String?
  notification_preferences NotificationPreferences?
  created_at               DateTime @default(now())
  updated_at               DateTime @updatedAt
}
```

### NotificationPreferences Table
```prisma
model NotificationPreferences {
  id      String  @id @default(uuid())
  user_id String  @unique
  user    User    @relation(fields: [user_id], references: [id])
  email   Boolean @default(true)
  push    Boolean @default(true)
  sms     Boolean @default(false)
}
```

## Development Tools

### Prisma Studio
View and edit database records in a GUI:
```bash
npm run prisma:studio
```

### Database Migrations
Create a new migration:
```bash
npm run prisma:migrate
```

## Distributed Tracing

The service supports distributed tracing using correlation IDs:

### How It Works
1. When the API Gateway (or any client) makes a request, it can include an `x-correlation-id` header
2. If the header is present, the service uses that correlation ID
3. If not present, the service generates a new UUID as the correlation ID
4. The correlation ID is:
   - Included in all log entries for that request
   - Returned in the response headers as `x-correlation-id`
   - Used to trace a single notification across all microservices

### Example Usage
```bash
curl -H "x-correlation-id: 123e4567-e89b-12d3-a456-426614174000" \
     http://localhost:3001/api/v1/users/login \
     -X POST -H "Content-Type: application/json" \
     -d '{"email":"user@example.com","password":"password123"}'
```

All logs for this request will include `correlation_id: 123e4567-e89b-12d3-a456-426614174000`, making it easy to trace the entire request flow across services.

## Structured Logging

The service uses **Pino** for structured JSON logging:

- **Development**: Pretty-printed logs with timestamps
- **Production**: JSON-formatted logs for log aggregation systems
- **Correlation IDs**: Automatically included in all log entries
- **Request Context**: Each log includes relevant request data (user_id, email, etc.)

### Log Levels
- `info`: Normal operations (user login, profile updates, etc.)
- `warn`: Warning conditions (failed login attempts, unauthorized access, etc.)
- `error`: Error conditions (database errors, unexpected failures, etc.)

### Sample Log Entry
```json
{
  "level": 30,
  "time": 1704067200000,
  "correlation_id": "123e4567-e89b-12d3-a456-426614174000",
  "email": "user@example.com",
  "msg": "User login attempt"
}
```

## Security Features

- **Password Hashing**: bcrypt with 10 salt rounds
- **JWT Authentication**: Secure token-based authentication
- **Input Validation**: JSON Schema validation on all endpoints
- **CORS**: Configurable cross-origin resource sharing
- **Password Exclusion**: Passwords automatically excluded from responses

## Architecture

- **Fastify Plugins**: Modular plugin architecture
  - `prisma.js`: Database connection and Prisma client management
  - `auth.js`: JWT authentication and token generation
  - `correlation-id.js`: Distributed tracing with correlation IDs
  - `consul.js`: **NEW** - Service registration with Consul
- **JSON Schema Validation**: Type-safe request/response validation
- **Prisma ORM**: Type-safe database access with PostgreSQL
- **Swagger Documentation**: Auto-generated API documentation
- **Graceful Shutdown**: Proper cleanup of database connections
- **Structured Logging**: Pino logger with correlation ID tracking

## Error Handling

All responses follow a consistent format:

**Success Response**:
```json
{
  "success": true,
  "message": "Operation successful",
  "data": { ... }
}
```

**Error Response**:
```json
{
  "success": false,
  "message": "Error description"
}
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `3001` |
| `HOST` | Server host | `0.0.0.0` |
| `NODE_ENV` | Environment | `development` |
| `DATABASE_URL` | PostgreSQL connection string | Required |
| `JWT_SECRET` | JWT signing secret | Required |
| `JWT_EXPIRES_IN` | JWT expiration time | `7d` |
| `CORS_ORIGIN` | CORS allowed origins | `*` |
| `LOG_LEVEL` | Logging level | `info` |
| `CONSUL_HOST` | Consul server host | `localhost` |
| `CONSUL_PORT` | Consul server port | `8500` |

## Monitoring & Operations

### Health Checks
The `/health` endpoint is vital for monitoring and should be configured in your:
- Load balancer health checks
- Container orchestration (Kubernetes liveness/readiness probes)
- Monitoring systems (Prometheus, DataDog, etc.)

### Logging Best Practices
1. Always include the `x-correlation-id` header from the API Gateway
2. Use correlation IDs to trace requests across all services
3. Monitor logs for `warn` and `error` levels
4. Set `LOG_LEVEL=debug` for troubleshooting

## Notes for API Gateway

The **GET /api/v1/users/:user_id/** endpoint is designed to be called by the API Gateway without authentication. This allows the gateway to retrieve user information for internal operations while protecting other endpoints with JWT authentication.

### Important for Integration
1. **Always pass `x-correlation-id`**: When the API Gateway makes requests to this service, it should pass the correlation ID in the header
2. **No synchronous calls**: This service does not make synchronous HTTP calls to other services - it only interacts with its own PostgreSQL database
3. **Async-ready**: All operations are asynchronous and non-blocking
4. **Service Discovery**: The service automatically registers with Consul on startup and deregisters on shutdown

## Consul Service Registration

The User Service automatically registers with Consul for service discovery:

### Registration Details
- **Service Name**: `user-service`
- **Service ID**: `user-service-{hostname}-{uuid}` (unique per instance)
- **Health Check**: HTTP GET to `/health` endpoint
- **Health Check Interval**: Every 10 seconds
- **Health Check Timeout**: 5 seconds
- **Deregistration**: Automatically deregisters after 30 seconds of critical health status

### Configuration
Configure Consul connection using environment variables:
```env
CONSUL_HOST=localhost
CONSUL_PORT=8500
```

### Service Discovery Usage
Other services can discover the User Service through Consul's API or DNS interface:
```bash
# Query all user-service instances
dig user-service.service.consul

# Query via HTTP API
curl http://localhost:8500/v1/catalog/service/user-service
```

## Testing Consul Integration

To verify that the Consul integration works correctly before deploying the service, use the provided test script:

### Quick Test
```bash
npm run test:consul
```

### Detailed Instructions
For comprehensive testing instructions, prerequisites, and troubleshooting, see [CONSUL_TEST.md](./CONSUL_TEST.md).

The test script verifies:
- Consul connection
- Service registration with Consul
- Service discovery (querying Consul for the registered service)
- Service deregistration
- Consul plugin functionality with Fastify
