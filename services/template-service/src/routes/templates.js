// Import shared response utility
import { createResponse } from '../shared-response.js';

// JSON Schemas for request/response validation
const templateResponseSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    template_code: { type: 'string' },
    language: { type: 'string' },
    subject: { type: ['string', 'null'] },
    content: { type: 'string' },
    version: { type: 'integer' },
    created_at: { type: 'string' },
    updated_at: { type: 'string' },
  },
};

const createTemplateSchema = {
  body: {
    type: 'object',
    required: ['template_code', 'content'],
    properties: {
      template_code: { 
        type: 'string',
        minLength: 1,
        maxLength: 100,
        pattern: '^[a-z0-9_]+$',
        description: 'Template code using lowercase letters, numbers, and underscores only'
      },
      language: { 
        type: 'string',
        minLength: 2,
        maxLength: 5,
        pattern: '^[a-z]{2}(-[A-Z]{2})?$',
        description: 'Language code (e.g., en, en-US, fr, es)'
      },
      subject: { 
        type: 'string',
        minLength: 1,
        maxLength: 500,
        description: 'Email subject line (optional for push notifications)'
      },
      content: { 
        type: 'string',
        minLength: 1,
        description: 'Template content with optional variables like {{name}}'
      },
    },
  },
  response: {
    201: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
        data: templateResponseSchema,
      },
    },
    409: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
      },
    },
  },
};

const createTemplateVersionSchema = {
  params: {
    type: 'object',
    required: ['template_code'],
    properties: {
      template_code: { type: 'string' },
    },
  },
  body: {
    type: 'object',
    required: ['content'],
    properties: {
      language: { 
        type: 'string',
        minLength: 2,
        maxLength: 5,
        pattern: '^[a-z]{2}(-[A-Z]{2})?$',
        description: 'Language code (e.g., en, en-US, fr, es)'
      },
      subject: { 
        type: 'string',
        minLength: 1,
        maxLength: 500,
        description: 'Email subject line (optional for push notifications)'
      },
      content: { 
        type: 'string',
        minLength: 1,
        description: 'Template content with optional variables like {{name}}'
      },
    },
  },
  response: {
    201: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
        data: templateResponseSchema,
      },
    },
    404: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
      },
    },
  },
};

/**
 * Template routes plugin
 * @param {import('fastify').FastifyInstance} fastify
 */
