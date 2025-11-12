import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createIsolatedTestServer } from './test-helper-isolated.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Test configuration - using unique port to avoid conflicts
const TEST_PORT = 3006;
const TEST_HOST = '127.0.0.1';

// Test results
const testResults = {
  tests: [],
};

// Test state
let server;
let cleanup;

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

// Test 1: Check if package.json exists and has correct configuration
function testPackageJson() {
  try {
    const packageJsonPath = resolve(__dirname, 'package.json');
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
    
    // Check required fields
    const requiredFields = ['name', 'version', 'main', 'type', 'scripts', 'dependencies'];
    for (const field of requiredFields) {
      if (!packageJson[field]) {
        throw new Error(`Missing required field: ${field}`);
      }
    }
    
    // Check if type is module
    if (packageJson.type !== 'module') {
      throw new Error('Package type should be "module"');
    }
    
    // Check if main entry point exists
    const mainPath = resolve(__dirname, packageJson.main);
    try {
      readFileSync(mainPath, 'utf8');
    } catch (err) {
      throw new Error(`Main entry point not found: ${packageJson.main}`);
    }
    
    // Check if consul dependency exists
    if (!packageJson.dependencies.consul) {
      throw new Error('Consul dependency not found in package.json');
    }
    
    // Check if fastify dependency exists
    if (!packageJson.dependencies.fastify) {
      throw new Error('Fastify dependency not found in package.json');
    }
    
    logTest('Package.json configuration', true);
    return true;
  } catch (error) {
    logTest('Package.json configuration', false, error);
    return false;
  }
}

// Test 2: Check if all source files exist
function testSourceFiles() {
  try {
    const requiredFiles = [
      'src/index.js',
      'src/plugins/consul.js',
      'src/plugins/correlation-id.js',
      'src/routes/notifications.js',
      'src/services/notificationService.js',
    ];
    
    for (const file of requiredFiles) {
      const filePath = resolve(__dirname, file);
      try {
        readFileSync(filePath, 'utf8');
      } catch (err) {
        throw new Error(`Required file not found: ${file}`);
      }
    }
    
    logTest('Source files existence', true);
    return true;
  } catch (error) {
    logTest('Source files existence', false, error);
    return false;
  }
}

// Test 3: Check import statements in source files
function testImportStatements() {
  try {
    const filesToCheck = [
      'src/index.js',
      'src/plugins/consul.js',
      'src/plugins/correlation-id.js',
      'src/routes/notifications.js',
      'src/services/notificationService.js',
    ];
    
    for (const file of filesToCheck) {
      const filePath = resolve(__dirname, file);
      const content = readFileSync(filePath, 'utf8');
      
      // Check for basic syntax errors
      try {
        // This is a simple check - in a real scenario, you'd use a proper parser
        if (content.includes('import') && !content.includes('from')) {
          throw new Error(`Invalid import statement in ${file}`);
        }
      } catch (err) {
        throw new Error(`Syntax error in ${file}: ${err.message}`);
      }
    }
    
    logTest('Import statements', true);
    return true;
  } catch (error) {
    logTest('Import statements', false, error);
    return false;
  }
}

// Test 4: Check shared response module
function testSharedResponseModule() {
  try {
    const sharedResponsePath = resolve(__dirname, '../../../shared/response.js');
    const content = readFileSync(sharedResponsePath, 'utf8');
    
    // Check if createResponse function is properly exported
    if (!content.includes('export') || !content.includes('createResponse')) {
      throw new Error('createResponse function not properly exported');
    }
    
    logTest('Shared response module', true);
    return true;
  } catch (error) {
    logTest('Shared response module', false, error);
    return false;
  }
}

// Test 5: Check environment variables
function testEnvironmentVariables() {
  try {
    const requiredEnvVars = [
      'PORT',
      'HOST',
      'CONSUL_HOST',
      'CONSUL_PORT',
    ];
    
    const missingVars = [];
    for (const envVar of requiredEnvVars) {
      if (!process.env[envVar]) {
        missingVars.push(envVar);
      }
    }
    
    if (missingVars.length > 0) {
      console.log(`  Warning: Missing environment variables: ${missingVars.join(', ')}`);
      console.log('  These will use default values.');
    }
    
    logTest('Environment variables', true);
    return true;
  } catch (error) {
    logTest('Environment variables', false, error);
    return false;
  }
}

// Test 6: Check Consul plugin configuration
function testConsulPlugin() {
  try {
    const consulPluginPath = resolve(__dirname, 'src/plugins/consul.js');
    const content = readFileSync(consulPluginPath, 'utf8');
    
    // Check for required functions
    const requiredFunctions = [
      'getServiceUrl',
      'getAllServiceInstances',
      'registerService',
      'deregisterService',
      'checkServiceHealth',
    ];
    
    for (const func of requiredFunctions) {
      if (!content.includes(func)) {
        throw new Error(`Missing required function: ${func}`);
      }
    }
    
    logTest('Consul plugin configuration', true);
    return true;
  } catch (error) {
    logTest('Consul plugin configuration', false, error);
    return false;
  }
}

