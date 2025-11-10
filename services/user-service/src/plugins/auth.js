import fp from 'fastify-plugin';
import jwt from 'jsonwebtoken';

/**
 * Fastify plugin for JWT authentication
 * @param {import('fastify').FastifyInstance} fastify
 */
async function authPlugin(fastify, options) {
  // Decorate request with verifyToken method
  fastify.decorateRequest('user', null);

  // JWT authentication hook
  fastify.decorate('authenticate', async function (request, reply) {
    try {
      const authHeader = request.headers.authorization;
      
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return reply.status(401).send({
          success: false,
          message: 'Access token required',
        });
      }

      const token = authHeader.substring(7); // Remove 'Bearer ' prefix
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      request.user = decoded;
    } catch (error) {
      return reply.status(403).send({
        success: false,
        message: 'Invalid or expired token',
      });
    }
  });

  // Helper to generate JWT tokens
  fastify.decorate('generateToken', function (userId, email) {
    return jwt.sign(
      { user_id: userId, email },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );
  });
}

export default fp(authPlugin, {
  name: 'auth',
});
