// Test script to verify API Gateway startup without actually running it
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Test results
const testResults = {
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
    console.log('\nTo start the API Gateway:');
    console.log('1. Install dependencies: npm install');
    console.log('2. Start the service: npm start');
    console.log('3. Check health endpoint: curl http://localhost:3000/health');
  } else {
    console.log('❌ Some tests failed. Please fix the issues before starting the API Gateway.');
    
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
  }
  
  console.log('\n=== Consul Setup ===');
  console.log('To test the full Consul integration:');
  console.log('1. Start Consul server: consul agent -dev');
  console.log('2. Start user-service and template-service');
  console.log('3. Run the Consul discovery test: node test-consul-discovery.js');
}

// Main test function
async function runTests() {
  console.log('=== API Gateway Startup Test ===');
  console.log('');

  testPackageJson();
  testSourceFiles();
  testImportStatements();
  testSharedResponseModule();
  testEnvironmentVariables();
  testConsulPlugin();

  printTestSummary();
}

// Run tests
runTests().catch(error => {
  console.error('Test execution failed:', error);
  process.exit(1);
});