import type { FastifyRequest, FastifyReply } from 'fastify';
import type {
  NotificationRequest,
  ApiResponse,
  UserPreference,
  NotificationStatusUpdate
} from '@shared/types/index.js';
import {
  NotificationType,
  NotificationStatus
} from '@shared/types/index.js';
import { createResponse } from '@shared/response.js';
import { getConsulClient } from '../services/consul.js';
import { getRabbitMQClient } from '../services/queue.js';
import { service_names, circuit_breaker_config, notification_config } from '../config.js';

// Circuit breaker state for external services
interface CircuitBreakerState {
  failures: number;
  lastFailureTime: number;
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
}

// Service circuit breakers
const circuitBreakers: Record<string, CircuitBreakerState> = {};

/**
 * Check if circuit breaker is open for a service
 * @param serviceName - Name of the service
 * @returns True if circuit breaker is open
 */
function isCircuitBreakerOpen(serviceName: string): boolean {
  const breaker = circuitBreakers[serviceName];
  if (!breaker) {
    // Initialize circuit breaker for new service
    circuitBreakers[serviceName] = {
      failures: 0,
      lastFailureTime: 0,
      state: 'CLOSED'
    };
    return false;
  }

  if (breaker.state === 'OPEN') {
    // Check if we should try again (half-open state)
    const timeSinceLastFailure = Date.now() - breaker.lastFailureTime;
    if (timeSinceLastFailure > circuit_breaker_config.reset_timeout) {
      breaker.state = 'HALF_OPEN';
      return false;
    }
    return true;
  }

  return false;
}

/**
 * Record a failure for a service
 * @param serviceName - Name of the service
 */
function recordFailure(serviceName: string): void {
  const breaker = circuitBreakers[serviceName];
  if (!breaker) return;

  breaker.failures++;
  breaker.lastFailureTime = Date.now();

  // Check if we should open the circuit
  if (breaker.failures >= circuit_breaker_config.minimum_requests) {
    breaker.state = 'OPEN';
  }
}

/**
 * Record a success for a service
 * @param serviceName - Name of the service
 */
function recordSuccess(serviceName: string): void {
  const breaker = circuitBreakers[serviceName];
  if (!breaker) return;

  // Reset on success
  breaker.failures = 0;
  breaker.state = 'CLOSED';
}

/**
 * Generate a correlation ID for request tracking
 * @returns Generated correlation ID
 */
function generateCorrelationId(): string {
  return `corr_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Fetch user data from User Service with circuit breaker
 * @param userId - User ID
 * @param correlationId - Correlation ID for tracking
 * @param fastify - Fastify instance
 * @returns User data
 */
async function fetchUserData(
  userId: string, 
  correlationId: string, 
  fastify: any
): Promise<any> {
  const serviceName = service_names.user_service;
  
  // Check circuit breaker
  if (isCircuitBreakerOpen(serviceName)) {
    throw new Error(`User Service circuit breaker is open`);
  }

  try {
    const consulClient = getConsulClient(fastify.log);
    const userServiceUrl = await consulClient.getServiceUrl(serviceName);
    
    const response = await fetch(`${userServiceUrl}/api/v1/users/${userId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-Correlation-Id': correlationId,
      },
      signal: AbortSignal.timeout(circuit_breaker_config.timeout),
    });

    if (!response.ok) {
      throw new Error(`User Service returned ${response.status}: ${response.statusText}`);
    }

    const userData = await response.json();
    recordSuccess(serviceName);
    return userData;
  } catch (error) {
    recordFailure(serviceName);
    fastify.log.error('Error fetching user data:', error);
    throw new Error('Failed to fetch user data');
  }
}

/**
 * Fetch template data from Template Service with circuit breaker
 * @param templateCode - Template code
 * @param language - Language code
 * @param correlationId - Correlation ID for tracking
 * @param fastify - Fastify instance
 * @returns Template data
 */
