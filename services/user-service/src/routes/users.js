import { hashPassword, comparePassword } from '../utils/password.js';

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

    try {
      // Check if user already exists
      const existingUser = await fastify.prisma.user.findUnique({
        where: { email },
      });

      if (existingUser) {
        return reply.status(409).send({
          success: false,
          message: 'User with this email already exists',
        });
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

      return reply.status(201).send({
        success: true,
        message: 'User created successfully',
        data: {
          user: userWithoutPassword,
          token,
        },
      });
    } catch (error) {
      fastify.log.error('Error creating user:', error);
      return reply.status(500).send({
        success: false,
        message: 'Internal server error',
        error: error.message,
      });
    }
  });

  // POST /api/v1/users/login/ - Authenticate user and return JWT
  fastify.post('/login', { schema: loginSchema }, async (request, reply) => {
    const { email, password } = request.body;

    try {
      // Find user by email
      const user = await fastify.prisma.user.findUnique({
        where: { email },
        include: {
          notification_preferences: true,
        },
      });

      if (!user) {
        return reply.status(401).send({
          success: false,
          message: 'Invalid email or password',
        });
      }

      // Verify password using bcrypt
      const isPasswordValid = await comparePassword(password, user.password);

      if (!isPasswordValid) {
        return reply.status(401).send({
          success: false,
          message: 'Invalid email or password',
        });
      }

      // Generate JWT token
      const token = fastify.generateToken(user.id, user.email);

      // Remove password from response
      const { password: _, ...userWithoutPassword } = user;

      return reply.status(200).send({
        success: true,
        message: 'Login successful',
        data: {
          user: userWithoutPassword,
          token,
        },
      });
    } catch (error) {
      fastify.log.error('Error logging in:', error);
      return reply.status(500).send({
        success: false,
        message: 'Internal server error',
        error: error.message,
      });
    }
  });

  // GET /api/v1/users/:user_id/ - Retrieve user profile
  fastify.get('/:user_id', { schema: getUserSchema }, async (request, reply) => {
    const { user_id } = request.params;

    try {
      const user = await fastify.prisma.user.findUnique({
        where: { id: user_id },
        include: {
          notification_preferences: true,
        },
      });

      if (!user) {
        return reply.status(404).send({
          success: false,
          message: 'User not found',
        });
      }

      // Remove password from response
      const { password: _, ...userWithoutPassword } = user;

      return reply.status(200).send({
        success: true,
        message: 'User profile retrieved successfully',
        data: userWithoutPassword,
      });
    } catch (error) {
      fastify.log.error('Error retrieving user profile:', error);
      return reply.status(500).send({
        success: false,
        message: 'Internal server error',
        error: error.message,
      });
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
        // Verify the authenticated user matches the user_id
        if (request.user.user_id !== user_id) {
          return reply.status(403).send({
            success: false,
            message: 'You can only update your own profile',
          });
        }

        // Check if there are any fields to update
        if (Object.keys(updates).length === 0) {
          return reply.status(400).send({
            success: false,
            message: 'No valid fields to update',
          });
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

        return reply.status(200).send({
          success: true,
          message: 'User updated successfully',
          data: userWithoutPassword,
        });
      } catch (error) {
        if (error.code === 'P2025') {
          return reply.status(404).send({
            success: false,
            message: 'User not found',
          });
        }

        fastify.log.error('Error updating user:', error);
        return reply.status(500).send({
          success: false,
          message: 'Internal server error',
          error: error.message,
        });
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
        // Verify the authenticated user matches the user_id
        if (request.user.user_id !== user_id) {
          return reply.status(403).send({
            success: false,
            message: 'You can only update your own preferences',
          });
        }

        // Check if there are any preferences to update
        if (Object.keys(preferences).length === 0) {
          return reply.status(400).send({
            success: false,
            message: 'No preferences provided to update',
          });
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

        return reply.status(200).send({
          success: true,
          message: 'Notification preferences updated successfully',
          data: {
            id: user.id,
            notification_preferences: {
              email: updatedPreferences.email,
              push: updatedPreferences.push,
              sms: updatedPreferences.sms,
            },
            updated_at: user.updated_at,
          },
        });
      } catch (error) {
        fastify.log.error('Error updating notification preferences:', error);
        return reply.status(500).send({
          success: false,
          message: 'Internal server error',
          error: error.message,
        });
      }
    }
  );
}
