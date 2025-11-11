import fp from 'fastify-plugin';
import { PrismaClient } from '@prisma/client';

/**
 * Fastify plugin to provide Prisma client across the application
 * @param {import('fastify').FastifyInstance} fastify
 */
async function prismaPlugin(fastify, options) {
  const prisma = new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

  // Test database connection
  try {
    await prisma.$connect();
    fastify.log.info('Successfully connected to PostgreSQL database');
  } catch (error) {
    fastify.log.error('Failed to connect to database:', error);
    throw error;
  }

  // Decorate Fastify instance with Prisma client
  fastify.decorate('prisma', prisma);

  // Graceful shutdown
  fastify.addHook('onClose', async (instance) => {
    await instance.prisma.$disconnect();
    fastify.log.info('Disconnected from PostgreSQL database');
  });
}

export default fp(prismaPlugin, {
  name: 'prisma',
});
