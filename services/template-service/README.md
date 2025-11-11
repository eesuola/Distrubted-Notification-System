# Template Service

Microservice for managing notification templates with versioning support in the Distributed Notification System.

## Tech Stack

- **Framework**: Fastify 4.x
- **Database**: PostgreSQL
- **ORM**: Prisma
- **Documentation**: Swagger/OpenAPI

## Features

- Create brand new templates (first version)
- Retrieve templates by code and language
- Version history management
- Multi-language support
- Template variable support (e.g., `{{name}}`, `{{link}}`)

## API Endpoints

### 1. Create Brand New Template
- **POST** `/api/v1/templates/`
- **Description**: Create a completely new template (introduces a new template_code)
- **Request Body**:
  ```json
  {
    "template_code": "welcome_email",
    "language": "en",
    "subject": "Welcome to Our Service, {{name}}!",
    "content": "Hi {{name}}, we're so excited to have you. Click here to get started: {{link}}."
  }
  ```
- **Response** (201):
  ```json
  {
    "success": true,
    "message": "Template created successfully",
    "data": {
      "id": "uuid",
      "template_code": "welcome_email",
      "language": "en",
      "subject": "Welcome to Our Service, {{name}}!",
      "content": "Hi {{name}}, we're so excited to have you. Click here to get started: {{link}}.",
      "version": 1,
      "created_at": "2024-01-01T00:00:00.000Z",
      "updated_at": "2024-01-01T00:00:00.000Z"
    }
  }
  ```
- **Response** (409 Conflict):
  ```json
  {
    "success": false,
    "message": "Template with this code and language already exists. Use the /versions endpoint to create a new version."
  }
  ```

### 2. Get Template by Code
- **GET** `/api/v1/templates/:template_code`
- **Description**: Retrieve template (latest version by default)
- **Query Parameters**:
  - `language` (optional): Language code (default: "en")
  - `version` (optional): Specific version number
- **Response** (200):
  ```json
  {
    "success": true,
    "message": "Template retrieved successfully",
    "data": {
      "id": "uuid",
      "template_code": "welcome_email",
      "language": "en",
      "subject": "Welcome to Our Service, {{name}}!",
      "content": "Hi {{name}}, we're so excited to have you. Click here to get started: {{link}}.",
      "version": 1,
      "created_at": "2024-01-01T00:00:00.000Z",
      "updated_at": "2024-01-01T00:00:00.000Z"
    }
  }
  ```

### 3. Get All Template Versions
- **GET** `/api/v1/templates/:template_code/versions`
- **Description**: Retrieve all versions of a template
- **Query Parameters**:
  - `language` (optional): Language code (default: "en")
- **Response** (200):
  ```json
  {
    "success": true,
    "message": "Template versions retrieved successfully",
    "data": [
      {
        "id": "uuid",
        "template_code": "welcome_email",
        "language": "en",
        "subject": "Welcome!",
        "content": "Latest version content",
        "version": 2,
        "created_at": "2024-01-02T00:00:00.000Z",
        "updated_at": "2024-01-02T00:00:00.000Z"
      },
      {
        "id": "uuid",
        "template_code": "welcome_email",
        "language": "en",
        "subject": "Welcome to Our Service, {{name}}!",
        "content": "Original content",
        "version": 1,
        "created_at": "2024-01-01T00:00:00.000Z",
        "updated_at": "2024-01-01T00:00:00.000Z"
      }
    ]
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
   PORT=3002
   NODE_ENV=development
   HOST=0.0.0.0
   DATABASE_URL="postgresql://postgres:password@localhost:5432/template_service?schema=public"
   CORS_ORIGIN=*
   ```

3. **Generate Prisma client**:
   ```bash
   npm run prisma:generate
   ```

4. **Run database migrations**:
   ```bash
   npm run prisma:migrate
   ```
   When prompted for migration name, use: `init` or `create_templates_table`

5. **Start the service**:
   ```bash
   # Production
   npm start
   
   # Development (with auto-reload)
   npm run dev
   ```

6. **View API documentation**:
   - Open browser at `http://localhost:3002/documentation`