// Test 7: Test isolated server creation
async function testIsolatedServerCreation() {
  try {
    console.log('\n=== Testing Isolated Server Creation ===');
    
    // Create isolated test server
    const testServer = await createIsolatedTestServer({
      logger: { level: 'error' }
    });
    
    server = testServer.server;
    cleanup = testServer.cleanup;
    
    // Start listening
    await server.listen({ port: TEST_PORT, host: TEST_HOST });
    console.log(`Test server started on ${TEST_HOST}:${TEST_PORT}`);
    
    // Test health endpoint
    const response = await fetch(`http://${TEST_HOST}:${TEST_PORT}/health`);
    const healthData = await response.json();
    
    console.log('Health check response:', JSON.stringify(healthData, null, 2));
    
    // Verify health check response
    if (response.status !== 200) {
      throw new Error(`Health check returned status ${response.status}, expected 200`);
    }
    
    if (!healthData.status || healthData.status !== 'healthy') {
      throw new Error(`Health check returned status ${healthData.status}, expected 'healthy'`);
    }
    
    if (!healthData.service || healthData.service !== 'api-gateway-test') {
      throw new Error(`Health check returned service ${healthData.service}, expected 'api-gateway-test'`);
    }
    
    // Test notifications endpoint
    const notificationResponse = await fetch(`http://${TEST_HOST}:${TEST_PORT}/api/v1/notifications/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-jwt-test-user',
        'X-Correlation-Id': 'test-correlation-id'
      },
      body: JSON.stringify({
        notification_type: 'email',
        user_id: 'test-user',
        template_code: 'test-template',
        variables: { name: 'Test User' },
        request_id: 'test-request-id',
        priority: 5
      })
    });
    
    if (notificationResponse.status !== 202) {
      throw new Error(`Notifications endpoint returned status ${notificationResponse.status}, expected 202`);
    }
    
    const notificationData = await notificationResponse.json();
    if (!notificationData.success) {
      throw new Error(`Notifications endpoint returned success=${notificationData.success}, expected true`);
    }
    
    logTest('Isolated server creation and basic functionality', true);
    return true;
  } catch (error) {
    logTest('Isolated server creation and basic functionality', false, error);
    return false;
  }
}

// Print test summary
function printTestSummary() {
  const totalTests = testResults.tests.length;
  const passedTests = testResults.tests.filter(test => test.passed).length;
  const failedTests = totalTests - passedTests;

  console.log('\n=== Test Summary ===');
  console.log(`Total tests: ${totalTests}`);
  console.log(`Passed: ${passedTests}`);
  console.log(`Failed: ${failedTests}`);
  console.log(`Success rate: ${((passedTests / totalTests) * 100).toFixed(2)}%`);

  if (failedTests > 0) {
    console.log('\nFailed Tests:');
    testResults.tests
      .filter(test => !test.passed)
      .forEach(test => {
        console.log(`- ${test.test}: ${test.error}`);
      });
  }

  console.log('\n=== Recommendations ===');
  
  if (passedTests === totalTests) {
    console.log('✅ All tests passed! The API Gateway should start without errors.');
    console.log('\nTo start API Gateway:');
    console.log('1. Install dependencies: npm install');
    console.log('2. Start service: npm start');
    console.log('3. Check health endpoint: curl http://localhost:3000/health');
  } else {
    console.log('❌ Some tests failed. Please fix issues before starting the API Gateway.');
    
    const packageTest = testResults.tests.find(test => test.test === 'Package.json configuration');
    if (packageTest && !packageTest.passed) {
      console.log('- Fix package.json configuration issues');
    }
    
    const sourceFilesTest = testResults.tests.find(test => test.test === 'Source files existence');
    if (sourceFilesTest && !sourceFilesTest.passed) {
      console.log('- Ensure all required source files exist');
    }
    
    const importTest = testResults.tests.find(test => test.test === 'Import statements');
    if (importTest && !importTest.passed) {
      console.log('- Fix import statement errors');
    }
    
    const sharedResponseTest = testResults.tests.find(test => test.test === 'Shared response module');
    if (sharedResponseTest && !sharedResponseTest.passed) {
      console.log('- Fix shared response module export issues');
    }
    
    const consulTest = testResults.tests.find(test => test.test === 'Consul plugin configuration');
    if (consulTest && !consulTest.passed) {
      console.log('- Fix Consul plugin configuration');
    }
    
    const isolatedServerTest = testResults.tests.find(test => test.test === 'Isolated server creation and basic functionality');
    if (isolatedServerTest && !isolatedServerTest.passed) {
      console.log('- Fix isolated server creation issues');
    }
  }
  
  console.log('\n=== Consul Setup ===');
  console.log('To test full Consul integration:');
  console.log('1. Start Consul server: consul agent -dev');
  console.log('2. Start user-service and template-service');
  console.log('3. Run Consul discovery test: node test-consul-discovery.js');
}

// Main test function
async function runTests() {
  console.log('=== API Gateway Startup Test (Refactored) ===');
  console.log('');

  testPackageJson();
  testSourceFiles();
  testImportStatements();
  testSharedResponseModule();
  testEnvironmentVariables();
  testConsulPlugin();
  await testIsolatedServerCreation();

  printTestSummary();
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

// Run tests and cleanup
runTests()
  .then(async () => {
    // Cleanup
    if (cleanup) {
      await cleanup();
      console.log('\n✅ Cleanup completed');
    }
  })
  .catch(error => {
    console.error('Test execution failed:', error);
    process.exit(1);
  });