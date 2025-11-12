import Fastify from 'fastify';
import consul from 'consul';
import { randomUUID } from 'crypto';
import os from 'os';

/**
 * Test script to verify Consul integration for User Service
 * 
 * This script tests:
 * 1. Consul plugin registration
 * 2. Service registration with Consul
 * 3. Service discovery (querying Consul for the registered service)
 * 4. Service deregistration
 * 
 * Prerequisites:
 * - Consul must be running on localhost:8500 (or set CONSUL_HOST and CONSUL_PORT env vars)
 * - Node.js 20+ with ES modules support
 * 
 * Environment variables:
 * - CONSUL_HOST: Consul server host (default: localhost)
 * - CONSUL_PORT: Consul server port (default: 8500)
 * - HOST: Service host address (default: localhost)
 * - PORT: Service port (default: 3001)
 * 
 * How to run:
 * cd services/user-service
 * node test-consul.js
 * 
 * Or using npm script:
 * npm run test:consul
 */

// Configuration from environment variables
const config = {
  consulHost: process.env.CONSUL_HOST || 'localhost',
  consulPort: parseInt(process.env.CONSUL_PORT || '8500', 10),
  serviceHost: process.env.HOST || 'localhost',
  servicePort: parseInt(process.env.PORT || '3001', 10),
  serviceName: 'user-service-test',
};

// Generate unique service ID for testing
const hostname = os.hostname();
const instanceId = randomUUID();
const serviceId = `${config.serviceName}-${hostname}-${instanceId}`;

// Initialize Consul client
const consulClient = consul({
  host: config.consulHost,
  port: config.consulPort,
  promisify: true,
});

// Service registration configuration
const serviceConfig = {
  name: config.serviceName,
  id: serviceId,
  address: config.serviceHost,
  port: config.servicePort,
  tags: ['user-service', 'api', 'test'],
  check: {
    http: `http://${config.serviceHost}:${config.servicePort}/health`,
    interval: '10s',
    timeout: '5s',
    deregistercriticalserviceafter: '30s',
  },
};

// Create a minimal Fastify instance for testing
async function createTestServer() {
  const fastify = Fastify({
    logger: {
      level: 'info',
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss Z',
          ignore: 'pid,hostname',
        },
      },
    },
  });

  // Add health check endpoint
  fastify.get('/health', async (request, reply) => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  return fastify;
}

// Test functions
async function testConsulConnection() {
  console.log('\n🔍 Testing Consul connection...');
  try {
    const leader = await consulClient.status.leader();
    console.log(`✅ Consul connection successful. Leader: ${leader}`);
    return true;
  } catch (error) {
    console.error('❌ Failed to connect to Consul:', error.message);
    console.error('\n💡 Make sure Consul is running and accessible at:');
    console.error(`   http://${config.consulHost}:${config.consulPort}`);
    return false;
  }
}

async function testServiceRegistration() {
  console.log('\n📝 Testing service registration...');
  try {
    await consulClient.agent.service.register(serviceConfig);
    console.log(`✅ Service registered successfully with ID: ${serviceId}`);
    console.log(`   Service: ${config.serviceName}`);
    console.log(`   Address: ${config.serviceHost}:${config.servicePort}`);
    return true;
  } catch (error) {
    console.error('❌ Failed to register service:', error.message);
    return false;
  }
}

async function testServiceDiscovery() {
  console.log('\n🔎 Testing service discovery...');
  try {
    // Wait a moment for service to be fully registered
    await new Promise(resolve => setTimeout(resolve, 1000));

    const services = await consulClient.agent.service.list();
    const registeredService = services[serviceId];

    if (!registeredService) {
      console.error('❌ Service not found in Consul registry');
      return false;
    }

    console.log('✅ Service discovered successfully:');
    console.log(`   ID: ${registeredService.ID}`);
    console.log(`   Service: ${registeredService.Service}`);
    console.log(`   Address: ${registeredService.Address}:${registeredService.Port}`);
    console.log(`   Tags: ${registeredService.Tags.join(', ')}`);

    // Test querying by service name
    const serviceInstances = await consulClient.health.service({
      service: config.serviceName,
      passing: true,
    });

    if (serviceInstances.length === 0) {
      console.error('❌ No healthy instances found for service');
      return false;
    }

    console.log(`✅ Found ${serviceInstances.length} healthy instance(s) for ${config.serviceName}`);
    return true;
  } catch (error) {
    console.error('❌ Failed to discover service:', error.message);
    return false;
  }
}

