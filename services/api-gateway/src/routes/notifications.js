import NotificationService from '../services/notificationService.js';
import { createResponse } from '../shared-response.js';

// Notification routes
async function notificationRoutes(fastify, options) {
  // Initialize notification service
  const notificationService = new NotificationService(fastify);

  // POST /api/v1/notifications/ - Create and route notification request
  fastify.post('/api/v1/notifications/', {
    preHandler: [fastify.authenticate],
    schema: {
      description: 'Create and route notification request',
      tags: ['notifications'],
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
      body: {
        type: 'object',
        required: ['notification_type', 'user_id', 'template_code', 'variables', 'request_id', 'priority'],
        properties: {
          notification_type: {
            type: 'string',
            enum: ['email', 'push'],
            description: 'Type of notification to send'
          },
          user_id: {
            type: 'string',
            format: 'uuid',
            description: 'User ID (UUID)'
          },
          template_code: {
            type: 'string',
            description: 'Template code for the notification'
          },
          variables: {
            type: 'object',
            required: ['name', 'link'],
            properties: {
              name: {
                type: 'string',
                description: 'User name for template substitution'
              },
              link: {
                type: 'string',
                format: 'uri',
                description: 'Link for the notification'
              },
              meta: {
                type: 'object',
                description: 'Additional metadata for template substitution'
              }
            },
            description: 'Variables for template substitution'
          },
          request_id: {
            type: 'string',
            description: 'Unique request ID for idempotency'
          },
          priority: {
            type: 'integer',
            minimum: 1,
            maximum: 10,
            description: 'Notification priority (1-10)'
          },
          metadata: {
            type: 'object',
            description: 'Additional metadata'
          }
        }
      },
      response: {
        202: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
            data: {
              type: 'object',
              properties: {
                notification_id: { type: 'string' },
                request_id: { type: 'string' },
                status: { type: 'string' }
              }
            },
            error: { type: 'string' }
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
        400: {
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
  }, async (request, reply) => {
    try {
      const correlationId = request.correlationId;
      const notificationRequest = request.body;

      fastify.log.info('Processing notification request:', {
        correlation_id: correlationId,
        request_id: notificationRequest.request_id,
        user_id: notificationRequest.user_id,
        notification_type: notificationRequest.notification_type,
        user_id_from_token: request.user?.sub || request.user?.userId,
      });

      // Check for idempotency using Redis
      fastify.log.info('Checking idempotency for request:', {
        correlation_id: correlationId,
        request_id: notificationRequest.request_id,
      });

      const cachedResponse = await fastify.checkIdempotency(notificationRequest.request_id);
      
      if (cachedResponse) {
        fastify.log.info('Returning cached response for duplicate request:', {
          correlation_id: correlationId,
          request_id: notificationRequest.request_id,
        });
        
        return reply.status(202).send(cachedResponse);
      }

      // Process the notification
      const notificationData = await notificationService.processNotification(
        notificationRequest,
        correlationId
      );

      // Create and return response
      const response = notificationService.createNotificationResponse(notificationData);
      
      // Store response in Redis for idempotency with TTL (24 hours)
      const stored = await fastify.storeIdempotency(
        notificationRequest.request_id,
        response,
        24 * 60 * 60 // 24 hours in seconds
      );
      
      if (stored) {
        fastify.log.info('Response stored for idempotency:', {
          correlation_id: correlationId,
          request_id: notificationRequest.request_id,
          notification_id: notificationData.notification_id,
        });
      } else {
        fastify.log.warn('Failed to store response for idempotency:', {
          correlation_id: correlationId,
          request_id: notificationRequest.request_id,
        });
      }
      
      fastify.log.info('Notification processed successfully:', {
        correlation_id: correlationId,
        notification_id: notificationData.notification_id,
      });

      return reply.status(202).send(response);
    } catch (error) {
      fastify.log.error('Error processing notification:', {
        correlation_id: request.correlationId,
        error: error.message,
        stack: error.stack,
      });

      // Return appropriate error response
      if (error.message.includes('disabled')) {
        return reply.status(400).send(createResponse(
          false,
          'Notification not sent',
          undefined,
          error.message
        ));
      }

      if (error.message.includes('not found') || error.message.includes('Invalid')) {
        return reply.status(400).send(createResponse(
          false,
          'Invalid request',
          undefined,
          error.message
        ));
      }

      if (error.message.includes('Service') || error.message.includes('discover')) {
        return reply.status(503).send(createResponse(
          false,
          'Service unavailable',
          undefined,
          'Required service is currently unavailable'
        ));
      }

      if (error.message.includes('RabbitMQ')) {
        return reply.status(503).send(createResponse(
          false,
          'Message queue unavailable',
          undefined,
          'Notification service is temporarily unavailable. Please try again later.'
        ));
      }

      return reply.status(500).send(createResponse(
        false,
        'Internal server error',
        undefined,
        'An unexpected error occurred while processing the notification'
      ));
    }
  });

  // GET /api/v1/notifications/:notification_id/status - Get notification status
  fastify.get('/api/v1/notifications/:notification_id/status', {
    schema: {
      description: 'Get notification status',
      tags: ['notifications'],
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
  }, async (request, reply) => {
    try {
      const { notification_id } = request.params;
      const correlationId = request.correlationId;

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
    } catch (error) {
      fastify.log.error('Error fetching notification status:', {
        correlation_id: request.correlationId,
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

  // POST /api/v1/notifications/status - Update notification status
  fastify.post('/api/v1/notifications/status', {
    preHandler: [fastify.authenticate],
    schema: {
      description: 'Update notification status (internal service endpoint)',
      tags: ['notifications'],
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
          },
          'X-Service-Name': {
            type: 'string',
            description: 'Service name for internal authentication'
          }
        },
        required: ['Authorization', 'X-Service-Name']
      },
      body: {
        type: 'object',
        required: ['notification_id', 'status'],
        properties: {
          notification_id: {
            type: 'string',
            description: 'Notification ID'
          },
          status: {
            type: 'string',
            enum: ['pending', 'delivered', 'failed'],
            description: 'Notification status'
          },
          timestamp: {
            type: 'string',
            format: 'date-time',
            description: 'Status timestamp (ISO datetime)'
          },
          error: {
            type: 'string',
            description: 'Error message if status is failed'
          }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' }
          }
        },
        400: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
            error: { type: 'string' }
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
  }, async (request, reply) => {
    try {
      const { notification_id, status, timestamp, error } = request.body;
      const correlationId = request.correlationId;
      const serviceName = request.headers['x-service-name'];

      fastify.log.info('Updating notification status:', {
        correlation_id: correlationId,
        notification_id: notification_id,
        status: status,
        service_name: serviceName,
      });

      // Validate service name (internal service authentication)
      const allowedServices = ['email-service', 'push-service'];
      if (!allowedServices.includes(serviceName)) {
        fastify.log.warn('Unauthorized service attempted to update status:', {
          correlation_id: correlationId,
          service_name: serviceName,
          notification_id: notification_id,
        });
        
        return reply.status(401).send(createResponse(
          false,
          'Unauthorized service',
          undefined,
          'Service is not authorized to update notification status'
        ));
      }

      // Prepare status data
      const statusData = {
        notification_id,
        status,
        timestamp: timestamp || new Date().toISOString(),
        error: error || null,
        correlation_id: correlationId,
        updated_by: serviceName,
      };

      // Store status in Redis
      const stored = await fastify.storeNotificationStatus(notification_id, statusData);
      
      if (!stored) {
        fastify.log.error('Failed to store notification status:', {
          correlation_id: correlationId,
          notification_id: notification_id,
        });
        
        return reply.status(500).send(createResponse(
          false,
          'Failed to update notification status',
          undefined,
          'Unable to store notification status in cache'
        ));
      }

      fastify.log.info('Notification status updated successfully:', {
        correlation_id: correlationId,
        notification_id: notification_id,
        status: status,
        updated_by: serviceName,
      });

      const response = createResponse(
        true,
        'Notification status updated successfully'
      );

      return reply.status(200).send(response);
    } catch (error) {
      fastify.log.error('Error updating notification status:', {
        correlation_id: request.correlationId,
        error: error.message,
        stack: error.stack,
      });

      return reply.status(500).send(createResponse(
        false,
        'Internal server error',
        undefined,
        'An unexpected error occurred while updating notification status'
      ));
    }
  });
}

export default notificationRoutes;