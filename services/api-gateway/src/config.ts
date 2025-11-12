/**
 * Configuration module for API Gateway service
 * Centralizes all environment variables and service configuration
 */

// Service configuration
export const service_config = {
  name: process.env.SERVICE_NAME || 'api-gateway',
  host: process.env.HOST || '0.0.0.0',
  port: parseInt(process.env.PORT || '3000', 10),
  version: process.env.SERVICE_VERSION || '1.0.0',
  environment: process.env.NODE_ENV || 'development',
};

// Service names for service discovery
export const service_names = {
  api_gateway: process.env.API_GATEWAY_SERVICE_NAME || 'api-gateway',
  user_service: process.env.USER_SERVICE_NAME || 'user-service',
  email_service: process.env.EMAIL_SERVICE_NAME || 'email-service',
  push_service: process.env.PUSH_SERVICE_NAME || 'push-service',
  template_service: process.env.TEMPLATE_SERVICE_NAME || 'template-service',
};

// RabbitMQ configuration
export const rabbitmq_config = {
  url: process.env.RABBITMQ_URL || 'amqp://localhost:5672',
  exchange: process.env.RABBITMQ_EXCHANGE || 'notifications.direct',
  exchange_type: process.env.RABBITMQ_EXCHANGE_TYPE || 'direct',
  
  // Queue names
  email_queue: process.env.RABBITMQ_EMAIL_QUEUE || 'email.queue',
  push_queue: process.env.RABBITMQ_PUSH_QUEUE || 'push.queue',
  failed_queue: process.env.RABBITMQ_FAILED_QUEUE || 'failed.queue',
  
  // Connection settings
  reconnect_delay: parseInt(process.env.RABBITMQ_RECONNECT_DELAY || '5000', 10),
  max_reconnect_attempts: parseInt(process.env.RABBITMQ_MAX_RECONNECT_ATTEMPTS || '10', 10),
  connection_timeout: parseInt(process.env.RABBITMQ_CONNECTION_TIMEOUT || '30000', 10),
  heartbeat: parseInt(process.env.RABBITMQ_HEARTBEAT || '60', 10),
};

// Redis configuration
export const redis_config = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD || undefined,
  db: parseInt(process.env.REDIS_DB || '0', 10),
  
  // Connection settings
  retry_delay_on_failover: parseInt(process.env.REDIS_RETRY_DELAY_ON_FAILOVER || '100', 10),
  max_retries_per_request: parseInt(process.env.REDIS_MAX_RETRIES_PER_REQUEST || '3', 10),
  lazy_connect: process.env.REDIS_LAZY_CONNECT !== 'false',
  connect_timeout: parseInt(process.env.REDIS_CONNECT_TIMEOUT || '10000', 10),
  command_timeout: parseInt(process.env.REDIS_COMMAND_TIMEOUT || '5000', 10),
  
  // Cache settings
  default_ttl: parseInt(process.env.REDIS_DEFAULT_TTL || '86400', 10), // 24 hours in seconds
  notification_status_ttl: parseInt(process.env.REDIS_NOTIFICATION_STATUS_TTL || '604800', 10), // 7 days in seconds
};

// Consul configuration
export const consul_config = {
  host: process.env.CONSUL_HOST || 'localhost',
  port: parseInt(process.env.CONSUL_PORT || '8500', 10),
  
  // Service registration settings
  health_check_interval: process.env.CONSUL_HEALTH_CHECK_INTERVAL || '10s',
  health_check_timeout: process.env.CONSUL_HEALTH_CHECK_TIMEOUT || '5s',
  deregister_critical_service_after: process.env.CONSUL_DEREGISTER_CRITICAL_SERVICE_AFTER || '30s',
  
  // Service discovery settings
  service_query_timeout: parseInt(process.env.CONSUL_SERVICE_QUERY_TIMEOUT || '5000', 10),
  max_service_query_retries: parseInt(process.env.CONSUL_MAX_SERVICE_QUERY_RETRIES || '3', 10),
};

// JWT configuration
export const jwt_config = {
  secret: process.env.JWT_SECRET || 'your-secret-key',
  algorithm: process.env.JWT_ALGORITHM || 'HS256',
  expires_in: process.env.JWT_EXPIRES_IN || '24h',
  refresh_expires_in: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
};

// Rate limiting configuration
export const rate_limit_config = {
  max_requests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
  time_window: parseInt(process.env.RATE_LIMIT_TIME_WINDOW || '60', 10), // seconds
  skip_successful_requests: process.env.RATE_LIMIT_SKIP_SUCCESSFUL_REQUESTS !== 'false',
  skip_failed_requests: process.env.RATE_LIMIT_SKIP_FAILED_REQUESTS !== 'false',
};

// Circuit breaker configuration
export const circuit_breaker_config = {
  timeout: parseInt(process.env.CIRCUIT_BREAKER_TIMEOUT || '30000', 10), // 30 seconds
  error_threshold_percentage: parseFloat(process.env.CIRCUIT_BREAKER_ERROR_THRESHOLD || '50.0'), // 50%
  reset_timeout: parseInt(process.env.CIRCUIT_BREAKER_RESET_TIMEOUT || '60000', 10), // 1 minute
  monitoring_period: parseInt(process.env.CIRCUIT_BREAKER_MONITORING_PERIOD || '10000', 10), // 10 seconds
  minimum_requests: parseInt(process.env.CIRCUIT_BREAKER_MINIMUM_REQUESTS || '10', 10),
};

// Logging configuration
export const logging_config = {
  level: process.env.LOG_LEVEL || 'info',
  pretty_print: process.env.LOG_PRETTY_PRINT === 'true',
  include_timestamp: process.env.LOG_INCLUDE_TIMESTAMP !== 'false',
  include_hostname: process.env.LOG_INCLUDE_HOSTNAME !== 'false',
  include_pid: process.env.LOG_INCLUDE_PID !== 'false',
};

// API configuration
export const api_config = {
  prefix: process.env.API_PREFIX || '/api/v1',
  documentation_enabled: process.env.API_DOCUMENTATION_ENABLED !== 'false',
  documentation_path: process.env.API_DOCUMENTATION_PATH || '/documentation',
  cors_enabled: process.env.CORS_ENABLED !== 'false',
  cors_origin: process.env.CORS_ORIGIN || '*',
};

// Notification configuration
export const notification_config = {
  max_retries: parseInt(process.env.NOTIFICATION_MAX_RETRIES || '3', 10),
  retry_delay: parseInt(process.env.NOTIFICATION_RETRY_DELAY || '5000', 10), // 5 seconds
  max_batch_size: parseInt(process.env.NOTIFICATION_MAX_BATCH_SIZE || '100', 10),
  default_priority: parseInt(process.env.NOTIFICATION_DEFAULT_PRIORITY || '5', 10),
  idempotency_ttl: parseInt(process.env.NOTIFICATION_IDEMPOTENCY_TTL || '86400', 10), // 24 hours
};

// Export all configuration as a single object for convenience
export const config = {
  service: service_config,
  services: service_names,
  rabbitmq: rabbitmq_config,
  redis: redis_config,
  consul: consul_config,
  jwt: jwt_config,
  rate_limit: rate_limit_config,
  circuit_breaker: circuit_breaker_config,
  logging: logging_config,
  api: api_config,
  notification: notification_config,
};

// Export default configuration
export default config;