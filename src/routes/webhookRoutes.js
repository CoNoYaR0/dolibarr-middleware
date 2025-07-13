// src/routes/webhookRoutes.js
import syncService from '../services/syncService.js'; // Import the default object
const { handleWebhook } = syncService; // Destructure to get the named function
import config from '../config/index.js';

async function webhookRoutes(fastify, options) {
  fastify.post('/webhook', async (request, reply) => {
    const { body: payload, headers } = request;
    // Use request.log provided by Fastify, which is configured in server.js
    const logger = request.log;

    logger.info({ payload }, 'Received webhook payload.');

    // Security Check: Validate webhook secret
    const expectedSecret = config.dolibarrWebhookSecret || process.env.DOLIBARR_WEBHOOK_SECRET;
    if (expectedSecret && headers['x-dolibarr-webhook-secret']) {
      if (headers['x-dolibarr-webhook-secret'] !== expectedSecret) {
        logger.warn({ providedSecret: headers['x-dolibarr-webhook-secret'], headers }, 'Unauthorized webhook attempt: Invalid secret.');
        return reply.status(401).send({ error: 'Unauthorized' });
      }
      logger.info('Webhook secret validated successfully.');
    } else if (expectedSecret && !headers['x-dolibarr-webhook-secret']) {
      logger.warn('⚠️ Webhook received without security header. This is not recommended for production.');
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
      handleWebhook(payload, logger)
        .then(() => {
          logger.info(`Webhook processing initiated successfully for trigger: ${payload.triggercode}`);
        })
        .catch(error => {
          logger.error({ err: error, triggercode: payload.triggercode }, `Error during asynchronous webhook processing for trigger ${payload.triggercode}.`);
        });

      logger.info(`Acknowledging webhook receipt for trigger: ${payload.triggercode}. Processing will continue in background.`);
      reply.status(200).send({ message: 'Webhook received and processing initiated.' });

    } catch (error) {
      logger.error({ err: error, triggercode: payload.triggercode }, 'Webhook immediate handling error before or during async dispatch.');
      reply.status(500).send({ error: 'Internal Server Error during webhook reception.' });
    }
  });
}

export default webhookRoutes;
