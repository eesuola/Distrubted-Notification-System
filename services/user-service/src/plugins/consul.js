import fp from 'fastify-plugin';
import consul from 'consul';
import { randomUUID } from 'crypto';
import os from 'os';

/**
 * Fastify plugin for Consul service registration
 * @param {import('fastify').FastifyInstance} fastify
 */
async function consulPlugin(fastify, options) {
  // Get Consul configuration from environment variables
  const consulHost = process.env.CONSUL_HOST || 'localhost';
  const consulPort = parseInt(process.env.CONSUL_PORT || '8500', 10);
  const servicePort = parseInt(process.env.PORT || '3001', 10);
  const serviceName = 'user-service';
  
  // Generate unique service ID using hostname and random UUID
  const hostname = os.hostname();
  const instanceId = randomUUID();
  const serviceId = `${serviceName}-${hostname}-${instanceId}`;
  
  // Initialize Consul client
  const consulClient = consul({
    host: consulHost,
    port: consulPort,
    promisify: true,
  });
  
  // Service registration configuration
  const serviceConfig = {
    name: serviceName,
    id: serviceId,
    address: process.env.HOST || 'localhost',
    port: servicePort,
    tags: ['user-service', 'api'],
    check: {
      http: `http://${process.env.HOST || 'localhost'}:${servicePort}/health`,
      interval: '10s',
      timeout: '5s',
      deregistercriticalserviceafter: '30s',
    },
  };
  
  // Register service with Consul
  const register = async () => {
    try {
      await consulClient.agent.service.register(serviceConfig);
      fastify.log.info({
        service_name: serviceName,
        service_id: serviceId,
        consul_host: consulHost,
        consul_port: consulPort,
        service_port: servicePort,
      }, 'Service registered with Consul');
    } catch (error) {
      fastify.log.error({
        err: error,
        service_name: serviceName,
        service_id: serviceId,
        consul_host: consulHost,
        consul_port: consulPort,
      }, 'Failed to register service with Consul');
      throw error;
    }
  };
  
  // Deregister service from Consul
  const deregister = async () => {
    try {
      await consulClient.agent.service.deregister(serviceId);
      fastify.log.info({
        service_name: serviceName,
        service_id: serviceId,
      }, 'Service deregistered from Consul');
    } catch (error) {
      fastify.log.error({
        err: error,
        service_name: serviceName,
        service_id: serviceId,
      }, 'Failed to deregister service from Consul');
      // Don't throw error here as we want to continue with shutdown
    }
  };
  
  // Register service on startup
  try {
    await register();
  } catch (error) {
    fastify.log.error('Failed to initialize Consul service registration');
    // Continue without failing the service startup
  }
  
  // Decorate Fastify instance with Consul client and methods
  fastify.decorate('consul', consulClient);
  fastify.decorate('consulRegister', register);
  fastify.decorate('consulDeregister', deregister);
  
  // Graceful shutdown - deregister service
  fastify.addHook('onClose', async (instance) => {
    await deregister();
  });
}

export default fp(consulPlugin, {
  name: 'consul',
});