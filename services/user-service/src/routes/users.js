import { hashPassword, comparePassword } from '../utils/password.js';
import { createResponse } from '../shared-response.js';

// JSON Schemas for request/response validation
const userResponseSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    email: { type: 'string' },
    name: { type: 'string' },
    push_token: { type: ['string', 'null'] },
    notification_preferences: {
      type: 'object',
      properties: {
        email: { type: 'boolean' },
        push: { type: 'boolean' },
        sms: { type: 'boolean' },
      },
    },
    created_at: { type: 'string' },
    updated_at: { type: 'string' },
  },
};

const createUserSchema = {
  body: {
    type: 'object',
    required: ['email', 'password', 'name'],
    properties: {
      email: { type: 'string', format: 'email' },
      password: { type: 'string', minLength: 6 },
      name: { type: 'string', minLength: 2, maxLength: 100 },
    },
  },
  response: {
    201: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
        data: {
          type: 'object',
          properties: {
            user: userResponseSchema,
            token: { type: 'string' },
          },
        },
      },
    },
  },
};

const loginSchema = {
  body: {
    type: 'object',
    required: ['email', 'password'],
    properties: {
      email: { type: 'string', format: 'email' },
      password: { type: 'string' },
    },
  },
  response: {
    200: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
        data: {
          type: 'object',
          properties: {
            user: userResponseSchema,
            token: { type: 'string' },
          },
        },
      },
    },
  },
};

const getUserSchema = {
  params: {
    type: 'object',
    required: ['user_id'],
    properties: {
      user_id: { type: 'string' },
    },
  },
  response: {
    200: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
        data: userResponseSchema,
      },
    },
  },
};

const updateUserSchema = {
  params: {
    type: 'object',
    required: ['user_id'],
    properties: {
      user_id: { type: 'string' },
    },
  },
  body: {
    type: 'object',
    properties: {
      name: { type: 'string', minLength: 2, maxLength: 100 },
      push_token: { type: ['string', 'null'] },
    },
  },
  response: {
    200: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
        data: userResponseSchema,
      },
    },
  },
};

const updatePreferencesSchema = {
  params: {
    type: 'object',
    required: ['user_id'],
    properties: {
      user_id: { type: 'string' },
    },
  },
  body: {
    type: 'object',
    properties: {
      email: { type: 'boolean' },
      push: { type: 'boolean' },
      sms: { type: 'boolean' },
    },
  },
  response: {
    200: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
        data: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            notification_preferences: {
              type: 'object',
              properties: {
                email: { type: 'boolean' },
                push: { type: 'boolean' },
                sms: { type: 'boolean' },
              },
            },
            updated_at: { type: 'string' },
          },
        },
      },
    },
  },
};

/**
 * User routes plugin
 * @param {import('fastify').FastifyInstance} fastify
 */
