import { createResponse } from '../../../shared/response.js';

class NotificationService {
  constructor(fastify) {
    this.fastify = fastify;
    this.consul = fastify.consul;
    this.serviceDiscovery = fastify.serviceDiscovery;
  }

  // Get User Service URL from Consul
  async getUserServiceUrl() {
    try {
      const services = await this.consul.health.service({
        service: 'user-service',
        passing: true,
      });
      
      if (services.length === 0) {
        throw new Error('No healthy user-service instances found!');
      }
      
      const service = services[0];
      const address = service.Service.Address;
      const port = service.Service.Port;
      return `http://${address}:${port}`;
    } catch (error) {
      this.fastify.log.error('Error discovering User Service:', error);
      throw new Error('Failed to discover User Service');
    }
  }

  // Get Template Service URL from Consul
  async getTemplateServiceUrl() {
    try {
      const services = await this.consul.health.service({
        service: 'template-service',
        passing: true,
      });
      
      if (services.length === 0) {
        throw new Error('No healthy template-service instances found!');
      }
      
      const service = services[0];
      const address = service.Service.Address;
      const port = service.Service.Port;
      return `http://${address}:${port}`;
    } catch (error) {
      this.fastify.log.error('Error discovering Template Service:', error);
      throw new Error('Failed to discover Template Service');
    }
  }

  // Fetch user data from User Service
  async fetchUserData(userId, correlationId) {
    try {
      const userServiceUrl = await this.getUserServiceUrl();
      const response = await fetch(`${userServiceUrl}/api/v1/users/${userId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'x-correlation-id': correlationId,
        },
      });

      if (!response.ok) {
        throw new Error(`User Service returned ${response.status}: ${response.statusText}`);
      }

      const userData = await response.json();
      return userData;
    } catch (error) {
      this.fastify.log.error('Error fetching user data:', error);
      throw new Error('Failed to fetch user data');
    }
  }

  // Fetch template data from Template Service
  async fetchTemplateData(templateCode, language = 'en', correlationId) {
    try {
      const templateServiceUrl = await this.getTemplateServiceUrl();
      const url = `${templateServiceUrl}/api/v1/templates/${templateCode}${language ? `?language=${language}` : ''}`;
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'x-correlation-id': correlationId,
        },
      });

      if (!response.ok) {
        throw new Error(`Template Service returned ${response.status}: ${response.statusText}`);
      }

      const templateData = await response.json();
      return templateData;
    } catch (error) {
      this.fastify.log.error('Error fetching template data:', error);
      throw new Error('Failed to fetch template data');
    }
  }

  // Validate user preferences for notification type
  validateUserPreferences(userPreferences, notificationType) {
    if (!userPreferences) {
      throw new Error('User preferences not found');
    }

    switch (notificationType) {
      case 'email':
        if (!userPreferences.email) {
          throw new Error('User has disabled email notifications');
        }
        break;
      case 'push':
        if (!userPreferences.push) {
          throw new Error('User has disabled push notifications');
        }
        break;
      default:
        throw new Error(`Invalid notification type: ${notificationType}`);
    }
  }

  // Process notification request
  async processNotification(notificationRequest, correlationId) {
    try {
      // Fetch user data
      const userDataResponse = await this.fetchUserData(notificationRequest.user_id, correlationId);
      
      if (!userDataResponse.success) {
        throw new Error(userDataResponse.error || 'Failed to fetch user data');
      }

      const userData = userDataResponse.data;

      // Validate user preferences
      this.validateUserPreferences(userData.preferences, notificationRequest.notification_type);

      // Fetch template data
      const templateDataResponse = await this.fetchTemplateData(
        notificationRequest.template_code,
        notificationRequest.variables.language || 'en',
        correlationId
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
        status: 'pending',
        timestamp: notificationData.timestamp,
        error: null,
        correlation_id: correlationId,
        updated_by: 'api-gateway',
      };

      const statusStored = await this.fastify.storeNotificationStatus(
        notificationData.notification_id,
        initialStatus
      );

      if (!statusStored) {
        this.fastify.log.warn('Failed to store initial notification status:', {
          correlation_id: correlationId,
          notification_id: notificationData.notification_id,
        });
      } else {
        this.fastify.log.info('Initial notification status stored:', {
          correlation_id: correlationId,
          notification_id: notificationData.notification_id,
          status: 'pending',
        });
      }

      // Queue notification for processing using RabbitMQ
      const routingKey = notificationRequest.notification_type === 'email' ? 'email.queue' : 'push.queue';
      
      // Check if RabbitMQ is available
      if (!this.fastify.checkRabbitMQConnection || !(await this.fastify.checkRabbitMQConnection())) {
        throw new Error('RabbitMQ service is not available');
      }

      // Publish message to appropriate queue
      const publishResult = await this.fastify.publishToQueue(routingKey, notificationData, {
        correlationId: correlationId,
        messageId: notificationData.notification_id,
        timestamp: Date.now(),
      });
      
      this.fastify.log.info('Notification queued successfully:', {
        notification_id: notificationData.notification_id,
        user_id: notificationData.user_id,
        notification_type: notificationData.notification_type,
        queue: routingKey,
        correlation_id: publishResult.correlation_id,
      });

      // Return minimal data for 202 Accepted response
      return {
        notification_id: notificationData.notification_id,
        request_id: notificationData.request_id,
        status: 'accepted',
        message: 'Notification accepted for processing'
      };
    } catch (error) {
      this.fastify.log.error('Error processing notification:', error);
      throw error;
    }
  }

  // Create notification response for 202 Accepted
  createNotificationResponse(notificationData) {
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
}

export default NotificationService;