# Email Service

Microservice that processes email notifications from RabbitMQ queue.

## Features
- Consumes messages from `email.queue`
- Fetches user data from User Service
- Fetches templates from Template Service
- Sends emails via SendGrid
- Retry logic (3 attempts with exponential backoff)
- Dead letter queue for failed messages

## Setup

1. Install dependencies:
```bash
npm install
```

2. Configure environment variables in `.env`:
```
SENDGRID_API_KEY=your_key
RABBITMQ_URL=amqp://localhost:5672
USER_SERVICE_URL=http://localhost:3001
TEMPLATE_SERVICE_URL=http://localhost:3003
FROM_EMAIL=noreply@yourapp.com
```

3. Run:
```bash
npm start
```

## Endpoints

- `GET /health` - Health check endpoint

## Message Format
```json
{
  "notification_id": "uuid",
  "user_id": 123,
  "template_id": "welcome_email",
  "variables": {
    "message": "Custom message"
  }
}
```

## Error Handling

- Automatic retry (3 attempts)
- Exponential backoff (2s, 4s, 8s)
- Failed messages go to `failed.queue`