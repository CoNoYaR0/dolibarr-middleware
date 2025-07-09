import cron from 'node-cron';
import config from '../config/index.js';
import syncService from './syncService.js'; // Assuming this has the functions we want to call
import logger from '../utils/logger.js'; // Import shared logger

// Store scheduled tasks to manage them (e.g., stop them)
const scheduledTasks = [];

/**
 * Starts the polling jobs.
 */
function start() {
  logger.info('Initializing polling service...');

  // 1. Stock Level Polling
  // Get interval from config, e.g., '*/30 * * * *' for every 30 minutes
  // Default to hourly if not specified
  const stockSyncInterval = config.polling?.stockSyncInterval || process.env.POLLING_STOCK_SYNC_INTERVAL || '0 * * * *'; // Default: hourly

  if (cron.validate(stockSyncInterval)) {
    logger.info(`Scheduling stock synchronization with interval: "${stockSyncInterval}"`);
    const stockSyncJob = cron.schedule(stockSyncInterval, async () => {
      logger.info('[PollingService] Starting scheduled stock synchronization...');
      try {
        await syncService.syncStockLevels(); // Call the existing sync function
        logger.info('[PollingService] Scheduled stock synchronization finished successfully.');
      } catch (error) {
        logger.error({ err: error }, '[PollingService] Error during scheduled stock synchronization');
      }
    }, {
      scheduled: true, // Start immediately based on schedule
      timezone: process.env.TZ || "Etc/UTC" // Optional: configure timezone
    });
    scheduledTasks.push(stockSyncJob);
    // stockSyncJob.start(); // Already started if scheduled: true
  } else {
    logger.warn(`[PollingService] Invalid cron expression for stock sync: "${stockSyncInterval}". Stock polling disabled.`);
  }

  // Add more polling jobs here as needed following the same pattern
  // Example: Poll for product updates less frequently if webhooks are primary
  // const productSyncInterval = config.polling?.productSyncInterval || '0 */6 * * *'; // Every 6 hours
  // if (cron.validate(productSyncInterval)) {
  //   logger.info(`Scheduling product data (full) synchronization with interval: "${productSyncInterval}"`);
  //   const productSyncJob = cron.schedule(productSyncInterval, async () => {
  //     logger.info('[PollingService] Starting scheduled full product synchronization...');
  //     try {
  //       // This would re-sync all products, categories, variants, images.
  //       // Use with caution as it can be resource-intensive.
  //       // await syncService.runInitialSync(); // Or more targeted syncs
  //       await syncService.syncProducts(); // Just products for example
  //       // Potentially sync others if needed as a fallback
  //       logger.info('[PollingService] Scheduled full product synchronization finished successfully.');
  //     } catch (error) {
  //       logger.error('[PollingService] Error during scheduled full product synchronization:', error.message, error.stack);
  //     }
  //   });
  //   scheduledTasks.push(productSyncJob);
  // } else {
  //    logger.warn(`[PollingService] Invalid cron expression for product sync: "${productSyncInterval}". Product polling disabled.`);
  // }


  if (scheduledTasks.length > 0) {
    logger.info('Polling service started with scheduled jobs.');
  } else {
    logger.info('Polling service initialized, but no valid jobs were scheduled.');
  }
}

/**
 * Stops all scheduled polling jobs.
 */
function stop() {
  if (scheduledTasks.length > 0) {
    logger.info('Stopping polling service and all scheduled jobs...');
    scheduledTasks.forEach(task => task.stop());
    logger.info('Polling service stopped.');
  } else {
    logger.info('Polling service has no active jobs to stop.');
  }
}

export default {
  start,
  stop,
};
