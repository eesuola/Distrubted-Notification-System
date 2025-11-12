import fastify from 'fastify';
import rabbitmqPlugin from './src/plugins/rabbitmq.js';

// Create Fastify instance for testing
const server = fastify({
  logger: {
    level: 'info',
  },
});

async function testRabbitMQ() {
  try {
    // Register RabbitMQ plugin
    await server.register(rabbitmqPlugin);
    
    // Wait a moment for connection to establish
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Test connection status
    const isConnected = await server.checkRabbitMQConnection();
    console.log('RabbitMQ connection status:', isConnected ? 'Connected' : 'Disconnected');
    
    if (isConnected) {
      // Test publishing a message to email queue
      const testMessage = {
        notification_id: 'test-email-001',
        notification_type: 'email',
        user_id: 'test-user-123',
        user_email: 'test@example.com',
        template_code: 'welcome',
        variables: {
          name: 'Test User',
          link: 'https://example.com',
        },
        priority: 1,
        created_at: new Date().toISOString(),
        status: 'pending',
      };
      
      try {
        const emailResult = await server.publishToQueue('email.queue', testMessage);
        console.log('Email message published successfully:', emailResult);
      } catch (error) {
        console.error('Failed to publish email message:', error);
      }
      
      // Test publishing a message to push queue
      const pushMessage = {
        notification_id: 'test-push-001',
        notification_type: 'push',
        user_id: 'test-user-123',
        user_push_token: 'test-push-token',
        template_code: 'welcome_push',
        variables: {
          name: 'Test User',
          link: 'https://example.com',
        },
        priority: 1,
        created_at: new Date().toISOString(),
        status: 'pending',
      };
      
      try {
        const pushResult = await server.publishToQueue('push.queue', pushMessage);
        console.log('Push message published successfully:', pushResult);
      } catch (error) {
        console.error('Failed to publish push message:', error);
      }
    }
    
    // Close connection
    await server.closeRabbitMQConnection();
    console.log('RabbitMQ connection closed');
    
  } catch (error) {
    console.error('Error testing RabbitMQ:', error);
  } finally {
    await server.close();
    process.exit(0);
  }
}

// Run the test
testRabbitMQ();