import fp from 'fastify-plugin';
import amqp from 'amqplib';

/**
 * Fastify plugin to connect to RabbitMQ for API Gateway
 * Provides message publishing functionality for notifications
 * @param {import('fastify').FastifyInstance} fastify
 */
async function rabbitmqPlugin(fastify, options) {
  let connection = null;
  let channel = null;

  // RabbitMQ configuration from environment variables
  const config = {
    url: process.env.RABBITMQ_URL || 'amqp://localhost:5672',
    exchange: process.env.RABBITMQ_EXCHANGE || 'notifications.direct',
    exchangeType: process.env.RABBITMQ_EXCHANGE_TYPE || 'direct',
    emailQueue: process.env.RABBITMQ_EMAIL_QUEUE || 'email.queue',
    pushQueue: process.env.RABBITMQ_PUSH_QUEUE || 'push.queue',
    failedQueue: process.env.RABBITMQ_FAILED_QUEUE || 'failed.queue',
    reconnectDelay: parseInt(process.env.RABBITMQ_RECONNECT_DELAY || '5000', 10),
    maxReconnectAttempts: parseInt(process.env.RABBITMQ_MAX_RECONNECT_ATTEMPTS || '10', 10),
  };

  // Connect to RabbitMQ
  async function connect() {
    try {
      if (connection && connection.connection && connection.connection.serverProperties) {
        return connection;
      }

      fastify.log.info('Connecting to RabbitMQ...');
      connection = await amqp.connect(config.url);
      
      // Handle connection errors
      connection.on('error', (err) => {
        fastify.log.error('RabbitMQ connection error:', err);
        if (err.message !== 'Connection closing') {
          attemptReconnect();
        }
      });

      connection.on('close', () => {
        fastify.log.warn('RabbitMQ connection closed');
        attemptReconnect();
      });

      // Create channel
      channel = await connection.createChannel();
      
      // Setup exchanges and queues
      await setupQueues();
      
      fastify.log.info('RabbitMQ connection established successfully');
      return connection;
    } catch (error) {
      fastify.log.error('Failed to connect to RabbitMQ:', error);
      throw error;
    }
  }

  // Setup exchanges and queues
  async function setupQueues() {
    if (!channel) {
      throw new Error('RabbitMQ channel not available');
    }

    try {
      // Assert exchange
      await channel.assertExchange(config.exchange, config.exchangeType, { durable: true });
      
      // Assert queues with dead letter exchange
      const emailQueueOptions = {
        durable: true,
        arguments: {
          'x-dead-letter-exchange': '',
          'x-dead-letter-routing-key': config.failedQueue,
        },
      };
      
      const pushQueueOptions = {
        durable: true,
        arguments: {
          'x-dead-letter-exchange': '',
          'x-dead-letter-routing-key': config.failedQueue,
        },
      };
      
      const failedQueueOptions = {
        durable: true,
      };

      // Assert queues
      await channel.assertQueue(config.emailQueue, emailQueueOptions);
      await channel.assertQueue(config.pushQueue, pushQueueOptions);
      await channel.assertQueue(config.failedQueue, failedQueueOptions);
      
      // Bind queues to exchange
      await channel.bindQueue(config.emailQueue, config.exchange, config.emailQueue);
      await channel.bindQueue(config.pushQueue, config.exchange, config.pushQueue);
      
      fastify.log.info('RabbitMQ queues and exchange setup completed');
    } catch (error) {
      fastify.log.error('Failed to setup RabbitMQ queues:', error);
      throw error;
    }
  }

  // Reconnection logic
  let reconnectAttempts = 0;
  async function attemptReconnect() {
    if (reconnectAttempts >= config.maxReconnectAttempts) {
      fastify.log.error(`Max reconnection attempts (${config.maxReconnectAttempts}) reached. Giving up.`);
      return;
    }

    reconnectAttempts++;
    fastify.log.info(`Attempting to reconnect to RabbitMQ (attempt ${reconnectAttempts}/${config.maxReconnectAttempts})...`);
    
    setTimeout(async () => {
      try {
        connection = null;
        channel = null;
        await connect();
        reconnectAttempts = 0; // Reset counter on successful connection
      } catch (error) {
        fastify.log.error(`Reconnection attempt ${reconnectAttempts} failed:`, error);
        attemptReconnect();
      }
    }, config.reconnectDelay);
  }

  // Decorator to publish messages to queue
  fastify.decorate('publishToQueue', async (routingKey, message, options = {}) => {
    try {
      if (!channel) {
        throw new Error('RabbitMQ channel not available');
      }

      // Ensure correlation_id is included in the message
      const messageWithCorrelation = {
        ...message,
        correlation_id: message.correlation_id || options.correlationId || fastify.generateCorrelationId(),
        timestamp: new Date().toISOString(),
      };

      // Convert message to buffer
      const buffer = Buffer.from(JSON.stringify(messageWithCorrelation));
      
      // Default publish options
      const publishOptions = {
        persistent: true, // Make message persistent
        timestamp: Date.now(),
        ...options,
      };

      // Publish to exchange with routing key
      const published = channel.publish(config.exchange, routingKey, buffer, publishOptions);
      
      if (published) {
        fastify.log.debug(`Message published to ${routingKey} with correlation_id: ${messageWithCorrelation.correlation_id}`);
        return { success: true, correlation_id: messageWithCorrelation.correlation_id };
      } else {
        throw new Error('Failed to publish message to RabbitMQ');
      }
    } catch (error) {
      fastify.log.error('Error publishing message to RabbitMQ:', error);
      throw error;
    }
  });

  // Decorator to setup queues (can be called manually if needed)
  fastify.decorate('setupRabbitMQQueues', async () => {
    return await setupQueues();
  });

  // Decorator to check RabbitMQ connection status
  fastify.decorate('checkRabbitMQConnection', async () => {
    try {
      if (!connection || !channel) {
        return false;
      }
      
      // Check if connection is still open
      if (connection.connection && connection.connection.serverProperties) {
        return true;
      }
      
      return false;
    } catch (error) {
      fastify.log.error('Error checking RabbitMQ connection:', error);
      return false;
    }
  });

  // Decorator to close RabbitMQ connection
  fastify.decorate('closeRabbitMQConnection', async () => {
    try {
      if (channel) {
        await channel.close();
        channel = null;
      }
      
      if (connection) {
        await connection.close();
        connection = null;
      }
      
      fastify.log.info('RabbitMQ connection closed successfully');
      return true;
    } catch (error) {
      fastify.log.error('Error closing RabbitMQ connection:', error);
      return false;
    }
  });

  // Decorator to generate correlation ID
  fastify.decorate('generateCorrelationId', () => {
    return `corr_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  });

  // Add hook to connect to RabbitMQ on startup
  fastify.addHook('onReady', async () => {
    try {
      await connect();
    } catch (error) {
      fastify.log.error('Failed to connect to RabbitMQ during startup:', error);
      // Don't throw error to allow service to start without RabbitMQ
      // Services will handle RabbitMQ unavailability gracefully
    }
  });

  // Add hook to close connection on shutdown
  fastify.addHook('onClose', async () => {
    await fastify.closeRabbitMQConnection();
  });

  fastify.log.info('RabbitMQ plugin loaded successfully');
}

export default fp(rabbitmqPlugin, {
  name: 'rabbitmq',
});