/**
 * Service clients module
 * Exports all service client modules for easy importing
 */

// Export Consul client
export { ConsulClient, getConsulClient } from './consul.js';
export type {
  ServiceInstance,
  ServiceHealthResult,
  ServiceRegistrationConfig
} from './consul.js';

// Export RabbitMQ client
export { RabbitMQClient, getRabbitMQClient } from './queue.js';
export type {
  QueueMessage,
  PublishOptions,
  ConnectionStatus,
  QueueConfig
} from './queue.js';

// Import for default export
import { getConsulClient } from './consul.js';
import { getRabbitMQClient } from './queue.js';

// Default export for convenience
export default {
  consul: { getConsulClient },
  queue: { getRabbitMQClient },
};