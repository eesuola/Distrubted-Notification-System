# API Gateway Service

The API Gateway service is the entry point for all notification requests in the distributed notification system. It validates and authenticates requests, routes messages to the correct queue (email or push), and tracks notification status.

## Features

- Service discovery using Consul
- Request routing to appropriate microservices
- Health check endpoint
- Error handling with standardized response format
- Graceful shutdown handling

## Environment Variables

- `PORT`: Server port (default: 3000)
- `HOST`: Server host (default: 0.0.0.0)
- `CONSUL_HOST`: Consul server host (default: localhost)
- `CONSUL_PORT`: Consul server port (default: 8500)

## Installation

```bash
npm install
```

## Development

```bash
npm run dev
```

## Production

```bash
npm start
```

## Health Check

The service provides a health check endpoint at `/health` that returns:

```json
{
  "status": "healthy",
  "timestamp": "2025-01-01T00:00:00.000Z",
  "service": "api-gateway",
  "uptime": 123.45
}
```

## Service Discovery

The API Gateway uses Consul for service discovery. It automatically registers itself on startup and provides methods to discover other services in the system.

## API Endpoints

### Health Check
- **GET** `/health` - Check service health status

## Dependencies

- Fastify - Web framework
- Consul - Service discovery
- AMQP - Message queue communication