## Database Schema

### Template Table
```prisma
model Template {
  id            String   @id @default(uuid())
  template_code String
  language      String
  subject       String?
  content       String
  version       Int      @default(1)
  created_at    DateTime @default(now())
  updated_at    DateTime @updatedAt

  @@unique([template_code, language, version])
  @@index([template_code, language])
}
```

## Template Variables

Templates support variable substitution using double curly braces:

- `{{name}}` - User's name
- `{{link}}` - Action link
- `{{email}}` - User's email
- Custom variables as needed

**Example**:
```
Subject: Welcome, {{name}}!
Content: Hi {{name}}, click here to verify your email: {{link}}
```

## Validation Rules

### Template Code
- Only lowercase letters, numbers, and underscores
- Pattern: `^[a-z0-9_]+$`
- Example: `welcome_email`, `password_reset`, `order_confirmation`

### Language Code
- ISO 639-1 format (2 letters) or with country code
- Pattern: `^[a-z]{2}(-[A-Z]{2})?$`
- Examples: `en`, `en-US`, `fr`, `es`, `de-DE`

### Subject
- Optional (required for email templates)
- Max length: 500 characters

### Content
- Required
- Minimum length: 1 character

## Business Logic

### Creating a New Template

1. **Brand New Template** (POST `/api/v1/templates/`):
   - Checks if `template_code` + `language` combination exists
   - If **does NOT exist**: Creates with `version: 1`
   - If **exists**: Returns `409 Conflict` error
   - Use `/versions` endpoint to create new versions (to be implemented)

### Version Management

- Each template has a unique combination of `template_code`, `language`, and `version`
- Version 1 is always the first template created
- Latest version is retrieved by default
- All versions are preserved for audit trail

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

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `3002` |
| `HOST` | Server host | `0.0.0.0` |
| `NODE_ENV` | Environment | `development` |
| `DATABASE_URL` | PostgreSQL connection string | Required |
| `CORS_ORIGIN` | CORS allowed origins | `*` |
| `LOG_LEVEL` | Logging level | `info` |

## Use Cases

### Email Templates
```json
{
  "template_code": "welcome_email",
  "language": "en",
  "subject": "Welcome to {{company_name}}, {{name}}!",
  "content": "Hi {{name}}, thanks for joining {{company_name}}..."
}
```

### Push Notification Templates
```json
{
  "template_code": "order_shipped",
  "language": "en",
  "content": "Your order #{{order_id}} has been shipped!"
}
```

### Multi-Language Support
```json
// English
{
  "template_code": "welcome_email",
  "language": "en",
  "subject": "Welcome, {{name}}!",
  "content": "Hi {{name}}, welcome to our service!"
}

// Spanish
{
  "template_code": "welcome_email",
  "language": "es",
  "subject": "¡Bienvenido, {{name}}!",
  "content": "Hola {{name}}, ¡bienvenido a nuestro servicio!"
}
```

## Future Endpoints (To Be Implemented)

- **POST** `/api/v1/templates/:template_code/versions/` - Create new version
- **PUT** `/api/v1/templates/:id` - Update template
- **DELETE** `/api/v1/templates/:id` - Delete template
- **GET** `/api/v1/templates/` - List all templates with pagination

## Integration with Other Services

### Email/Push Services
These services call the Template Service to retrieve templates:

```javascript
// Retrieve template
GET /api/v1/templates/welcome_email?language=en

// Use returned template content
const message = template.content
  .replace('{{name}}', user.name)
  .replace('{{link}}', activationLink);
```

## Architecture

- **Fastify Plugins**: Modular plugin architecture for Prisma
- **JSON Schema Validation**: Type-safe request/response validation
- **Prisma ORM**: Type-safe database access with PostgreSQL
- **Swagger Documentation**: Auto-generated API documentation
- **Graceful Shutdown**: Proper cleanup of database connections

## Notes

- All field names use `snake_case` as per project conventions
- Templates are immutable once created (version history preserved)
- Subject field is optional (not needed for push notifications)
- Template variables use `{{variable}}` syntax
- Service runs on port 3002 by default
