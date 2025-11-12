import consul from 'consul';

// Test configuration
const CONSUL_HOST = process.env.CONSUL_HOST || 'localhost';
const CONSUL_PORT = process.env.CONSUL_PORT || '8500';

// Test results
const testResults = {
  consulClient: null,
  serviceDiscovery: null,
  tests: [],
};

// Helper function to log test results
function logTest(testName, passed, error = null) {
  const result = {
    test: testName,
    passed,
    error: error ? error.message : null,
    timestamp: new Date().toISOString(),
  };
  testResults.tests.push(result);
  
  console.log(`[${passed ? 'PASS' : 'FAIL'}] ${testName}`);
  if (error) {
    console.log(`  Error: ${error.message}`);
  }
}

// Test 1: Initialize Consul client
async function testConsulClient() {
  try {
    const consulClient = consul({
      host: CONSUL_HOST,
      port: CONSUL_PORT,
      promisify: true,
    });
    
    testResults.consulClient = consulClient;
    logTest('Consul client initialization', true);
    return consulClient;
  } catch (error) {
    logTest('Consul client initialization', false, error);
    return null;
  }
}

// Test 2: Check Consul connectivity
async function testConsulConnectivity(consulClient) {
  try {
    const leader = await consulClient.status.leader();
    logTest('Consul connectivity check', true);
    console.log(`  Consul leader: ${leader}`);
    return true;
  } catch (error) {
    logTest('Consul connectivity check', false, error);
    return false;
  }
}

// Test 3: Service discovery for user-service
async function testUserServiceDiscovery(consulClient) {
  try {
    const services = await consulClient.catalog.service.nodes('user-service');
    
    if (!services || services.length === 0) {
      logTest('User service discovery', false, new Error('User service not found in Consul'));
      return [];
    }

    logTest('User service discovery', true);
    console.log(`  Found ${services.length} user service instance(s)`);
    
    services.forEach((service, index) => {
      console.log(`  Instance ${index + 1}: ${service.ServiceAddress || service.Address}:${service.ServicePort}`);
    });
    
    return services;
  } catch (error) {
    logTest('User service discovery', false, error);
    return [];
  }
}

// Test 4: Service discovery for template-service
async function testTemplateServiceDiscovery(consulClient) {
  try {
    const services = await consulClient.catalog.service.nodes('template-service');
    
    if (!services || services.length === 0) {
      logTest('Template service discovery', false, new Error('Template service not found in Consul'));
      return [];
    }

    logTest('Template service discovery', true);
    console.log(`  Found ${services.length} template service instance(s)`);
    
    services.forEach((service, index) => {
      console.log(`  Instance ${index + 1}: ${service.ServiceAddress || service.Address}:${service.ServicePort}`);
    });
    
    return services;
  } catch (error) {
    logTest('Template service discovery', false, error);
    return [];
  }
}

// Test 5: Service health check
async function testServiceHealthCheck(consulClient, serviceName) {
  try {
    const checks = await consulClient.health.service(serviceName);
    
    if (!checks || checks.length === 0) {
      logTest(`${serviceName} health check`, false, new Error('Service not found for health check'));
      return false;
    }

    const healthyChecks = checks.filter(check => 
      check.Checks.every(c => c.Status === 'passing')
    );

    const isHealthy = healthyChecks.length > 0;
    logTest(`${serviceName} health check`, isHealthy);
    
    console.log(`  Total instances: ${checks.length}`);
    console.log(`  Healthy instances: ${healthyChecks.length}`);
    
    if (!isHealthy) {
      console.log('  Unhealthy checks:');
      checks.forEach(check => {
        check.Checks.forEach(c => {
          if (c.Status !== 'passing') {
            console.log(`    ${c.Name}: ${c.Status} - ${c.Output || 'No output'}`);
          }
        });
      });
    }
    
    return isHealthy;
  } catch (error) {
    logTest(`${serviceName} health check`, false, error);
    return false;
  }
}

// Test 6: Service URL generation
async function testServiceUrlGeneration(consulClient, serviceName) {
  try {
    const services = await consulClient.catalog.service.nodes(serviceName);
    
    if (!services || services.length === 0) {
      logTest(`${serviceName} URL generation`, false, new Error('Service not found'));
      return null;
    }

    const service = services[0];
    const protocol = service.ServiceMeta?.protocol || 'http';
    const port = service.ServicePort;
    const address = service.ServiceAddress || service.Address;
    const url = `${protocol}://${address}:${port}`;

    logTest(`${serviceName} URL generation`, true);
    console.log(`  Generated URL: ${url}`);
    
    return url;
  } catch (error) {
    logTest(`${serviceName} URL generation`, false, error);
    return null;
  }
}

// Main test function
async function runTests() {
  console.log('=== Consul Service Discovery Test ===');
  console.log(`Consul host: ${CONSUL_HOST}:${CONSUL_PORT}`);
  console.log('');

  // Initialize Consul client
  const consulClient = await testConsulClient();
  if (!consulClient) {
    console.log('Failed to initialize Consul client. Exiting tests.');
    printTestSummary();
    return;
  }

  // Test connectivity
  const isConnected = await testConsulConnectivity(consulClient);
  if (!isConnected) {
    console.log('Failed to connect to Consul. Some tests may fail.');
  }

  console.log('');

  // Test service discovery
  await testUserServiceDiscovery(consulClient);
  await testTemplateServiceDiscovery(consulClient);
  
  console.log('');

  // Test health checks
  await testServiceHealthCheck(consulClient, 'user-service');
  await testServiceHealthCheck(consulClient, 'template-service');
  
  console.log('');

  // Test URL generation
  await testServiceUrlGeneration(consulClient, 'user-service');
  await testServiceUrlGeneration(consulClient, 'template-service');

  console.log('');
  printTestSummary();
}

// Print test summary
function printTestSummary() {
  const totalTests = testResults.tests.length;
  const passedTests = testResults.tests.filter(test => test.passed).length;
  const failedTests = totalTests - passedTests;

  console.log('=== Test Summary ===');
  console.log(`Total tests: ${totalTests}`);
  console.log(`Passed: ${passedTests}`);
  console.log(`Failed: ${failedTests}`);
  console.log(`Success rate: ${((passedTests / totalTests) * 100).toFixed(2)}%`);

  if (failedTests > 0) {
    console.log('');
    console.log('Failed Tests:');
    testResults.tests
      .filter(test => !test.passed)
      .forEach(test => {
        console.log(`- ${test.test}: ${test.error}`);
      });
  }

  console.log('');
  console.log('=== Recommendations ===');
  
  if (!testResults.consulClient) {
    console.log('- Install consul package: npm install consul');
  }
  
  const connectivityTest = testResults.tests.find(test => test.test === 'Consul connectivity check');
  if (connectivityTest && !connectivityTest.passed) {
    console.log('- Ensure Consul is running and accessible');
    console.log('- Check CONSUL_HOST and CONSUL_PORT environment variables');
    console.log('- Verify network connectivity to Consul server');
  }
  
  const userServiceTest = testResults.tests.find(test => test.test === 'User service discovery');
  if (userServiceTest && !userServiceTest.passed) {
    console.log('- Ensure user-service is registered with Consul');
    console.log('- Check user-service health endpoint');
  }
  
  const templateServiceTest = testResults.tests.find(test => test.test === 'Template service discovery');
  if (templateServiceTest && !templateServiceTest.passed) {
    console.log('- Ensure template-service is registered with Consul');
    console.log('- Check template-service health endpoint');
  }
}

// Run tests
runTests().catch(error => {
  console.error('Test execution failed:', error);
  process.exit(1);
});