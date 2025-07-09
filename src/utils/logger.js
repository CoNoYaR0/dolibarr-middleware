import pino from 'pino';
import config from '../config/index.js';

// Create a shared logger instance
// This can be used by services or parts of the app not directly tied to a Fastify request
const logger = pino({
  level: config.server.logLevel || 'info',
  transport: config.env !== 'production'
    ? { target: 'pino-pretty' }
    : undefined,
});

export default logger;
