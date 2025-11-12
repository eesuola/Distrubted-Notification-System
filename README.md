# Distributed Notification System

A microservices-based notification system built with Node.js, TypeScript, and Docker. The system sends emails and push notifications using separate microservices that communicate asynchronously through message queues.

## Project Structure

```
Distrubted-Notification-System/
├── .github/workflows/
│   └── deploy.yml
├── services/
│   ├── template-service/
│   │   ├── src/
│   │   │   ├── routes/
│   │   │   │   └── templates.js
│   │   │   ├── plugins/
│   │   │   │   ├── correlation-id.js
│   │   │   │   ├── prisma.js
│   │   │   │   └── redis.js
│   │   │   └── index.js
│   │   ├── prisma/
│   │   │   ├── schema.prisma
│   │   │   └── migrations/
│   │   ├── Dockerfile
│   │   ├── package.json
│   │   └── README.md
│   └── user-service/
│       ├── src/
│       │   ├── routes/
│       │   │   └── users.js
│       │   ├── plugins/
│       │   │   ├── auth.js
│       │   │   ├── correlation-id.js
│       │   │   └── prisma.js
│       │   ├── controllers/
│       │   ├── middleware/
│       │   ├── models/
│       │   ├── utils/
│       │   │   └── password.js
│       │   ├── validators/
│       │   └── index.js
│       ├── prisma/
│       │   ├── schema.prisma
│       │   └── migrations/
│       ├── Dockerfile
│       ├── package.json
│       └── README.md
├── shared/
│   ├── response.js
│   ├── response.ts
│   └── types/
│       └── index.ts
├── package.json
└── package-lock.json
```

## Services Overview

The notification system consists of the following microservices:

### 1. Template Service

**Port**: 3002  
**Database**: PostgreSQL  
**Purpose**: Manages notification templates with versioning and multi-language support

**Key Features**:
- Create and manage notification templates
- Support for template variables (e.g., `{{name}}`, `{{link}}`)
- Version history for templates
- Multi-language support
- RESTful API with Swagger documentation

**API Documentation**: http://localhost:3002/documentation

### 2. User Service

**Port**: 3001  
**Database**: PostgreSQL  
**Purpose**: Manages user information, authentication, and notification preferences

**Key Features**:
- User registration and authentication with JWT
- Password hashing with bcrypt
- Push token management
- Notification preferences (email, push, SMS)
- Health check with database connectivity monitoring
- Distributed tracing with correlation IDs

**API Documentation**: http://localhost:3001/documentation

### Future Services

The following services are planned for implementation:
- API Gateway Service - Entry point for all notification requests
- Email Service - Processes email notifications
- Push Service - Processes push notifications

## Shared Code

The `shared/` directory contains common utilities and types used across all services:

- **response.js/ts**: Standardized API response utilities
- **types/index.ts**: TypeScript type definitions for shared data structures

## Technology Stack

- **Runtime**: Node.js 20+
- **Web Framework**: Fastify 4.x
- **ORM**: Prisma
- **Language**: TypeScript
- **Authentication**: JWT with bcrypt
- **Documentation**: Swagger/OpenAPI
- **Database**: PostgreSQL
- **Caching**: Redis
- **Message Queue**: RabbitMQ or Kafka
- **Containerization**: Docker (Alpine Linux)
- **Package Manager**: npm (workspaces)

## Getting Started

### Prerequisites

- Node.js 20+
- Docker and Docker Compose
- PostgreSQL 14+
- Redis
- RabbitMQ or Kafka

### Installation

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd Distrubted-Notification-System
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables for each service:
   ```bash
   # Copy example environment files
   cp services/user-service/.env.example services/user-service/.env
   cp services/template-service/.env.example services/template-service/.env
   ```

4. Set up databases:
   ```bash
   # Run database migrations for each service
   cd services/user-service && npm run prisma:migrate
   cd ../template-service && npm run prisma:migrate
   ```

5. Start the services:
   ```bash
   # Start all services
   npm run start
   
   # Or start individual services
   cd services/user-service && npm start
   cd ../template-service && npm start
   ```

## Development

### Setting Up a Service

1. Navigate to the service directory:
   ```bash
   cd services/<service-name>
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables:
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. Set up the database:
   ```bash
   npm run prisma:generate
   npm run prisma:migrate
   ```

5. Start the service:
   ```bash
   # Development mode with auto-reload
   npm run dev
   
   # Production mode
   npm start
   ```

### Workspace Commands

From the root directory, you can run commands across all services:

```bash
# Install dependencies for all services
npm install

# Build all services
npm run build

# Start all services
npm run start

# Lint all services
npm run lint
```

## API Documentation

Each service provides automatic API documentation through Swagger/OpenAPI:

- User Service: http://localhost:3001/documentation
- Template Service: http://localhost:3002/documentation

## API Response Format

All services follow a consistent API response format:

```typescript
{
  success: boolean;
  data?: T;
  error?: string;
  message: string;
  meta?: PaginationMeta;
}

interface PaginationMeta {
  total: number;
  limit: number;
  page: number;
  total_pages: number;
  has_next: boolean;
  has_previous: boolean;
}
```

## Naming Conventions

- **Request/Response/Model fields**: Use `snake_case` (e.g., `user_id`, `notification_type`)
- **Directories and files**: Use `kebab-case` (e.g., `user-service`, `email-service`)
- **Variables and functions**: Use `camelCase` (e.g., `getUserId`, `sendNotification`)
- **Constants**: Use `UPPER_SNAKE_CASE` (e.g., `MAX_RETRY_ATTEMPTS`)

## Health Checks

All services implement a `/health` endpoint that returns:
- Service status
- Database connectivity
- Queue connectivity (if applicable)
- Appropriate HTTP status codes (200 for healthy, 503 for unhealthy)

## Distributed Tracing

Services support distributed tracing using correlation IDs:
- Include `x-correlation-id` header in requests
- Correlation IDs are automatically included in all log entries
- Enables tracing requests across all microservices

## Environment Variables

Each service requires specific environment variables. See the individual service README files for detailed configuration options.

## Docker Support

Each service includes a Dockerfile for containerization:
- Base image: `node:20-alpine`
- Optimized for production builds
- Follows multi-stage build patterns
- Configured for health checks

## Deployment

The project includes CI/CD workflows for automated deployment. See `.github/workflows/deploy.yml` for details.

## Contributing

When contributing to the notification service:

1. Follow the existing code patterns and conventions
2. Ensure all new code includes proper error handling
3. Add appropriate tests for new functionality
4. Update documentation for any API changes
5. Use conventional commit messages

For questions or issues related to specific services, please refer to their individual README files:
- [Template Service README](services/template-service/README.md)
- [User Service README](services/user-service/README.md)

## License

This project is licensed under the MIT License.
