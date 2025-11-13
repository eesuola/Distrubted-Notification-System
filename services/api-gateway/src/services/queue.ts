/**
 * RabbitMQ service client for message queue operations
 * Provides methods to connect to RabbitMQ and publish messages
 */

import * as amqp from 'amqplib';
import { rabbitmq_config } from '../config.js';

// Message interface for publishing to queue
export interface QueueMessage {
  [key: string]: any;
  correlation_id?: string;
  timestamp?: string;
}

// Publish options interface
export interface PublishOptions {
  persistent?: boolean;
  expiration?: string;
  userId?: string;
  CC?: string[];
  BCC?: string[];
  priority?: number;
  deliveryMode?: number;
  messageId?: string;
  timestamp?: number;
  type?: string;
  appId?: string;
  correlationId?: string;
}

// Connection status interface
export interface ConnectionStatus {
  connected: boolean;
  connectionTime?: Date;
  lastError?: Error;
  reconnectAttempts: number;
}

// Queue configuration interface
export interface QueueConfig {
  url: string;
  exchange: string;
  exchangeType: string;
  emailQueue: string;
  pushQueue: string;
  failedQueue: string;
  reconnectDelay: number;
  maxReconnectAttempts: number;
  connectionTimeout: number;
  heartbeat: number;
}

/**
 * RabbitMQ client class for message queue operations
 */
export class RabbitMQClient {
  private connection: amqp.Connection | null = null;
  private channel: amqp.Channel | null = null;
  private config: QueueConfig;
  private logger: any;
  private reconnectAttempts: number = 0;
  private reconnectTimer: any = null;
  private isConnecting: boolean = false;
  private connectionTime: Date | null = null;

  constructor(logger?: any) {
    this.config = {
      url: rabbitmq_config.url,
      exchange: rabbitmq_config.exchange,
      exchangeType: rabbitmq_config.exchange_type,
      emailQueue: rabbitmq_config.email_queue,
      pushQueue: rabbitmq_config.push_queue,
      failedQueue: rabbitmq_config.failed_queue,
      reconnectDelay: rabbitmq_config.reconnect_delay,
      maxReconnectAttempts: rabbitmq_config.max_reconnect_attempts,
      connectionTimeout: rabbitmq_config.connection_timeout,
      heartbeat: rabbitmq_config.heartbeat,
    };
    this.logger = logger || console;
  }

  /**
   * Connect to RabbitMQ server
   * @returns Promise resolving to connection object
   */
  async connect(): Promise<amqp.Connection> {
    if (this.isConnecting) {
      // Wait for existing connection attempt to complete
      return new Promise((resolve, reject) => {
        const checkConnection = () => {
          if (!this.isConnecting) {
            if (this.connection) {
              resolve(this.connection);
            } else {
              reject(new Error('Connection failed'));
            }
          } else {
            setTimeout(checkConnection, 100);
          }
        };
        checkConnection();
      });
    }

    if (this.connection) {
      return this.connection;
    }

    this.isConnecting = true;

    try {
      this.logger.info('Connecting to RabbitMQ...');
      
      // Create connection with timeout
      const connectionPromise = amqp.connect(this.config.url, {
        timeout: this.config.connectionTimeout,
        heartbeat: this.config.heartbeat,
      });

      // Add timeout to connection promise
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Connection timeout')), this.config.connectionTimeout);
      });

      this.connection = (await Promise.race([connectionPromise, timeoutPromise])) as unknown as amqp.Connection;
      
      // Reset reconnect attempts on successful connection
      this.reconnectAttempts = 0;
      this.connectionTime = new Date();

      // Handle connection errors
      if (this.connection) {
        this.connection.on('error', (err: any) => {
          this.logger.error('RabbitMQ connection error:', err);
          if (err.message !== 'Connection closing') {
            this.attemptReconnect();
          }
        });

        this.connection.on('close', () => {
          this.logger.warn('RabbitMQ connection closed');
          this.attemptReconnect();
        });

        // Create channel
        this.channel = await (this.connection as any).createChannel();
      }
      
      // Setup exchanges and queues
      await this.setupQueues();
      
      this.logger.info('RabbitMQ connection established successfully');
      this.isConnecting = false;
      
      if (!this.connection) {
        throw new Error('Failed to establish RabbitMQ connection');
      }
      