export default async function templateRoutes(fastify, options) {
  
  // POST /api/v1/templates/ - Create a brand new template (first version)
  fastify.post('/', { schema: createTemplateSchema }, async (request, reply) => {
    const { template_code, language = 'en', subject, content } = request.body;

    try {
      // Check if a template with this code and language already exists
      const existingTemplate = await fastify.prisma.template.findFirst({
        where: {
          template_code,
          language,
        },
        orderBy: {
          version: 'desc',
        },
      });

      // If template exists, return 409 Conflict
      if (existingTemplate) {
        return reply.status(409).send(createResponse(
          false,
          'Template with this code and language already exists. Use the /versions endpoint to create a new version.'
        ));
      }

      // Create new template with version 1
      // If language is not provided, Prisma will use database default ('en')
      const template = await fastify.prisma.template.create({
        data: {
          template_code,
          ...(language !== 'en' && { language }), // Only set if not default
          subject: subject || null,
          content,
          version: 1,
        },
      });

      // Cache the new template for 1 hour (3600 seconds)
      const cacheKey = fastify.getTemplateCacheKey(template_code, language);
      await fastify.cacheTemplate(cacheKey, template, 3600);
      request.log.info(`Cached new template: ${template_code} (${language})`);

      return reply.status(201).send(createResponse(
        true,
        'Template created successfully',
        template
      ));
      
    } catch (error) {
      fastify.log.error('Error creating template:', error);
      
      // Handle Prisma unique constraint violation (just in case)
      if (error.code === 'P2002') {
        return reply.status(409).send(createResponse(
          false,
          'Template with this code, language, and version already exists.'
        ));
      }
      
      return reply.status(500).send(createResponse(
        false,
        'Internal server error',
        undefined,
        error.message
      ));
    }
  });

  // GET /api/v1/templates/:template_code - Get latest version of a template
  fastify.get('/:template_code', {
    schema: {
      params: {
        type: 'object',
        required: ['template_code'],
        properties: {
          template_code: { 
            type: 'string',
            description: 'Template code identifier'
          },
        },
      },
      querystring: {
        type: 'object',
        properties: {
          language: { 
            type: 'string',
            description: 'Language code (default: en)',
            default: 'en'
          },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
            data: templateResponseSchema,
          },
        },
        404: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
          },
        },
      },
    },
  }, async (request, reply) => {
    const { template_code } = request.params;
    const { language = 'en' } = request.query;

    try {
      // Generate cache key for this template
      const cacheKey = fastify.getTemplateCacheKey(template_code, language);
      
      // Try to get template from Redis cache first
      let template = await fastify.getCachedTemplate(cacheKey);
      
      if (!template) {
        request.log.info(`Cache miss for template: ${template_code} (${language})`);
        
        // Query the database for the template with template_code and language
        // Order the results by version in descending order
        // Return the single record with the highest version number
        template = await fastify.prisma.template.findFirst({
          where: {
            template_code,
            language,
          },
          orderBy: {
            version: 'desc',
          },
        });

        if (!template) {
          return reply.status(404).send(createResponse(
            false,
            `Template '${template_code}' not found for language '${language}'`
          ));
        }

        // Cache the template for 1 hour (3600 seconds)
        await fastify.cacheTemplate(cacheKey, template, 3600);
        request.log.info(`Cached template: ${template_code} (${language})`);
      } else {
        request.log.info(`Cache hit for template: ${template_code} (${language})`);
      }

      return reply.status(200).send(createResponse(
        true,
        'Latest template version retrieved successfully',
        template
      ));
      
    } catch (error) {
      request.log.error('Error retrieving latest template:', error);
      return reply.status(500).send(createResponse(
        false,
        'Internal server error',
        undefined,
        error.message
      ));
    }
  });

  // GET /api/v1/templates/:template_code/versions/:version - Get a specific version of a template
  fastify.get('/:template_code/versions/:version', {
    schema: {
      params: {
        type: 'object',
        required: ['template_code', 'version'],
        properties: {
          template_code: { 
            type: 'string',
            description: 'Template code identifier'
          },
          version: { 
            type: 'integer',
            minimum: 1,
            description: 'Specific version number'
          },
        },
      },
      querystring: {
        type: 'object',
        properties: {
          language: { 
            type: 'string',
            description: 'Language code (default: en)',
            default: 'en'
          },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
            data: templateResponseSchema,
          },
        },
        404: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
          },
        },
      },
    },
  }, async (request, reply) => {
    const { template_code, version } = request.params;
    const { language = 'en' } = request.query;

    try {
      // Generate cache key for this specific template version
      const cacheKey = fastify.getTemplateVersionCacheKey(template_code, version, language);
      
      // Try to get template from Redis cache first
      let template = await fastify.getCachedTemplate(cacheKey);
      
      if (!template) {
        request.log.info(`Cache miss for template version: ${template_code} v${version} (${language})`);
        
        // Query the database for the exact record matching template_code, language, and version
        template = await fastify.prisma.template.findUnique({
          where: {
            template_code_language_version: {
              template_code,
              language,
              version: parseInt(version, 10),
            },
          },
        });

        if (!template) {
          return reply.status(404).send(createResponse(
            false,
            `Template '${template_code}' version ${version} not found for language '${language}'`
          ));
        }

        // Cache the template version for 1 hour (3600 seconds)
        await fastify.cacheTemplate(cacheKey, template, 3600);
        request.log.info(`Cached template version: ${template_code} v${version} (${language})`);
      } else {
        request.log.info(`Cache hit for template version: ${template_code} v${version} (${language})`);
      }

      return reply.status(200).send(createResponse(
        true,
        'Template version retrieved successfully',
        template
      ));
      
    } catch (error) {
      request.log.error('Error retrieving specific template version:', error);
      return reply.status(500).send(createResponse(
        false,
        'Internal server error',
        undefined,
        error.message
      ));
    }
  });

  // GET /api/v1/templates/:template_code/versions - Get all versions of a template
  fastify.get('/:template_code/versions', {
    schema: {
      params: {
        type: 'object',
        required: ['template_code'],
        properties: {
          template_code: { type: 'string' },
        },
      },
      querystring: {
        type: 'object',
        properties: {
          language: { 
            type: 'string',
            description: 'Language code (default: en)'
          },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
            data: {
              type: 'array',
              items: templateResponseSchema,
            },
          },
        },
      },
    },
  }, async (request, reply) => {
    const { template_code } = request.params;
    const { language = 'en' } = request.query;

    try {
      const templates = await fastify.prisma.template.findMany({
        where: {
          template_code,
          language,
        },
        orderBy: {
          version: 'desc',
        },
      });

      if (templates.length === 0) {
        return reply.status(404).send(createResponse(
          false,
          'No templates found for this code and language'
        ));
      }

      return reply.status(200).send(createResponse(
        true,
        'Template versions retrieved successfully',
        templates
      ));
      
    } catch (error) {
      fastify.log.error('Error retrieving template versions:', error);
      return reply.status(500).send(createResponse(
        false,
        'Internal server error',
        undefined,
        error.message
      ));
    }
  });

  // POST /api/v1/templates/:template_code/versions/ - Create a new version of an existing template
  fastify.post('/:template_code/versions/', { schema: createTemplateVersionSchema }, async (request, reply) => {
    const { template_code } = request.params;
    const { language = 'en', subject, content } = request.body;

    try {
      // 1. Find the template with template_code and language, get the latest version
      const latestTemplate = await fastify.prisma.template.findFirst({
        where: {
          template_code,
          language,
        },
        orderBy: {
          version: 'desc',
        },
      });

      // If no existing template found, return 404
      if (!latestTemplate) {
        return reply.status(404).send(createResponse(
          false,
          `Template with code '${template_code}' and language '${language}' not found. Create it first using POST /api/v1/templates/`
        ));
      }

      // 2. Get the current highest version number
      const currentVersion = latestTemplate.version;
      const newVersion = currentVersion + 1;

      // 3. Create a new record with the new content and incremented version
      // If language is not provided, Prisma will use database default ('en')
      const newTemplate = await fastify.prisma.template.create({
        data: {
          template_code,
          ...(language !== 'en' && { language }), // Only set if not default
          subject: subject !== undefined ? subject : latestTemplate.subject,
          content,
          version: newVersion,
        },
      });

      // Invalidate cache for this template since we created a new version
      await fastify.invalidateTemplateCache(template_code, language);
      request.log.info(`Invalidated cache for template: ${template_code} (${language})`);

      return reply.status(201).send(createResponse(
        true,
        `Template version ${newVersion} created successfully`,
        newTemplate
      ));
      
    } catch (error) {
      fastify.log.error('Error creating template version:', error);
      
      // Handle Prisma unique constraint violation
      if (error.code === 'P2002') {
        return reply.status(409).send(createResponse(
          false,
          'Template version already exists. This is likely a concurrency issue.'
        ));
      }
      
      return reply.status(500).send(createResponse(
        false,
        'Internal server error',
        undefined,
        error.message
      ));
    }
  });
}
