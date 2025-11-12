import consul from 'consul';
import { consul_config, service_config, service_names } from '../config.js';

// Consul plugin for service discovery
async function consulPlugin(fastify, options) {
  // Initialize Consul client
  const consulClient = consul({
    host: consul_config.host,
    port: consul_config.port,
    promisify: true,
  });

  // Decorate fastify instance with consul client
  fastify.decorate('consul', consulClient);

  // Service discovery methods
  const serviceDiscovery = {
    // Get service URL from Consul
    async getServiceUrl(serviceName) {
      try {
        const services = await consulClient.catalog.service.nodes(serviceName);
        
        if (!services || services.length === 0) {
          throw new Error(`Service ${serviceName} not found in Consul`);
        }

        // Return the first available service instance
        const service = services[0];
        const protocol = service.ServiceMeta?.protocol || 'http';
        const port = service.ServicePort;
        const address = service.ServiceAddress || service.Address;

        return `${protocol}://${address}:${port}`;
      } catch (error) {
        fastify.log.error(`Error getting service URL for ${serviceName}:`, error);
        throw error;
      }
    },

    // Get all service instances
    async getAllServiceInstances(serviceName) {
      try {
        const services = await consulClient.catalog.service.nodes(serviceName);
        
        if (!services || services.length === 0) {
          return [];
        }

        return services.map(service => {
          const protocol = service.ServiceMeta?.protocol || 'http';
          const port = service.ServicePort;
          const address = service.ServiceAddress || service.Address;

          return {
            id: service.ServiceID,
            name: service.ServiceName,
            address: service.ServiceAddress || service.Address,
            port: service.ServicePort,
            url: `${protocol}://${address}:${port}`,
            health: service.ServiceMeta?.health || 'unknown',
            metadata: service.ServiceMeta || {},
          };
        });
      } catch (error) {
        fastify.log.error(`Error getting service instances for ${serviceName}:`, error);
        throw error;
      }
    },

    // Register service with Consul
    async registerService(serviceConfig) {
      try {
        const defaultConfig = {
          id: `${serviceConfig.name}-${process.env.HOSTNAME || 'local'}-${serviceConfig.port}`,
          name: serviceConfig.name,
          address: service_config.host,
          port: serviceConfig.port,
          check: {
            http: `http://${service_config.host}:${serviceConfig.port}/health`,
            interval: consul_config.health_check_interval,
            timeout: consul_config.health_check_timeout,
          },
        };

        const config = { ...defaultConfig, ...serviceConfig };
        await consulClient.agent.service.register(config);
        
        fastify.log.info(`Service ${config.name} registered with Consul`);
        return true;
      } catch (error) {
        fastify.log.error(`Error registering service with Consul:`, error);
        throw error;
      }
    },

    // Deregister service from Consul
    async deregisterService(serviceId) {
      try {
        await consulClient.agent.service.deregister(serviceId);
        fastify.log.info(`Service ${serviceId} deregistered from Consul`);
        return true;
      } catch (error) {
        fastify.log.error(`Error deregistering service from Consul:`, error);
        throw error;
      }
    },

    // Check service health
    async checkServiceHealth(serviceName) {
      try {
        const checks = await consulClient.health.service(serviceName);
        
        if (!checks || checks.length === 0) {
          return { healthy: false, message: 'Service not found' };
        }

        const healthyChecks = checks.filter(check => 
          check.Checks.every(c => c.Status === 'passing')
        );

        return {
          healthy: healthyChecks.length > 0,
          totalInstances: checks.length,
          healthyInstances: healthyChecks.length,
          instances: checks.map(check => ({
            id: check.Node.Service.ID,
            address: check.Node.Service.Address,
            port: check.Node.Service.Port,
            status: check.Checks.map(c => ({ name: c.Name, status: c.Status })),
          })),
        };
      } catch (error) {
        fastify.log.error(`Error checking service health for ${serviceName}:`, error);
        throw error;
      }
    },
  };

  // Decorate fastify instance with service discovery methods
  fastify.decorate('serviceDiscovery', serviceDiscovery);

  // Register API Gateway service with Consul on startup
  fastify.addHook('onReady', async () => {
    try {
      await serviceDiscovery.registerService({
        name: service_names.api_gateway,
        port: service_config.port,
        meta: {
          protocol: 'http',
          version: service_config.version,
          description: 'API Gateway for distributed notification system',
        },
      });
    } catch (error) {
      fastify.log.warn('Failed to register with Consul:', error.message);
    }
  });

  // Deregister service on shutdown
  fastify.addHook('onClose', async () => {
    const serviceId = `${service_names.api_gateway}-${process.env.HOSTNAME || 'local'}-${service_config.port}`;
    
    try {
      await serviceDiscovery.deregisterService(serviceId);
    } catch (error) {
      fastify.log.warn('Failed to deregister from Consul:', error.message);
    }
  });
}

// Export plugin with Fastify plugin metadata
export default consulPlugin;
export const autoConfig = {};