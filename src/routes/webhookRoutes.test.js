import { test, expect, describe, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import webhookRoutes from './webhookRoutes.js';
// config is now mocked
import syncService from '../services/syncService.js';

const testSecret = 'test-secret-123';

// Mock the config module before other imports that might use it
vi.mock('../config/index.js', () => ({
  default: {
    dolibarr: {
      webhookSecret: 'test-secret-123', // Use literal value to avoid hoisting issues
    },
  },
}));

// Mock the syncService to prevent actual processing
vi.mock('../services/syncService.js', () => ({
  default: {
    handleWebhook: vi.fn().mockResolvedValue(),
  },
}));

describe('Webhook Security', () => {
  let app;

  beforeEach(async () => {
    app = Fastify();
    await app.register(webhookRoutes, { prefix: '/webhooks' });
    await app.ready();
  });

  test('should return 401 if secret is incorrect', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/webhooks/webhook/wrong-secret',
      payload: { triggercode: 'TEST', object: {} },
    });
    expect(response.statusCode).toBe(401);
    expect(JSON.parse(response.payload).error).toBe('Unauthorized');
  });

  test('should return 401 if secret is missing', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/webhooks/webhook/',
      payload: { triggercode: 'TEST', object: {} },
    });
    // Our logic correctly identifies the missing secret and returns 401
    expect(response.statusCode).toBe(401);
  });

  test('should return 200 and process webhook if secret is correct', async () => {
    const payload = { triggercode: 'PRODUCT_CREATE', object: { id: 1 } };
    const response = await app.inject({
      method: 'POST',
      url: `/webhooks/webhook/${testSecret}`,
      payload: payload,
    });
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.payload).message).toBe('Webhook received and processing initiated.');
    // Check if handleWebhook was called
    expect(syncService.handleWebhook).toHaveBeenCalledWith(payload, expect.anything());
  });

  test('should handle secrets with trailing spaces', async () => {
    const payload = { triggercode: 'PRODUCT_CREATE', object: { id: 1 } };
    // Simulate a secret with a trailing space from the URL
    const response = await app.inject({
      method: 'POST',
      url: `/webhooks/webhook/${testSecret}  `,
      payload: payload,
    });
    expect(response.statusCode).toBe(200);
  });
});