async function fetchTemplateData(
  templateCode: string,
  language: string,
  correlationId: string,
  fastify: any
): Promise<any> {
  const serviceName = service_names.template_service;
  
  // Check circuit breaker
  if (isCircuitBreakerOpen(serviceName)) {
    throw new Error(`Template Service circuit breaker is open`);
  }

  try {
    const consulClient = getConsulClient(fastify.log);
    const templateServiceUrl = await consulClient.getServiceUrl(serviceName);
    const url = `${templateServiceUrl}/api/v1/templates/${templateCode}${language ? `?language=${language}` : ''}`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-Correlation-Id': correlationId,
      },
      signal: AbortSignal.timeout(circuit_breaker_config.timeout),
    });

    if (!response.ok) {
      throw new Error(`Template Service returned ${response.status}: ${response.statusText}`);
    }

    const templateData = await response.json();
    recordSuccess(serviceName);
    return templateData;
  } catch (error) {
    recordFailure(serviceName);
    fastify.log.error('Error fetching template data:', error);
    throw new Error('Failed to fetch template data');
  }
}

/**
 * Validate user preferences for notification type
 * @param userPreferences - User preferences
 * @param notificationType - Notification type
 */
function validateUserPreferences(
  userPreferences: UserPreference, 
  notificationType: NotificationType
): void {
  if (!userPreferences) {
    throw new Error('User preferences not found');
  }

  switch (notificationType) {
    case NotificationType.EMAIL:
      if (!userPreferences.email) {
        throw new Error('User has disabled email notifications');
      }
      break;
    case NotificationType.PUSH:
      if (!userPreferences.push) {
        throw new Error('User has disabled push notifications');
      }
      break;
    default:
      throw new Error(`Invalid notification type: ${notificationType}`);
  }
}

/**
 * Process notification request
 * @param notificationRequest - Notification request data
 * @param correlationId - Correlation ID for tracking
 * @param fastify - Fastify instance
 * @returns Processed notification data
 */
async function processNotification(
  notificationRequest: NotificationRequest,
  correlationId: string,
  fastify: any
): Promise<any> {
  // Fetch user data
  const userDataResponse = await fetchUserData(
    notificationRequest.user_id, 
    correlationId, 
    fastify
  );
  
  if (!userDataResponse.success) {
    throw new Error(userDataResponse.error || 'Failed to fetch user data');
  }

  const userData = userDataResponse.data;

  // Validate user preferences
  validateUserPreferences(userData.preferences, notificationRequest.notification_type);

  // Fetch template data
  const templateDataResponse = await fetchTemplateData(
    notificationRequest.template_code,
    'en', // Default language, can be extracted from variables if needed
    correlationId,
    fastify
  );

  if (!templateDataResponse.success) {
    throw new Error(templateDataResponse.error || 'Failed to fetch template data');
  }

  const templateData = templateDataResponse.data;

  // Prepare notification data for RabbitMQ message
  const notificationData = {
    notification_id: notificationRequest.request_id,
    user_id: notificationRequest.user_id,
    template_code: notificationRequest.template_code,
    variables: notificationRequest.variables,
    request_id: notificationRequest.request_id,
    correlation_id: correlationId,
    notification_type: notificationRequest.notification_type,
    user_email: userData.email,
    user_push_token: userData.push_token,
    template_content: templateData,
    timestamp: new Date().toISOString(),
    priority: notificationRequest.priority,
    metadata: notificationRequest.metadata,
  };

  // Store initial notification status in Redis
  const initialStatus = {
    notification_id: notificationData.notification_id,
    status: NotificationStatus.PENDING,
    timestamp: notificationData.timestamp,
    correlation_id: correlationId,
  };

  const statusStored = await fastify.storeNotificationStatus(
    notificationData.notification_id,
    initialStatus
  );

  if (!statusStored) {
    fastify.log.warn('Failed to store initial notification status:', {
      correlation_id: correlationId,
      notification_id: notificationData.notification_id,
    });
  } else {
    fastify.log.info('Initial notification status stored:', {
      correlation_id: correlationId,
      notification_id: notificationData.notification_id,
      status: 'pending',
    });
  }

  // Queue notification for processing using RabbitMQ
  const routingKey = notificationRequest.notification_type === NotificationType.EMAIL 
    ? 'email.queue' 
    : 'push.queue';
  
  // Get RabbitMQ client and publish message
  const rabbitMQClient = getRabbitMQClient(fastify.log);
  
  try {
    // Ensure connection is established
    await rabbitMQClient.connect();
    
    // Publish message to appropriate queue
    const publishResult = await rabbitMQClient.publishToQueue(routingKey, notificationData, {
      correlationId: correlationId,
      messageId: notificationData.notification_id,
      timestamp: Date.now(),
    });
    
    fastify.log.info('Notification queued successfully:', {
      notification_id: notificationData.notification_id,
      user_id: notificationData.user_id,
      notification_type: notificationData.notification_type,
      queue: routingKey,
      correlation_id: publishResult.correlation_id,
    });
  } catch (error) {
    fastify.log.error('Failed to queue notification:', error);
    throw new Error('Failed to queue notification for processing');
  }

  // Return minimal data for 202 Accepted response
  return {
    notification_id: notificationData.notification_id,
    request_id: notificationData.request_id,
    status: 'accepted',
    message: 'Notification accepted for processing'
  };
}

