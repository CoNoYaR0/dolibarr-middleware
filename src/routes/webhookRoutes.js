// src/routes/webhookRoutes.js
import syncService from '../services/syncService.js'; // Import the default object
const { handleWebhook } = syncService; // Destructure to get the named function
import config from '../config/index.js';

async function webhookRoutes(fastify, options) {
  fastify.post('/webhook/:secret', async (request, reply) => {
    const { body: payload, params, headers } = request;
    const logger = request.log;

    // Security Check: Validate webhook secret from URL parameter
    const { secret } = params;
    const expectedSecret = config.dolibarr.webhookSecret;

    // Enhanced logging for debugging
    logger.info({
        receivedSecret: secret,
        expectedSecret: expectedSecret,
        receivedLength: secret ? secret.length : 0,
        expectedLength: expectedSecret ? expectedSecret.length : 0,
    }, 'Comparing webhook secrets.');

    if (!expectedSecret || !secret || secret.trim() !== expectedSecret.trim()) {
      logger.warn({
          providedSecret: secret,
          match: false,
      }, 'Unauthorized webhook attempt: Invalid or missing secret in URL.');
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    logger.info({ payload }, 'Received and authenticated webhook payload.');

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
