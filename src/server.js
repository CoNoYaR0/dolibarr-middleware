// Import Fastify
import Fastify from 'fastify';
import config from './config/index.js'; // Import the centralized config
import dbService from './services/dbService.js'; // Will be used later
import webhookRoutes from './routes/webhookRoutes.js';
import pollingService from './services/pollingService.js';
import syncService from './services/syncService.js';
import apiRoutes from './routes/apiRoutes.js';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import fastifyHelmet from '@fastify/helmet';
import formBody from '@fastify/formbody';
import cors from '@fastify/cors';

// Instantiate Fastify with logger settings from config
const fastify = Fastify({
  logger: {
    transport: config.env !== 'production' ? { target: 'pino-pretty' } : undefined,
    level: config.server.logLevel,
  },
});

// Register formbody to handle application/x-www-form-urlencoded
fastify.register(formBody, {
  parser: (str) => {
    try {
      return JSON.parse(str);
    } catch {
      // Not a valid JSON, return an empty object or handle as an error
      return {};
    }
  },
});

// Register Helmet for security headers
// It's good to register Helmet early in the lifecycle.
// Default configuration is quite good. Add options if needed.
await fastify.register(fastifyHelmet, {
  // Example: Disable a specific default for contentSecurityPolicy if it causes issues
  // and you understand the implications. It's better to configure CSP properly.
  // contentSecurityPolicy: false, // Or provide a full CSP object
  // crossOriginEmbedderPolicy: false, // if causing issues with embeds
});

// Register CORS
await fastify.register(cors, {
  origin: 'https://stainedglass.tn',
  methods: ['GET'],
});


// Declare a route for health check
const healthCheckSchema = {
  summary: 'Health Check',
  description: 'Provides the operational status of the middleware. Indicates if the service is running and the current server timestamp.',
  tags: ['Monitoring'],
  response: {
    200: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'ok' },
        timestamp: { type: 'string', format: 'date-time' },
        // dbStatus: { type: 'string', example: 'connected' } // Example if db check is added
      },
    },
  },
};

fastify.get('/health', { schema: healthCheckSchema }, async () => {
  // Optionally, include database connection status in health check later
  // const dbOk = await dbService.testConnection();
  return {
    status: 'ok',
    timestamp: new Date().toISOString(),
    // dbStatus: dbOk ? 'connected' : 'disconnected'
  };
});

// Swagger/OpenAPI Documentation Setup
// Ensure this is registered before your routes if you want them to be included
await fastify.register(fastifySwagger, {
  openapi: {
    info: {
      title: 'Dolibarr Integration Middleware API',
      description: 'API for fetching synchronized Dolibarr product data, categories, stock, etc.',
      version: config.version || '1.0.0', // Assuming version is in package.json or config
    },
    // externalDocs: {
    //   url: 'https://swagger.io',
    //   description: 'Find more info here'
    // },
    // components: {
    //   securitySchemes: {
    //     apiKey: {
    //       type: 'apiKey',
    //       name: 'apiKey',
    //       in: 'header'
    //     }
    //   }
    // },
    // servers: [{ url: `http://${config.server.host}:${config.server.port}` }] // Dynamically set server URL
  }
});

await fastify.register(fastifySwaggerUi, {
  routePrefix: '/documentation', // UI available at /documentation
  uiConfig: {
    docExpansion: 'list', // 'full', 'none'
    deepLinking: true,
  },
  // uiHooks: {
  //   onRequest: function (request, reply, next) { next() },
  //   preHandler: function (request, reply, next) { next() }
  // },
  // staticCSP: true,
  // transformStaticCSP: (header) => header,
  // transformSpecification: (swaggerObject, request, reply) => { return swaggerObject },
  // transformSpecificationClone: true
});

// Register webhook routes
fastify.register(webhookRoutes, { prefix: '/webhooks' });

// Register main API routes (for frontend consumption)
fastify.register(apiRoutes, { prefix: '/api/v1' }); // Example prefix


// Centralized Error Handler
fastify.setErrorHandler((error, request, reply) => {
  request.log.error({ err: error, requestId: request.id }, 'Unhandled error occurred');

  if (reply.sent) {
    return;
  }

  // Basic error response
  let statusCode = error.statusCode || 500;
  let responsePayload = {
    error: 'Internal ServerError', // Generic message for 500
    message: error.message, // Can be too revealing for some errors in prod
  };

  // Handle Fastify's built-in validation errors
  if (error.validation) {
    statusCode = 400;
    responsePayload = {
      error: 'Validation Error',
      message: 'Invalid input parameters.',
      details: error.validation.map(v => ({
        field: typeof v.dataPath === 'string' && v.dataPath.length > 0 ? v.dataPath.substring(1) : '', // Safely access dataPath
        message: v.message,
        params: v.params,
      })),
    };
  } else if (statusCode >= 500) {
    // For 500 errors in production, don't send back the original error.message
    if (config.env === 'production') {
      responsePayload.message = 'An unexpected error occurred on the server.';
    }
  }

  // Add more custom error type handling here if needed
  // e.g., if (error instanceof MyCustomError) { ... }

  reply.code(statusCode).send(responsePayload);
});


// Run the server!
const start = async () => {
  try {
    // Log all registered routes for debugging (optional)
    // fastify.ready(err => {
    //   if (err) throw err
    //   console.log(fastify.printRoutes())
    // })

    await fastify.listen({ port: config.server.port, host: config.server.host });
    fastify.log.info(
      `Server listening on http://${config.server.host}:${config.server.port} in ${config.env} mode`
    );
    // Test DB connection on startup
    if (await dbService.testConnection()) {
      fastify.log.info('Database connection successful.');
    } else {
      fastify.log.error('Database connection failed on startup!');
      process.exit(1);
    }

    // Start polling service if enabled
    if (config.polling.enabled) {
      pollingService.start();
    }

    // Run initial sync if enabled
    if (config.runInitialSync) {
      syncService.runInitialSync().catch(err => {
        fastify.log.error(err, 'Initial sync failed');
      });
    }

  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

// Graceful shutdown
const signals = ['SIGINT', 'SIGTERM'];
signals.forEach((signal) => {
  process.on(signal, async () => {
    fastify.log.info(`Received ${signal}, shutting down gracefully...`);
    if (config.polling.enabled) {
      pollingService.stop();
    }
    await fastify.close();
    // Add any other cleanup here (e.g., close DB pool if dbService had an explicit close method)
    fastify.log.info('Server shut down.');
    process.exit(0);
  });
});

start();