/**
 * Create notification response for 202 Accepted
 * @param notificationData - Notification data
 * @returns Formatted API response
 */
function createNotificationResponse(notificationData: any): ApiResponse<any> {
  return createResponse(
    true,
    'Notification accepted for processing',
    {
      notification_id: notificationData.notification_id,
      request_id: notificationData.request_id,
      status: notificationData.status,
    }
  );
}

/**
 * Notification routes handler
 * @param fastify - Fastify instance
 * @param options - Route options
 */
async function notificationRoutes(fastify: any, options: any): Promise<void> {
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
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Generate or use existing correlation ID
      const correlationId = (request as any).correlationId || generateCorrelationId();
      const notificationRequest = request.body as NotificationRequest;

      fastify.log.info('Processing notification request:', {
        correlation_id: correlationId,
        request_id: notificationRequest.request_id,
        user_id: notificationRequest.user_id,
        notification_type: notificationRequest.notification_type,
        user_id_from_token: (request as any).user?.sub || (request as any).user?.userId,
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
      const notificationData = await processNotification(
        notificationRequest,
        correlationId,
        fastify
      );

      // Create and return response
      const response = createNotificationResponse(notificationData);
      
      // Store response in Redis for idempotency with TTL (24 hours)
      const stored = await fastify.storeIdempotency(
        notificationRequest.request_id,
        response,
        notification_config.idempotency_ttl
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
    } catch (error: any) {
      fastify.log.error('Error processing notification:', {
        correlation_id: (request as any).correlationId,
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

      if (error.message.includes('Service') || error.message.includes('discover') || error.message.includes('circuit breaker')) {
        return reply.status(503).send(createResponse(
          false,
          'Service unavailable',
          undefined,
          'Required service is currently unavailable'
        ));
      }

      if (error.message.includes('RabbitMQ') || error.message.includes('queue')) {
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
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { notification_id, status, timestamp, error } = request.body as NotificationStatusUpdate;
      const correlationId = (request as any).correlationId || generateCorrelationId();
      const serviceName = (request.headers as any)['x-service-name'];

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
        status: status as NotificationStatus,
        timestamp: timestamp || new Date().toISOString(),
        error: error || undefined,
        correlation_id: correlationId,
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
    } catch (error: any) {
      fastify.log.error('Error updating notification status:', {
        correlation_id: (request as any).correlationId,
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