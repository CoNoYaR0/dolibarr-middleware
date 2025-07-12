// src/routes/webhookRoutes.js
import syncService from '../services/syncService.js';
const { handleWebhook } = syncService;
import config from '../config/index.js'; // Corrected import

const webhookPayloadSchema = {
  type: 'object',
  required: ['triggercode', 'object'],
  properties: {
    triggercode: {
      type: 'string',
      description: 'The event code from Dolibarr (e.g., PRODUCT_CREATE, CATEGORY_MODIFY).',
      examples: ['PRODUCT_CREATE', 'STOCK_MOVEMENT'],
    },
    object: {
      type: 'object',
      description: 'The Dolibarr object data associated with the event.',
      properties: {
        id: { type: ['integer', 'string'], description: 'ID of the Dolibarr object.' },
        // Add other common fields if known, or allow additionalProperties
      },
      additionalProperties: true,
    },
    // Potentially other fields Dolibarr might send
  },
};

const webhookResponseSchema = {
  200: {
    type: 'object',
    properties: {
      message: { type: 'string', example: 'Webhook received and processing initiated.' },
    },
  },
  400: {
    type: 'object',
    properties: {
      error: { type: 'string' },
      message: { type: 'string' },
      details: { type: 'array', items: { type: 'object' } } // Optional for validation errors
    }
  },
  401: {
    type: 'object',
    properties: {
      error: { type: 'string', example: 'Unauthorized' },
    }
  },
  500: {
    type: 'object',
    properties: {
      error: { type: 'string', example: 'Internal Server Error during webhook reception.' },
    }
  }
};

async function webhookRoutes(fastify, options) {
  const routeSchema = {
    description: 'Receives and processes webhooks from a Dolibarr ERP instance. This endpoint listens for various events (e.g., product creation, stock updates) and triggers corresponding actions within the middleware, such as data synchronization. A shared secret can be configured for security.',
    summary: 'Dolibarr Webhook Receiver',
    tags: ['Webhooks'],
    body: webhookPayloadSchema,
    response: webhookResponseSchema,
    // It might also be useful to document expected headers like X-Dolibarr-Webhook-Secret
    // headers: {
    //   type: 'object',
    //   properties: {
    //     'X-Dolibarr-Webhook-Secret': { type: 'string', description: 'Shared secret for webhook authentication (if configured).' }
    //   }
    // }
  };

  fastify.post('/webhook', { schema: routeSchema }, async (request, reply) => {
    const { body: payload, headers } = request;
    // Use request.log provided by Fastify, which is configured in server.js
    const logger = request.log;

    logger.info({ payload }, 'Received webhook payload.');

    // Security Check: Validate webhook secret
    // IMPORTANT: Confirm the actual header Dolibarr uses for its webhook signature/secret.
    // 'x-dolibarr-webhook-secret' is a placeholder.
    // Dolibarr's documentation or testing environment should clarify this.
    // For now, let's assume a simple shared secret.
    // A more robust solution would involve HMAC signature verification if Dolibarr supports it.
    const expectedSecret = config.dolibarrWebhookSecret || process.env.DOLIBARR_WEBHOOK_SECRET;
    if (expectedSecret) {
      const providedSecret = headers['x-dolibarr-webhook-secret']; // Placeholder header
      if (providedSecret !== expectedSecret) {
        logger.warn({ providedSecret, headers }, 'Unauthorized webhook attempt: Invalid or missing secret.');
        reply.status(401).send({ error: 'Unauthorized' });
        return;
      }
      logger.info('Webhook secret validated successfully.');
    } else {
      logger.info('No webhook secret configured, skipping validation. This is not recommended for production.');
    }

    if (!payload || typeof payload !== 'object') {
      logger.warn({ payload }, 'Invalid webhook payload: not an object.');
      reply.status(400).send({ error: 'Invalid payload: Expected a JSON object.' });
      return;
    }

    if (!payload.triggercode || !payload.object) {
      logger.warn({ triggercode: payload.triggercode, objectExists: !!payload.object }, 'Invalid webhook payload structure.');
      reply.status(400).send({ error: 'Invalid payload structure. "triggercode" and "object" are required.' });
      return;
    }

    try {
      // Asynchronously handle the webhook to respond quickly to Dolibarr.
      // Pass the logger instance to handleWebhook for consistent logging.
      handleWebhook(payload, logger)
        .then(() => {
          logger.info(`Webhook processing initiated successfully for trigger: ${payload.triggercode}`);
        })
        .catch(error => {
          // This catch is for errors within the async handleWebhook execution
          logger.error({ err: error, triggercode: payload.triggercode }, `Error during asynchronous webhook processing for trigger ${payload.triggercode}.`);
          // We've already responded 200 to Dolibarr. This error needs to be handled internally (e.g., alerting).
        });

      // Respond immediately to Dolibarr to acknowledge receipt
      logger.info(`Acknowledging webhook receipt for trigger: ${payload.triggercode}. Processing will continue in background.`);
      reply.status(200).send({ message: 'Webhook received and processing initiated.' });

    } catch (error) {
      // This catch is for errors thrown synchronously before or during the call to handleWebhook
      // (e.g., if handleWebhook itself was not async and threw directly, or if there's an issue setting up the promise)
      logger.error({ err: error, triggercode: payload.triggercode }, 'Webhook immediate handling error before or during async dispatch.');
      reply.status(500).send({ error: 'Internal Server Error during webhook reception.' });
    }
  });
}

export default webhookRoutes;
