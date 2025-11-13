# Distributed Notification System Architecture

## System Overview

This document provides a comprehensive architectural overview of the distributed notification system, including service connections, queue structure, retry mechanisms, database relationships, and scaling approach.

## System Architecture Diagram

```mermaid
graph TB
    %% External Clients
    Client[Client Applications] --> LB[Load Balancer]
    
    %% API Gateway Layer
    LB --> AG[API Gateway Service<br/>Port: 3000]
    
    %% Service Discovery
    AG --> CS[Consul Service Discovery<br/>Port: 8500]
    
    %% Message Queue Infrastructure
    AG --> RMQ[RabbitMQ Message Broker<br/>Port: 5672<br/>Management: 15672]
    
    %% Queue Structure
    subgraph "RabbitMQ Exchange: notifications.direct"
        EQ[email.queue<br/>DLX: failed.queue]
        PQ[push.queue<br/>DLX: failed.queue]
        FQ[failed.queue<br/>Dead Letter Queue]
    end
    
    %% Database Layer
    subgraph "PostgreSQL Database<br/>Port: 5432"
        US_DB[(User Service DB)]
        TS_DB[(Template Service DB)]
    end
    
    %% Cache Layer
    Redis[(Redis Cache<br/>Port: 6379)]
    
    %% Microservices
    subgraph "User Service<br/>Port: 3001"
        US_API[REST API]
        US_DB_CONN[Prisma ORM]
    end
    
    subgraph "Template Service<br/>Port: 3002"
        TS_API[REST API]
        TS_DB_CONN[Prisma ORM]
        TS_CACHE[Redis Cache]
    end
    
    subgraph "Email Service<br/>Port: 3003<br/>(Not Yet Implemented)"
        ES_CONSUMER[Queue Consumer]
        ES_RENDERER[Template Renderer]
        ES_SENDER[Email Sender<br/>SMTP/API]
    end
    
    subgraph "Push Service<br/>Port: 3004<br/>(Not Yet Implemented)"
        PS_CONSUMER[Queue Consumer]
        PS_RENDERER[Template Renderer]
        PS_SENDER[Push Sender<br/>FCM/Web Push]
    end
    
    %% Connections
    AG --> US_API
    AG --> TS_API
    AG --> Redis
    
    US_API --> US_DB_CONN
    US_DB_CONN --> US_DB
    
    TS_API --> TS_DB_CONN
    TS_DB_CONN --> TS_DB
    TS_API --> TS_CACHE
    TS_CACHE --> Redis
    
    RMQ --> EQ
    RMQ --> PQ
    RMQ --> FQ
    
    EQ --> ES_CONSUMER
    PQ --> PS_CONSUMER
    
    ES_CONSUMER --> ES_RENDERER
    ES_RENDERER --> ES_SENDER
    
    PS_CONSUMER --> PS_RENDERER
    PS_RENDERER --> PS_SENDER
    
    %% Circuit Breaker Pattern
    CB_AG_US[Circuit Breaker<br/>API Gateway ↔ User Service]
    CB_AG_TS[Circuit Breaker<br/>API Gateway ↔ Template Service]
    
    AG -.->|Circuit Breaker| CB_AG_US
    CB_AG_US -.-> US_API
    AG -.->|Circuit Breaker| CB_AG_TS
    CB_AG_TS -.-> TS_API
    
    %% Retry and Failure Flow
    subgraph "Retry Mechanism"
        RETRY[Exponential Backoff<br/>Max: 3 attempts<br/>Delay: 5s, 10s, 20s]
        DLQ[Dead Letter Queue<br/>Failed after max retries]
    end
    
    EQ -->|Failed Messages| RETRY
    PQ -->|Failed Messages| RETRY
    RETRY -->|Permanently Failed| DLQ
    DLQ --> FQ
    
    %% Health Checks
    subgraph "Health Check Endpoints"
        AG_HEALTH[/health]
        US_HEALTH[/health]
        TS_HEALTH[/health]
    end
    
    AG --> AG_HEALTH
    US_API --> US_HEALTH
    TS_API --> TS_HEALTH
    
    %% Service Registration
    US_API --> CS
    TS_API --> CS
    AG --> CS
    
    %% Styling
    classDef external fill:#e1f5fe
    classDef gateway fill:#f3e5f5
    classDef service fill:#e8f5e8
    classDef database fill:#fff3e0
    classDef queue fill:#fce4ec
    classDef cache fill:#f1f8e9
    classDef pattern fill:#fff8e1
    
    class Client,LB external
    class AG gateway
    class US_API,TS_API,ES_CONSUMER,PS_CONSUMER service
    class US_DB,TS_DB database
    class RMQ,EQ,PQ,FQ queue
    class Redis,TS_CACHE cache
    class CB_AG_US,CB_AG_TS,RETRY,DLQ pattern
```

## Component Details

### 1. API Gateway Service (Port: 3000)