export default async function userRoutes(fastify, options) {
  // POST /api/v1/users/ - Create a new user
  fastify.post('/', { schema: createUserSchema }, async (request, reply) => {
    const { email, password, name } = request.body;

    request.log.info({ email, name }, 'Creating new user');

    try {
      // Check if user already exists
      const existingUser = await fastify.prisma.user.findUnique({
        where: { email },
      });

      if (existingUser) {
        request.log.warn({ email }, 'User creation failed - email already exists');
        return reply.status(409).send(createResponse(false, 'User with this email already exists'));
      }

      // Hash password using bcrypt
      const hashedPassword = await hashPassword(password);

      // Create user with default notification preferences
      const user = await fastify.prisma.user.create({
        data: {
          email,
          password: hashedPassword,
          name,
          notification_preferences: {
            create: {
              email: true,
              push: true,
              sms: false,
            },
          },
        },
        include: {
          notification_preferences: true,
        },
      });

      // Generate JWT token
      const token = fastify.generateToken(user.id, user.email);

      // Remove password from response
      const { password: _, ...userWithoutPassword } = user;

      request.log.info({ user_id: user.id, email: user.email }, 'User created successfully');

      return reply.status(201).send(createResponse(true, 'User created successfully', {
        user: userWithoutPassword,
        token,
      }));
    } catch (error) {
      request.log.error({ err: error, email }, 'Error creating user');
      return reply.status(500).send(createResponse(false, 'Internal server error', undefined, error.message));
    }
  });

  // POST /api/v1/users/login/ - Authenticate user and return JWT
  fastify.post('/login', { schema: loginSchema }, async (request, reply) => {
    const { email, password } = request.body;

    request.log.info({ email }, 'User login attempt');

    try {
      // Find user by email
      const user = await fastify.prisma.user.findUnique({
        where: { email },
        include: {
          notification_preferences: true,
        },
      });

      if (!user) {
        request.log.warn({ email }, 'Login failed - user not found');
        return reply.status(401).send(createResponse(false, 'Invalid email or password'));
      }

      // Verify password using bcrypt
      const isPasswordValid = await comparePassword(password, user.password);

      if (!isPasswordValid) {
        request.log.warn({ email, user_id: user.id }, 'Login failed - invalid password');
        return reply.status(401).send(createResponse(false, 'Invalid email or password'));
      }

      // Generate JWT token
      const token = fastify.generateToken(user.id, user.email);

      // Remove password from response
      const { password: _, ...userWithoutPassword } = user;

      request.log.info({ user_id: user.id, email: user.email }, 'User logged in successfully');

      return reply.status(200).send(createResponse(true, 'Login successful', {
        user: userWithoutPassword,
        token,
      }));
    } catch (error) {
      request.log.error({ err: error, email }, 'Error during login');
      return reply.status(500).send(createResponse(false, 'Internal server error', undefined, error.message));
    }
  });

  // GET /api/v1/users/:user_id/ - Retrieve user profile
  fastify.get('/:user_id', { schema: getUserSchema }, async (request, reply) => {
    const { user_id } = request.params;

    request.log.info({ user_id }, 'Retrieving user profile');

    try {
      const user = await fastify.prisma.user.findUnique({
        where: { id: user_id },
        include: {
          notification_preferences: true,
        },
      });

      if (!user) {
        request.log.warn({ user_id }, 'User profile retrieval failed - user not found');
        return reply.status(404).send(createResponse(false, 'User not found'));
      }

      // Remove password from response
      const { password: _, ...userWithoutPassword } = user;

      request.log.info({ user_id }, 'User profile retrieved successfully');

      return reply.status(200).send(createResponse(true, 'User profile retrieved successfully', userWithoutPassword));
    } catch (error) {
      request.log.error({ err: error, user_id }, 'Error retrieving user profile');
      return reply.status(500).send(createResponse(false, 'Internal server error', undefined, error.message));
    }
  });

  // PATCH /api/v1/users/:user_id/ - Update user info
  fastify.patch(
    '/:user_id',
    {
      schema: updateUserSchema,
      onRequest: [fastify.authenticate],
    },
    async (request, reply) => {
      const { user_id } = request.params;
      const updates = request.body;

      try {
        request.log.info({ user_id, updates }, 'Updating user profile');

        // Verify the authenticated user matches the user_id
        if (request.user.user_id !== user_id) {
          request.log.warn({ user_id, authenticated_user_id: request.user.user_id }, 'User update failed - unauthorized');
          return reply.status(403).send(createResponse(false, 'You can only update your own profile'));
        }

        // Check if there are any fields to update
        if (Object.keys(updates).length === 0) {
          return reply.status(400).send(createResponse(false, 'No valid fields to update'));
        }

        // Update user
        const user = await fastify.prisma.user.update({
          where: { id: user_id },
          data: updates,
          include: {
            notification_preferences: true,
          },
        });

        // Remove password from response
        const { password: _, ...userWithoutPassword } = user;

        request.log.info({ user_id }, 'User profile updated successfully');

        return reply.status(200).send(createResponse(true, 'User updated successfully', userWithoutPassword));
      } catch (error) {
        if (error.code === 'P2025') {
          request.log.warn({ user_id }, 'User update failed - user not found');
          return reply.status(404).send(createResponse(false, 'User not found'));
        }

        request.log.error({ err: error, user_id }, 'Error updating user');
        return reply.status(500).send(createResponse(false, 'Internal server error', undefined, error.message));
      }
    }
  );

  // PATCH /api/v1/users/:user_id/preferences/ - Update notification preferences
  fastify.patch(
    '/:user_id/preferences',
    {
      schema: updatePreferencesSchema,
      onRequest: [fastify.authenticate],
    },
    async (request, reply) => {
      const { user_id } = request.params;
      const preferences = request.body;

      try {
        request.log.info({ user_id, preferences }, 'Updating notification preferences');

        // Verify the authenticated user matches the user_id
        if (request.user.user_id !== user_id) {
          request.log.warn({ user_id, authenticated_user_id: request.user.user_id }, 'Preferences update failed - unauthorized');
          return reply.status(403).send(createResponse(false, 'You can only update your own preferences'));
        }

        // Check if there are any preferences to update
        if (Object.keys(preferences).length === 0) {
          return reply.status(400).send(createResponse(false, 'No preferences provided to update'));
        }

        // Update or create notification preferences
        const updatedPreferences = await fastify.prisma.notificationPreferences.upsert({
          where: { user_id },
          update: preferences,
          create: {
            user_id,
            ...preferences,
          },
        });

        // Get updated user to return updated_at timestamp
        const user = await fastify.prisma.user.findUnique({
          where: { id: user_id },
          select: {
            id: true,
            updated_at: true,
          },
        });

        request.log.info({ user_id }, 'Notification preferences updated successfully');

        return reply.status(200).send(createResponse(true, 'Notification preferences updated successfully', {
          id: user.id,
          notification_preferences: {
            email: updatedPreferences.email,
            push: updatedPreferences.push,
            sms: updatedPreferences.sms,
          },
          updated_at: user.updated_at,
        }));
      } catch (error) {
        request.log.error({ err: error, user_id }, 'Error updating notification preferences');
        return reply.status(500).send(createResponse(false, 'Internal server error', undefined, error.message));
      }
    }
  );
}