      return this.connection;
    } catch (error) {
      this.logger.error('Failed to connect to RabbitMQ:', error);
      this.isConnecting = false;
      throw error;
    }
  }

  /**
   * Setup exchanges and queues
   */
  private async setupQueues(): Promise<void> {
    if (!this.channel) {
      throw new Error('RabbitMQ channel not available');
    }

    try {
      // Assert exchange
      await this.channel.assertExchange(this.config.exchange, this.config.exchangeType, { durable: true });
      
      // Assert queues with dead letter exchange
      const emailQueueOptions = {
        durable: true,
        arguments: {
          'x-dead-letter-exchange': '',
          'x-dead-letter-routing-key': this.config.failedQueue,
        },
      };
      
      const pushQueueOptions = {
        durable: true,
        arguments: {
          'x-dead-letter-exchange': '',
          'x-dead-letter-routing-key': this.config.failedQueue,
        },
      };
      
      const failedQueueOptions = {
        durable: true,
      };

      // Assert queues
      await this.channel.assertQueue(this.config.emailQueue, emailQueueOptions);
      await this.channel.assertQueue(this.config.pushQueue, pushQueueOptions);
      await this.channel.assertQueue(this.config.failedQueue, failedQueueOptions);
      
      // Bind queues to exchange
      await this.channel.bindQueue(this.config.emailQueue, this.config.exchange, this.config.emailQueue);
      await this.channel.bindQueue(this.config.pushQueue, this.config.exchange, this.config.pushQueue);
      
      this.logger.info('RabbitMQ queues and exchange setup completed');
    } catch (error) {
      this.logger.error('Failed to setup RabbitMQ queues:', error);
      throw error;
    }
  }

  /**
   * Attempt to reconnect to RabbitMQ
   */
  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
      this.logger.error(`Max reconnection attempts (${this.config.maxReconnectAttempts}) reached. Giving up.`);
      return;
    }

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    this.reconnectAttempts++;
    this.logger.info(`Attempting to reconnect to RabbitMQ (attempt ${this.reconnectAttempts}/${this.config.maxReconnectAttempts})...`);
    
    this.reconnectTimer = setTimeout(async () => {
      try {
        this.connection = null;
        this.channel = null;
        await this.connect();
        this.reconnectAttempts = 0; // Reset counter on successful connection
      } catch (error) {
        this.logger.error(`Reconnection attempt ${this.reconnectAttempts} failed:`, error);
        this.attemptReconnect();
      }
    }, this.config.reconnectDelay);
  }

  /**
   * Publish message to queue
   * @param routingKey - Routing key for the message
   * @param message - Message object to publish
   * @param options - Publish options
   * @returns Promise resolving to publish result
   */
  async publishToQueue(routingKey: string, message: QueueMessage, options: PublishOptions = {}): Promise<{ success: boolean; correlation_id: string }> {
    try {
      if (!this.channel) {
        throw new Error('RabbitMQ channel not available');
      }

      // Ensure correlation_id is included in the message
      const correlationId = message.correlation_id || options.correlationId || this.generateCorrelationId();
      const messageWithCorrelation = {
        ...message,
        correlation_id: correlationId,
        timestamp: message.timestamp || new Date().toISOString(),
      };

      // Convert message to buffer
      const buffer = (globalThis as any).Buffer.from(JSON.stringify(messageWithCorrelation));
      
      // Default publish options
      const publishOptions: PublishOptions = {
        persistent: true, // Make message persistent
        timestamp: Date.now(),
        ...options,
      };

      // Publish to exchange with routing key
      const published = this.channel.publish(this.config.exchange, routingKey, buffer, publishOptions);
      
      if (published) {
        this.logger.debug(`Message published to ${routingKey} with correlation_id: ${correlationId}`);
        return { success: true, correlation_id: correlationId };
      } else {
        throw new Error('Failed to publish message to RabbitMQ');
      }
    } catch (error) {
      this.logger.error('Error publishing message to RabbitMQ:', error);
      throw error;
    }
  }

  /**
   * Check RabbitMQ connection status
   * @returns Connection status object
   */
  getConnectionStatus(): ConnectionStatus {
    return {
      connected: !!(this.connection),
      connectionTime: this.connectionTime || undefined,
      reconnectAttempts: this.reconnectAttempts,
    } as ConnectionStatus;
  }

  /**
   * Generate correlation ID
   * @returns Generated correlation ID
   */
  generateCorrelationId(): string {
    return `corr_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Close RabbitMQ connection
   * @returns Promise resolving to true if connection closed successfully
   */
  async closeConnection(): Promise<boolean> {
    try {
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }

      if (this.channel) {
        await this.channel.close();
        this.channel = null;
      }
      
      if (this.connection) {
        // Cast to any to access the close method which exists but isn't in the type definition
        await (this.connection as any).close();
        this.connection = null;
      }
      
      this.logger.info('RabbitMQ connection closed successfully');
      return true;
    } catch (error) {
      this.logger.error('Error closing RabbitMQ connection:', error);
      return false;
    }
  }

  /**
   * Get the raw channel for advanced operations
   * @returns The underlying RabbitMQ channel
   */
  getChannel(): amqp.Channel | null {
    return this.channel;
  }

  /**
   * Get the raw connection for advanced operations
   * @returns The underlying RabbitMQ connection
   */
  getConnection(): amqp.Connection | null {
    return this.connection;
  }
}

// Create and export a singleton instance
let rabbitMQClientInstance: RabbitMQClient | null = null;

/**
 * Get or create a RabbitMQ client instance
 * @param logger - Optional logger instance
 * @returns RabbitMQ client instance
 */
export function getRabbitMQClient(logger?: any): RabbitMQClient {
  if (!rabbitMQClientInstance) {
    rabbitMQClientInstance = new RabbitMQClient(logger);
  }
  return rabbitMQClientInstance;
}

// Export default
export default getRabbitMQClient;