async function testServiceDeregistration() {
  console.log('\n🗑️  Testing service deregistration...');
  try {
    await consulClient.agent.service.deregister(serviceId);
    console.log(`✅ Service deregistered successfully: ${serviceId}`);
    
    // Verify service is no longer in registry
    await new Promise(resolve => setTimeout(resolve, 500));
    const services = await consulClient.agent.service.list();
    const registeredService = services[serviceId];

    if (registeredService) {
      console.error('❌ Service still found in registry after deregistration');
      return false;
    }

    console.log('✅ Service successfully removed from registry');
    return true;
  } catch (error) {
    console.error('❌ Failed to deregister service:', error.message);
    return false;
  }
}

async function testConsulPlugin() {
  console.log('\n🔌 Testing Consul plugin with Fastify...');
  try {
    const fastify = await createTestServer();
    
    // Import and register the Consul plugin
    const { default: consulPlugin } = await import('./src/plugins/consul.js');
    await fastify.register(consulPlugin);
    
    console.log('✅ Consul plugin registered successfully');
    
    // Test if the plugin decorated the fastify instance
    if (fastify.consul && fastify.consulRegister && fastify.consulDeregister) {
      console.log('✅ Fastify instance properly decorated with Consul methods');
    } else {
      console.error('❌ Fastify instance missing Consul decorations');
      return false;
    }
    
    // Close the server
    await fastify.close();
    return true;
  } catch (error) {
    console.error('❌ Failed to test Consul plugin:', error.message);
    return false;
  }
}

// Main test execution
async function runTests() {
  console.log('🚀 Starting Consul integration tests for User Service');
  console.log('=====================================');
  console.log(`Configuration:`);
  console.log(`  Consul: ${config.consulHost}:${config.consulPort}`);
  console.log(`  Service: ${config.serviceName}`);
  console.log(`  Service Address: ${config.serviceHost}:${config.servicePort}`);
  console.log(`  Service ID: ${serviceId}`);

  const results = {
    consulConnection: false,
    serviceRegistration: false,
    serviceDiscovery: false,
    serviceDeregistration: false,
    consulPlugin: false,
  };

  // Run tests in sequence
  results.consulConnection = await testConsulConnection();
  
  if (results.consulConnection) {
    results.serviceRegistration = await testServiceRegistration();
    
    if (results.serviceRegistration) {
      results.serviceDiscovery = await testServiceDiscovery();
      results.serviceDeregistration = await testServiceDeregistration();
    }
  }
  
  results.consulPlugin = await testConsulPlugin();

  // Summary
  console.log('\n📊 Test Results Summary');
  console.log('=======================');
  console.log(`Consul Connection: ${results.consulConnection ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`Service Registration: ${results.serviceRegistration ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`Service Discovery: ${results.serviceDiscovery ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`Service Deregistration: ${results.serviceDeregistration ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`Consul Plugin: ${results.consulPlugin ? '✅ PASS' : '❌ FAIL'}`);

  const allPassed = Object.values(results).every(result => result === true);
  
  if (allPassed) {
    console.log('\n🎉 All tests passed! Consul integration is working correctly.');
    process.exit(0);
  } else {
    console.log('\n💥 Some tests failed. Please check the errors above.');
    process.exit(1);
  }
}

// Handle uncaught errors
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

// Run the tests
runTests().catch(error => {
  console.error('Test execution failed:', error);
  process.exit(1);
});