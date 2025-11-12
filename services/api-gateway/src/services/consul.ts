/**
 * Consul service client for service discovery
 * Provides methods to interact with Consul for service registration and discovery
 */

import * as consul from 'consul';
import { consul_config, service_config } from '../config.js';

// Service instance interface
export interface ServiceInstance {
  id: string;
  name: string;
  address: string;
  port: number;
  url: string;
  health: string;
  metadata: Record<string, string>;
}

// Service health check result interface
export interface ServiceHealthResult {
  healthy: boolean;
  totalInstances: number;
  healthyInstances: number;
  instances: Array<{
    id: string;
    address: string;
    port: number;
    status: Array<{ name: string; status: string }>;
  }>;
}

// Service registration configuration interface
export interface ServiceRegistrationConfig {
  name: string;
  port: number;
  address?: string;
  id?: string;
  tags?: string[];
  meta?: Record<string, string>;
  check?: {
    http?: string;
    tcp?: string;
    interval?: string;
    timeout?: string;
    deregister_critical_service_after?: string;
  };
}

/**
 * Consul client class for service discovery
 */
export class ConsulClient {
  private client: consul.Consul;
  private logger: any;

  constructor(logger?: any) {
    this.client = consul({
      host: consul_config.host,
      port: consul_config.port,
      promisify: true,
    });
    this.logger = logger || console;
  }

  /**
   * Get service URL from Consul
   * @param serviceName - Name of the service to discover
   * @returns Promise resolving to the service URL
   * @throws Error if service is not found
   */
  async getServiceUrl(serviceName: string): Promise<string> {
    try {
      const services = await this.client.catalog.service.nodes(serviceName);
      
      if (!services || services.length === 0) {
        throw new Error(`Service ${serviceName} not found in Consul`);
      }

      // Filter for healthy services only
      const healthyServices = services.filter((service: any) => {
        // Check if service has passing health checks
        return service.ServiceMeta?.health !== 'unhealthy';
      });

      if (healthyServices.length === 0) {
        throw new Error(`No healthy instances of service ${serviceName} found in Consul`);
      }

      // Return the first available healthy service instance
      const service = healthyServices[0];
      const protocol = service.ServiceMeta?.protocol || 'http';
      const port = service.ServicePort;
      const address = service.ServiceAddress || service.Address;

      return `${protocol}://${address}:${port}`;
    } catch (error) {
      this.logger.error(`Error getting service URL for ${serviceName}:`, error);
      throw error;
    }
  }

  /**
   * Get all service instances from Consul
   * @param serviceName - Name of the service to discover
   * @returns Promise resolving to array of service instances
   */
  async getAllServiceInstances(serviceName: string): Promise<ServiceInstance[]> {
    try {
      const services = await this.client.catalog.service.nodes(serviceName);
      
      if (!services || services.length === 0) {
        return [];
      }

      return services.map((service: any) => {
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
      this.logger.error(`Error getting service instances for ${serviceName}:`, error);
      throw error;
    }
  }

  /**
   * Register service with Consul
   * @param serviceConfig - Service configuration
   * @returns Promise resolving to true if registration successful
   */
  async registerService(serviceConfig: ServiceRegistrationConfig): Promise<boolean> {
    try {
      const defaultConfig = {
        id: `${serviceConfig.name}-${(globalThis as any).process?.env?.HOSTNAME || 'local'}-${serviceConfig.port}`,
        name: serviceConfig.name,
        address: service_config.host,
        port: serviceConfig.port,
        check: {
          http: `http://${service_config.host}:${serviceConfig.port}/health`,
          interval: consul_config.health_check_interval,
          timeout: consul_config.health_check_timeout,
          deregistercriticalserviceafter: consul_config.deregister_critical_service_after,
        },
      };

      const config = { ...defaultConfig, ...serviceConfig };
      await this.client.agent.service.register(config);
      
      this.logger.info(`Service ${config.name} registered with Consul`);
      return true;
    } catch (error) {
      this.logger.error(`Error registering service with Consul:`, error);
      throw error;
    }
  }

  /**
   * Deregister service from Consul
   * @param serviceId - ID of the service to deregister
   * @returns Promise resolving to true if deregistration successful
   */
  async deregisterService(serviceId: string): Promise<boolean> {
    try {
      await this.client.agent.service.deregister(serviceId);
      this.logger.info(`Service ${serviceId} deregistered from Consul`);
      return true;
    } catch (error) {
      this.logger.error(`Error deregistering service from Consul:`, error);
      throw error;
    }
  }

  /**
   * Check service health
   * @param serviceName - Name of the service to check
   * @returns Promise resolving to service health information
   */
  async checkServiceHealth(serviceName: string): Promise<ServiceHealthResult> {
    try {
      const checks = await this.client.health.service(serviceName);
      
      if (!checks || checks.length === 0) {
        return { healthy: false, totalInstances: 0, healthyInstances: 0, instances: [] };
      }

      const healthyChecks = checks.filter((check: any) =>
        check.Checks.every((c: any) => c.Status === 'passing')
      );

      return {
        healthy: healthyChecks.length > 0,
        totalInstances: checks.length,
        healthyInstances: healthyChecks.length,
        instances: checks.map((check: any) => ({
          id: check.Node.Service.ID,
          address: check.Node.Service.Address,
          port: check.Node.Service.Port,
          status: check.Checks.map((c: any) => ({ name: c.Name, status: c.Status })),
        })),
      };
    } catch (error) {
      this.logger.error(`Error checking service health for ${serviceName}:`, error);
      throw error;
    }
  }

  /**
   * Get the raw Consul client for advanced operations
   * @returns The underlying Consul client
   */
  getRawClient(): consul.Consul {
    return this.client;
  }
}

// Create and export a singleton instance
let consulClientInstance: ConsulClient | null = null;

/**
 * Get or create a Consul client instance
 * @param logger - Optional logger instance
 * @returns Consul client instance
 */
export function getConsulClient(logger?: any): ConsulClient {
  if (!consulClientInstance) {
    consulClientInstance = new ConsulClient(logger);
  }
  return consulClientInstance;
}

// Export default
export default getConsulClient;