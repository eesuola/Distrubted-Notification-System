import fp from 'fastify-plugin';
import { redis_config } from '../config.js';

/**
 * Fastify plugin to connect to Redis for API Gateway
 * Provides idempotency and caching functionality
 * @param {import('fastify').FastifyInstance} fastify
 */
async function redisPlugin(fastify, options) {
  try {
    // Register Redis connection
    await fastify.register(import('@fastify/redis'), {
      host: redis_config.host,
      port: redis_config.port,
      password: redis_config.password,
      db: redis_config.db,
      retryDelayOnFailover: redis_config.retry_delay_on_failover,
      maxRetriesPerRequest: redis_config.max_retries_per_request,
      lazyConnect: redis_config.lazy_connect,
      connectTimeout: redis_config.connect_timeout,
      commandTimeout: redis_config.command_timeout,
    });

    // Default TTL for cached responses
    const DEFAULT_TTL = redis_config.default_ttl;

    // Add a method to generate idempotency keys
    fastify.decorate('getIdempotencyKey', (requestId) => {
      return `idempotency:${requestId}`;
    });

    // Add a method to generate general cache keys
    fastify.decorate('getCacheKey', (key) => {
      return `cache:${key}`;
    });

    // Decorator to check if request has already been processed (idempotency)
    fastify.decorate('checkIdempotency', async (requestId) => {
      try {
        const key = fastify.getIdempotencyKey(requestId);
        const cached = await fastify.redis.get(key);
        return cached ? JSON.parse(cached) : null;
      } catch (error) {
        fastify.log.error('Error checking idempotency:', error);
        return null;
      }
    });

    // Decorator to store response for idempotency
    fastify.decorate('storeIdempotency', async (requestId, response, ttl = DEFAULT_TTL) => {
      try {
        const key = fastify.getIdempotencyKey(requestId);
        await fastify.redis.setex(key, ttl, JSON.stringify(response));
        return true;
      } catch (error) {
        fastify.log.error('Error storing idempotency:', error);
        return false;
      }
    });

    // Decorator for general response caching
    fastify.decorate('cacheResponse', async (key, data, ttl = DEFAULT_TTL) => {
      try {
        const cacheKey = fastify.getCacheKey(key);
        await fastify.redis.setex(cacheKey, ttl, JSON.stringify(data));
        return true;
      } catch (error) {
        fastify.log.error('Error caching response:', error);
        return false;
      }
    });

    // Decorator to retrieve cached data
    fastify.decorate('getCachedResponse', async (key) => {
      try {
        const cacheKey = fastify.getCacheKey(key);
        const cached = await fastify.redis.get(cacheKey);
        return cached ? JSON.parse(cached) : null;
      } catch (error) {
        fastify.log.error('Error retrieving cached response:', error);
        return null;
      }
    });

    // Decorator to invalidate cache
    fastify.decorate('invalidateCache', async (key) => {
      try {
        const cacheKey = fastify.getCacheKey(key);
        await fastify.redis.del(cacheKey);
        return true;
      } catch (error) {
        fastify.log.error('Error invalidating cache:', error);
        return false;
      }
    });

    // Decorator to invalidate cache by pattern
    fastify.decorate('invalidateCachePattern', async (pattern) => {
      try {
        const fullPattern = fastify.getCacheKey(pattern);
        const keys = await fastify.redis.keys(`${fullPattern}*`);
        
        if (keys.length > 0) {
          await fastify.redis.del(keys);
        }
        
        return true;
      } catch (error) {
        fastify.log.error('Error invalidating cache pattern:', error);
        return false;
      }
    });

    // Decorator to generate notification status key
    fastify.decorate('getNotificationStatusKey', (notificationId) => {
      return `notification_status:${notificationId}`;
    });

    // Decorator to store notification status
    fastify.decorate('storeNotificationStatus', async (notificationId, statusData, ttl = redis_config.notification_status_ttl) => {
      try {
        const key = fastify.getNotificationStatusKey(notificationId);
        await fastify.redis.setex(key, ttl, JSON.stringify(statusData));
        return true;
      } catch (error) {
        fastify.log.error('Error storing notification status:', error);
        return false;
      }
    });

    // Decorator to retrieve notification status
    fastify.decorate('getNotificationStatus', async (notificationId) => {
      try {
        const key = fastify.getNotificationStatusKey(notificationId);
        const cached = await fastify.redis.get(key);
        return cached ? JSON.parse(cached) : null;
      } catch (error) {
        fastify.log.error('Error retrieving notification status:', error);
        return null;
      }
    });

    // Decorator to check Redis connection status
    fastify.decorate('checkRedisConnection', async () => {
      try {
        await fastify.redis.ping();
        return true;
      } catch (error) {
        fastify.log.error('Redis connection check failed:', error);
        return false;
      }
    });

    // Add hook to check Redis connection on startup
    fastify.addHook('onReady', async () => {
      try {
        await fastify.redis.ping();
        fastify.log.info('Redis connection established successfully');
      } catch (error) {
        fastify.log.error('Failed to connect to Redis:', error);
        // Don't throw error to allow service to start without Redis
        // Services will handle Redis unavailability gracefully
      }
    });

    fastify.log.info('Redis plugin loaded successfully');
  } catch (error) {
    fastify.log.error('Failed to load Redis plugin:', error);
    throw error;
  }
}

export default fp(redisPlugin, {
  name: 'redis',
});