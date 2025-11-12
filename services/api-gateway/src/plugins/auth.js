import jwt from '@fastify/jwt';

// JWT Authentication plugin for API Gateway
async function authPlugin(fastify, options) {
  // Register JWT plugin
  fastify.register(jwt, {
    secret: process.env.JWT_SECRET || 'default-secret-key',
  });

  // Verify JWT token from Authorization header
  const verifyJWT = async (request, reply) => {
    try {
      // Check if Authorization header exists
      if (!request.headers.authorization) {
        reply.code(401).send({
          success: false,
          error: 'Missing Authorization header',
          message: 'Authentication required',
        });
        return;
      }

      // Extract token from Bearer format
      const authHeader = request.headers.authorization;
      if (!authHeader.startsWith('Bearer ')) {
        reply.code(401).send({
          success: false,
          error: 'Invalid Authorization header format',
          message: 'Authorization header must be in format: Bearer <token>',
        });
        return;
      }

      const token = authHeader.substring(7); // Remove 'Bearer ' prefix

      // Verify and decode token
      const decoded = await request.jwtVerify();
      
      // Add user info to request object
      request.user = decoded;
      
      return decoded;
    } catch (error) {
      // Handle specific JWT errors
      if (error.code === 'FAST_JWT_NO_AUTHORIZATION_IN_HEADER') {
        reply.code(401).send({
          success: false,
          error: 'Missing Authorization header',
          message: 'Authentication required',
        });
      } else if (error.code === 'FAST_JWT_MALFORMED') {
        reply.code(401).send({
          success: false,
          error: 'Malformed token',
          message: 'Invalid JWT token format',
        });
      } else if (error.code === 'FAST_JWT_EXPIRED') {
        reply.code(401).send({
          success: false,
          error: 'Token expired',
          message: 'JWT token has expired, please login again',
        });
      } else if (error.code === 'FAST_JWT_BAD_SIGNATURE') {
        reply.code(401).send({
          success: false,
          error: 'Invalid token signature',
          message: 'JWT token signature is invalid',
        });
      } else {
        // Generic JWT error
        fastify.log.error('JWT verification error:', error);
        reply.code(401).send({
          success: false,
          error: 'Authentication failed',
          message: 'Invalid JWT token',
        });
      }
    }
  };

  // Add preHandler hook for JWT verification
  fastify.addHook('preHandler', async (request, reply) => {
    // Skip JWT verification for health check and login routes
    const skipAuthRoutes = ['/health', '/api/v1/auth/login'];
    
    if (skipAuthRoutes.includes(request.routerPath)) {
      return;
    }

    // Apply JWT verification for all other routes
    await verifyJWT(request, reply);
  });

  // Decorator to protect specific routes
  fastify.decorate('authenticate', async (request, reply) => {
    return await verifyJWT(request, reply);
  });

  // Decorator to generate JWT tokens
  fastify.decorate('generateToken', (payload) => {
    return fastify.jwt.sign(payload);
  });

  // Decorator to verify JWT without throwing errors
  fastify.decorate('verifyTokenOptional', async (request) => {
    try {
      if (!request.headers.authorization || !request.headers.authorization.startsWith('Bearer ')) {
        return null;
      }
      
      const token = request.headers.authorization.substring(7);
      return await request.jwtVerify();
    } catch (error) {
      return null;
    }
  });
}

// Export plugin with Fastify plugin metadata
export default authPlugin;
export const autoConfig = {};