# User Service

Microservice for user management and authentication in the Distributed Notification System.

## Tech Stack

- **Framework**: Fastify 4.x
- **Database**: PostgreSQL
- **ORM**: Prisma
- **Authentication**: JWT with bcrypt password hashing
- **Documentation**: Swagger/OpenAPI

## Features

- User registration with bcrypt password hashing (10 salt rounds)
- User authentication with JWT tokens
- User profile management
- Push token management for notifications
- Notification preferences management (email, push, sms)

## API Endpoints

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

## Security Features

- **Password Hashing**: bcrypt with 10 salt rounds
- **JWT Authentication**: Secure token-based authentication
- **Input Validation**: JSON Schema validation on all endpoints
- **CORS**: Configurable cross-origin resource sharing
- **Password Exclusion**: Passwords automatically excluded from responses

## Architecture

- **Fastify Plugins**: Modular plugin architecture for Prisma and Auth
- **JSON Schema Validation**: Type-safe request/response validation
- **Prisma ORM**: Type-safe database access with PostgreSQL
- **Swagger Documentation**: Auto-generated API documentation
- **Graceful Shutdown**: Proper cleanup of database connections

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

## Notes for API Gateway

The **GET /api/v1/users/:user_id/** endpoint is designed to be called by the API Gateway without authentication. This allows the gateway to retrieve user information for internal operations while protecting other endpoints with JWT authentication.
