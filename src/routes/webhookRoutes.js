// src/routes/webhookRoutes.js
import syncService from '../services/syncService.js';
const { handleWebhook } = syncService;
import config from '../config/index.js'; // Corrected import

async function webhookRoutes(fastify, options) {
  fastify.post('/webhook', async (request, reply) => {
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
