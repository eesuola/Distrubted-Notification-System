import type { FastifyRequest, FastifyReply } from 'fastify';
import type { ApiResponse } from '@shared/types/index.js';
import { createResponse } from '@shared/response.js';

/**
 * Generate a correlation ID for request tracking
 * @returns Generated correlation ID
 */
function generateCorrelationId(): string {
  return `corr_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Status routes handler
 * @param fastify - Fastify instance
 * @param options - Route options
 */
async function statusRoutes(fastify: any, options: any): Promise<void> {
  // GET /api/v1/notifications/:notification_id/status - Get notification status
  fastify.get('/notifications/:notification_id/status', {
    preHandler: [fastify.authenticate],
    schema: {
      description: 'Get notification status',
      tags: ['notifications', 'status'],
      headers: {
        type: 'object',
        properties: {
          Authorization: {
            type: 'string',
            description: 'JWT token in Bearer format'
          },
          'X-Correlation-Id': {
            type: 'string',
            description: 'Correlation ID for request tracking'
          }
        },
        required: ['Authorization']
      },
      params: {
        type: 'object',
        required: ['notification_id'],
        properties: {
          notification_id: {
            type: 'string',
            description: 'Notification ID'
          }
        }
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
                notification_id: { type: 'string' },
                status: { type: 'string', enum: ['pending', 'delivered', 'failed'] },
                timestamp: { type: 'string' },
                error: { type: 'string' },
                correlation_id: { type: 'string' },
                updated_by: { type: 'string' }
              }
            }
          }
        },
        401: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
            error: { type: 'string' }
          }
        },
        404: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
            error: { type: 'string' }
          }
        },
        500: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
            error: { type: 'string' }
          }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { notification_id } = (request as any).params;
      const correlationId = (request as any).correlationId || generateCorrelationId();

      fastify.log.info('Fetching notification status:', {
        correlation_id: correlationId,
        notification_id: notification_id,
      });

      // Retrieve notification status from Redis
      const statusData = await fastify.getNotificationStatus(notification_id);
      
      if (!statusData) {
        fastify.log.warn('Notification status not found:', {
          correlation_id: correlationId,
          notification_id: notification_id,
        });
        
        return reply.status(404).send(createResponse(
          false,
          'Notification status not found',
          undefined,
          `No status found for notification ID: ${notification_id}`
        ));
      }

      fastify.log.info('Notification status retrieved successfully:', {
        correlation_id: correlationId,
        notification_id: notification_id,
        status: statusData.status,
      });

      const response = createResponse(
        true,
        'Notification status retrieved successfully',
        statusData
      );

      return reply.status(200).send(response);
    } catch (error: any) {
      fastify.log.error('Error fetching notification status:', {
        correlation_id: (request as any).correlationId,
        error: error.message,
        stack: error.stack,
      });

      return reply.status(500).send(createResponse(
        false,
        'Internal server error',
        undefined,
        'An unexpected error occurred while fetching notification status'
      ));
    }
  });
}

export default statusRoutes;