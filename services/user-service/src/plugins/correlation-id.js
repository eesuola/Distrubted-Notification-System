import fp from 'fastify-plugin';
import { randomUUID } from 'crypto';

/**
 * Fastify plugin to handle correlation IDs for distributed tracing
 * Extracts x-correlation-id from request headers or generates a new one
 * Includes it in all logs for that request
 * @param {import('fastify').FastifyInstance} fastify
 */
async function correlationIdPlugin(fastify, options) {
  // Add a hook to extract or generate correlation ID for each request
  fastify.addHook('onRequest', async (request, reply) => {
    // Extract correlation ID from header or generate a new one
    const correlationId = request.headers['x-correlation-id'] || randomUUID();
    
    // Store correlation ID in request object for easy access
    request.correlationId = correlationId;
    
    // Add correlation ID to response headers for traceability
    reply.header('x-correlation-id', correlationId);
    
    // Create a child logger with correlation ID bound to it
    request.log = request.log.child({ correlation_id: correlationId });
  });

  // Decorate request with correlation ID for easy access
  fastify.decorateRequest('correlationId', null);
}

export default fp(correlationIdPlugin, {
  name: 'correlation-id',
});
