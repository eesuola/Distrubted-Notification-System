// Simple test to check if api-gateway can start without external dependencies
// Test if shared module can be imported
const { createResponse } = await import('file://' + process.cwd() + '/shared/response.js');

console.log('Testing api-gateway startup...');

// Test if shared module can be imported
const testResponse = createResponse(true, 'Test message', { test: true });
console.log('Shared response module works:', testResponse);

// Test if config can be imported
try {
  const { service_config } = await import('./config.js');
  console.log('Config module works:', service_config.name);
} catch (error) {
  console.error('Config module error:', error.message);
}

console.log('Basic import test completed');