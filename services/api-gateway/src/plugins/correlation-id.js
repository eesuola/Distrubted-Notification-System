import { randomUUID } from 'crypto';

// Correlation ID plugin for tracking requests across services
async function correlationIdPlugin(fastify, options) {
  // Add correlation ID to request
  fastify.addHook('preHandler', async (request, reply) => {
    // Check if correlation ID is already in headers
    let correlationId = request.headers['x-correlation-id'];
    
    // If not, generate a new one
    if (!correlationId) {
      correlationId = randomUUID();
    }
    
    // Store correlation ID in request object
    request.correlationId = correlationId;
    
    // Add correlation ID to response headers
    reply.header('x-correlation-id', correlationId);
  });

  // Add correlation ID to logger
  fastify.addHook('preHandler', async (request) => {
    request.log = request.log.child({ correlationId: request.correlationId });
  });
}

// Export plugin with Fastify plugin metadata
export default correlationIdPlugin;
export const autoConfig = {};