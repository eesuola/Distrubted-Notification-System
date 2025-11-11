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
    required: ['template_code', 'language', 'content'],
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
    required: ['language', 'content'],
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
    const { template_code, language, subject, content } = request.body;

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
        return reply.status(409).send({
          success: false,
          message: 'Template with this code and language already exists. Use the /versions endpoint to create a new version.',
        });
      }

      // Create new template with version 1
      const template = await fastify.prisma.template.create({
        data: {
          template_code,
          language,
          subject: subject || null,
          content,
          version: 1,
        },
      });

      return reply.status(201).send({
        success: true,
        message: 'Template created successfully',
        data: template,
      });
      
    } catch (error) {
      fastify.log.error('Error creating template:', error);
      
      // Handle Prisma unique constraint violation (just in case)
      if (error.code === 'P2002') {
        return reply.status(409).send({
          success: false,
          message: 'Template with this code, language, and version already exists.',
        });
      }
      
      return reply.status(500).send({
        success: false,
        message: 'Internal server error',
        error: error.message,
      });
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
      // Query the database for the template with template_code and language
      // Order the results by version in descending order
      // Return the single record with the highest version number
      const template = await fastify.prisma.template.findFirst({
        where: {
          template_code,
          language,
        },
        orderBy: {
          version: 'desc',
        },
      });

      if (!template) {
        return reply.status(404).send({
          success: false,
          message: `Template '${template_code}' not found for language '${language}'`,
        });
      }

      return reply.status(200).send({
        success: true,
        message: 'Latest template version retrieved successfully',
        data: template,
      });
      
    } catch (error) {
      fastify.log.error('Error retrieving latest template:', error);
      return reply.status(500).send({
        success: false,
        message: 'Internal server error',
        error: error.message,
      });
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
      // Query the database for the exact record matching template_code, language, and version
      const template = await fastify.prisma.template.findUnique({
        where: {
          template_code_language_version: {
            template_code,
            language,
            version: parseInt(version, 10),
          },
        },
      });

      if (!template) {
        return reply.status(404).send({
          success: false,
          message: `Template '${template_code}' version ${version} not found for language '${language}'`,
        });
      }

      return reply.status(200).send({
        success: true,
        message: 'Template version retrieved successfully',
        data: template,
      });
      
    } catch (error) {
      fastify.log.error('Error retrieving specific template version:', error);
      return reply.status(500).send({
        success: false,
        message: 'Internal server error',
        error: error.message,
      });
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
        return reply.status(404).send({
          success: false,
          message: 'No templates found for this code and language',
        });
      }

      return reply.status(200).send({
        success: true,
        message: 'Template versions retrieved successfully',
        data: templates,
      });
      
    } catch (error) {
      fastify.log.error('Error retrieving template versions:', error);
      return reply.status(500).send({
        success: false,
        message: 'Internal server error',
        error: error.message,
      });
    }
  });

  // POST /api/v1/templates/:template_code/versions/ - Create a new version of an existing template
  fastify.post('/:template_code/versions/', { schema: createTemplateVersionSchema }, async (request, reply) => {
    const { template_code } = request.params;
    const { language, subject, content } = request.body;

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
        return reply.status(404).send({
          success: false,
          message: `Template with code '${template_code}' and language '${language}' not found. Create it first using POST /api/v1/templates/`,
        });
      }

      // 2. Get the current highest version number
      const currentVersion = latestTemplate.version;
      const newVersion = currentVersion + 1;

      // 3. Create a new record with the new content and incremented version
      const newTemplate = await fastify.prisma.template.create({
        data: {
          template_code,
          language,
          subject: subject !== undefined ? subject : latestTemplate.subject,
          content,
          version: newVersion,
        },
      });

      return reply.status(201).send({
        success: true,
        message: `Template version ${newVersion} created successfully`,
        data: newTemplate,
      });
      
    } catch (error) {
      fastify.log.error('Error creating template version:', error);
      
      // Handle Prisma unique constraint violation
      if (error.code === 'P2002') {
        return reply.status(409).send({
          success: false,
          message: 'Template version already exists. This is likely a concurrency issue.',
        });
      }
      
      return reply.status(500).send({
        success: false,
        message: 'Internal server error',
        error: error.message,
      });
    }
  });
}
