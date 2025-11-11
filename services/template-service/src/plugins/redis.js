import fp from 'fastify-plugin';

/**
 * Fastify plugin to connect to Redis
 * @param {import('fastify').FastifyInstance} fastify
 */
async function redisPlugin(fastify, options) {
  try {
    // Register Redis connection
    await fastify.register(import('@fastify/redis'), {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      password: process.env.REDIS_PASSWORD || undefined,
      db: parseInt(process.env.REDIS_DB || '0', 10),
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });

    // Add a method to generate cache keys for templates
    fastify.decorate('getTemplateCacheKey', (templateCode, language = 'en') => {
      return `template:${templateCode}:${language}:latest`;
    });

    // Add a method to generate cache keys for specific template versions
    fastify.decorate('getTemplateVersionCacheKey', (templateCode, version, language = 'en') => {
      return `template:${templateCode}:${language}:${version}`;
    });

    // Add a method to cache templates with expiration
    fastify.decorate('cacheTemplate', async (key, template, ttlSeconds = 3600) => {
      try {
        await fastify.redis.setex(key, ttlSeconds, JSON.stringify(template));
        return true;
      } catch (error) {
        fastify.log.error('Error caching template:', error);
        return false;
      }
    });

    // Add a method to retrieve cached templates
    fastify.decorate('getCachedTemplate', async (key) => {
      try {
        const cached = await fastify.redis.get(key);
        return cached ? JSON.parse(cached) : null;
      } catch (error) {
        fastify.log.error('Error retrieving cached template:', error);
        return null;
      }
    });

    // Add a method to invalidate cache for a template
    fastify.decorate('invalidateTemplateCache', async (templateCode, language = 'en') => {
      try {
        // Delete the latest version cache
        await fastify.redis.del(fastify.getTemplateCacheKey(templateCode, language));
        
        // Find all version keys for this template and delete them
        const pattern = `template:${templateCode}:${language}:*`;
        const keys = await fastify.redis.keys(pattern);
        
        if (keys.length > 0) {
          await fastify.redis.del(keys);
        }
        
        return true;
      } catch (error) {
        fastify.log.error('Error invalidating template cache:', error);
        return false;
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