**Responsibilities:**
- Entry point for all notification requests
- Request validation and authentication
- Message routing to appropriate queues
- Idempotency handling via Redis
- Circuit breaker implementation for downstream services

**Key Features:**
- JWT authentication middleware
- Correlation ID tracking
- Request/response validation with JSON Schema
- Service discovery via Consul
- Health check endpoint

**Technology Stack:**
- Fastify web framework
- TypeScript/Node.js
- Redis for caching and idempotency
- RabbitMQ client for message publishing

### 2. User Service (Port: 3001)

**Responsibilities:**
- User management and authentication
- Notification preferences
- User profile data management

**Database Schema:**
```sql
-- Users table
CREATE TABLE users (
  id VARCHAR(255) PRIMARY KEY DEFAULT cuid(),
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL, -- Hashed with bcrypt
  push_token VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- User preferences table
CREATE TABLE user_preferences (
  id VARCHAR(255) PRIMARY KEY DEFAULT cuid(),
  user_id VARCHAR(255) UNIQUE NOT NULL,
  email BOOLEAN DEFAULT true,
  push BOOLEAN DEFAULT true,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

**API Endpoints:**
- `POST /api/v1/users/` - Create user
- `POST /api/v1/users/login` - Authenticate user
- `GET /api/v1/users/:user_id` - Get user profile
- `PATCH /api/v1/users/:user_id` - Update user profile
- `PATCH /api/v1/users/:user_id/preferences` - Update preferences

### 3. Template Service (Port: 3002)

**Responsibilities:**
- Template storage and versioning
- Multi-language support
- Template caching via Redis

**Database Schema:**
```sql
CREATE TABLE templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_code VARCHAR(100) NOT NULL,
  language VARCHAR(5) DEFAULT 'en',
  subject VARCHAR(500),
  content TEXT NOT NULL,
  version INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(template_code, language, version),
  INDEX(template_code, language)
);
```

**API Endpoints:**
- `POST /api/v1/templates/` - Create new template
- `GET /api/v1/templates/:template_code` - Get latest template
- `GET /api/v1/templates/:template_code/versions` - List all versions
- `GET /api/v1/templates/:template_code/versions/:version` - Get specific version
- `POST /api/v1/templates/:template_code/versions/` - Create new version

**Caching Strategy:**
- Templates cached in Redis for 1 hour
- Cache keys: `template:{template_code}:{language}`
- Version cache keys: `template_version:{template_code}:{version}:{language}`

### 4. Email Service (Port: 3003) - Not Yet Implemented

**Planned Responsibilities:**
- Consume messages from email.queue
- Template variable substitution
- Email delivery via SMTP or API (SendGrid, Mailgun)
- Delivery status tracking

**Queue Configuration:**
- Queue: `email.queue`
- Dead Letter Exchange: `notifications.direct`
- Dead Letter Routing Key: `failed.queue`

### 5. Push Service (Port: 3004) - Not Yet Implemented

**Planned Responsibilities:**
- Consume messages from push.queue
- Template variable substitution
- Push notification delivery via FCM or Web Push
- Device token validation
- Delivery status tracking

**Queue Configuration:**
- Queue: `push.queue`
- Dead Letter Exchange: `notifications.direct`
- Dead Letter Routing Key: `failed.queue`

## Message Queue Architecture

### RabbitMQ Configuration

**Exchange:**
- Name: `notifications.direct`
- Type: `direct`
- Durable: `true`

**Queues:**
1. **email.queue**
   - Durable: `true`
   - Dead Letter Exchange: `notifications.direct`
   - Dead Letter Routing Key: `failed.queue`

2. **push.queue**
   - Durable: `true`
   - Dead Letter Exchange: `notifications.direct`
   - Dead Letter Routing Key: `failed.queue`

3. **failed.queue**
   - Durable: `true`
   - Dead Letter Queue for permanently failed messages

**Message Flow:**
1. API Gateway publishes messages to `notifications.direct` exchange
2. Routing keys: `email.queue` or `push.queue`
3. Failed messages routed to `failed.queue` after max retries

### Message Format

```typescript
interface NotificationMessage {
  notification_id: string;
  user_id: string;
  template_code: string;
  variables: {
    name: string;
    link: string;
    meta?: Record<string, any>;
  };
  request_id: string;
  correlation_id: string;
  notification_type: "email" | "push";
  user_email: string;
  user_push_token?: string;
  template_content: TemplateData;
  timestamp: string;
  priority: number;
  metadata?: Record<string, any>;
}
```

## Retry and Failure Handling

### Circuit Breaker Pattern

**Configuration:**
- Timeout: 30 seconds
- Error threshold: 50%
- Reset timeout: 60 seconds
- Minimum requests: 10

**States:**
1. **CLOSED**: Normal operation, requests pass through
2. **OPEN**: Circuit open, requests fail immediately
3. **HALF_OPEN**: Testing if service has recovered

### Retry Mechanism

**Exponential Backoff:**
- Attempt 1: Immediate
- Attempt 2: 5 seconds delay
- Attempt 3: 10 seconds delay
- Attempt 4: 20 seconds delay
- Max attempts: 3 (configurable)

**Dead Letter Queue:**
- Messages that fail after max retries go to `failed.queue`
- Includes error information and failure count
- Can be manually reprocessed or analyzed

## Database Architecture

### PostgreSQL Databases

**User Service Database:**
- Users and authentication data
- Notification preferences
- Connection pooling via Prisma

**Template Service Database:**
- Template storage with versioning
- Multi-language support
- Indexed for fast lookups

### Redis Cache

**Use Cases:**
1. **API Gateway:**
   - Idempotency cache (24 hours TTL)
   - Notification status tracking (7 days TTL)

2. **Template Service:**
   - Template caching (1 hour TTL)
   - Version history caching

**Configuration:**
- Connection pooling
- Automatic failover
- Persistence to disk

## Service Discovery

### Consul Integration

**Service Registration:**
- All services register with Consul on startup
- Health check endpoints monitored
- Automatic deregistration on failure

**Service Discovery:**
- API Gateway discovers User and Template services
- Load balancing across multiple instances
- Health-aware routing

**Health Check Configuration:**
- Interval: 10 seconds
- Timeout: 5 seconds
- Deregister after: 30 seconds of critical state

## Scaling Strategy

### Horizontal Scaling

**API Gateway:**
- Stateless design enables easy scaling
- Load balancer distributes requests
- Redis shared for idempotency and status

**User Service:**
- Database connection pooling
- Read replicas for scaling reads
- Stateless authentication via JWT

**Template Service:**
- Redis shared across instances
- Database connection pooling
- Cache warming strategies

**Email/Push Services:**
- Queue-based processing naturally scales
- Multiple consumers per queue
- Worker pattern for resource-intensive operations

### Performance Targets

- **API Gateway**: < 100ms response time
- **Throughput**: 1,000+ notifications/minute
- **Delivery Rate**: 99.5% success rate
- **Availability**: 99.9% uptime

## Security Architecture

### Authentication & Authorization

**API Gateway:**
- JWT token validation
- Service-to-service authentication
- Rate limiting per client

**User Service:**
- bcrypt password hashing
- JWT token generation
- Secure password policies

### Data Protection

- Environment variables for secrets
- Encrypted connections (TLS)
- Input validation and sanitization
- SQL injection prevention via Prisma

## Monitoring and Observability

### Logging Strategy

**Structured Logging:**
- JSON format for all services
- Correlation ID tracking across services
- Log levels: debug, info, warn, error

**Key Log Events:**
- Notification lifecycle (created, queued, processed, delivered, failed)
- Service health checks
- Circuit breaker state changes
- Queue metrics

### Health Checks

**Endpoints:**
- `/health` on all services
- Database connectivity checks
- Queue connectivity checks
- Dependency health monitoring

**Response Format:**
```json
{
  "status": "healthy" | "degraded" | "unhealthy",
  "timestamp": "2024-01-01T00:00:00Z",
  "services": {
    "database": "connected" | "disconnected",
    "redis": "connected" | "disconnected",
    "rabbitmq": "connected" | "disconnected"
  }
}
```

## Deployment Architecture

### Container Strategy

**Base Images:**
- `node:20-alpine` for Node.js services
- `postgres:15` for databases
- `redis:7` for cache
- `rabbitmq:3-management` for message broker

**Orchestration:**
- Docker Compose for development
- Kubernetes for production
- Environment-specific configurations

### CI/CD Pipeline

**Stages:**
1. **Build**: Compile TypeScript, generate Prisma client
2. **Test**: Unit tests, integration tests
3. **Security**: Vulnerability scanning
4. **Deploy**: Rolling updates with health checks

**Environment Variables:**
- Database URLs and credentials
- Redis connection details
- RabbitMQ configuration
- JWT secrets
- Service discovery settings

## Future Enhancements

### Planned Features

1. **Email Service Implementation**
   - SMTP integration
   - SendGrid/Mailgun API support
   - Template rendering with variable substitution

2. **Push Service Implementation**
   - Firebase Cloud Messaging (FCM)
   - Web Push with VAPID
   - Device token management

3. **Advanced Features**
   - Batch processing for bulk notifications
   - Scheduled notifications
   - A/B testing for templates
   - Analytics and reporting dashboard

4. **Performance Optimizations**
   - Message batching in queues
   - Database read replicas
   - CDN for static assets
   - Connection pooling optimization

## Conclusion

This distributed notification system architecture provides a scalable, resilient foundation for handling email and push notifications at scale. The microservices approach ensures clear separation of concerns, while the queue-based design enables reliable message delivery and horizontal scaling.

The implementation follows industry best practices including circuit breakers, exponential backoff, dead letter queues, and comprehensive monitoring. The system is designed to handle the target performance metrics of 1,000+ notifications per minute with 99.5% delivery success rate.

The modular architecture allows for incremental development, with the Email and Push services yet to be implemented but fully planned and integrated into the overall system design.