import dolibarrApiService from '../services/dolibarrApiService.js';
import db from '../services/dbService.js';
import config from '../config/index.js';
// Re-using transform functions from syncService, or they could be moved to a shared util if preferred
// For now, let's assume they might become more specific or we might call a targeted sync function.
// import { transformProduct, transformCategory } from '../services/syncService.js'; // This creates a slight coupling, consider refactor later

// const logger = console; // Will use request.log from Fastify request object

// A simple shared secret for webhook validation - should be in config
const WEBHOOK_SECRET = config.dolibarr.webhookSecret || process.env.DOLIBARR_WEBHOOK_SECRET;

// Helper to simulate parts of syncService's upsert logic for a single item
// In a real app, this logic would be more robust and likely part of a dedicated data_mapper or repository layer.

async function upsertProductFromDolibarrData(dolibarrProductData) {
  // Simplified: fetch category map each time for now, or pass it around.
  const categoryMapResult = await db.query('SELECT dolibarr_category_id, id FROM categories WHERE dolibarr_category_id IS NOT NULL;');
  const categoryDolibarrToLocalIdMap = new Map();
  categoryMapResult.rows.forEach(row => {
    categoryDolibarrToLocalIdMap.set(row.dolibarr_category_id, row.id);
  });

  // This is a simplified transformProduct, ideally from a shared module or syncService
   let localCategoryId = null;
  if (dolibarrProductData.fk_categorie || dolibarrProductData.category_id) {
    const dolibarrCatId = parseInt(dolibarrProductData.fk_categorie || dolibarrProductData.category_id, 10);
    localCategoryId = categoryDolibarrToLocalIdMap.get(dolibarrCatId);
  }
  const productData = {
    dolibarr_product_id: dolibarrProductData.id,
    sku: dolibarrProductData.ref,
    name: dolibarrProductData.label || dolibarrProductData.name,
    description: dolibarrProductData.description,
    long_description: dolibarrProductData.note_public || dolibarrProductData.long_description,
    price: parseFloat(dolibarrProductData.price) || 0,
    category_id: localCategoryId,
    is_active: !dolibarrProductData.status_tosell || parseInt(dolibarrProductData.status_tosell, 10) === 1,
    slug: dolibarrProductData.ref ? dolibarrProductData.ref.toLowerCase().replace(/[^a-z0-9]+/g, '-') : `product-${dolibarrProductData.id}`,
  };

  const queryText = `
    INSERT INTO products (
      dolibarr_product_id, sku, name, description, long_description, price,
      category_id, is_active, slug, dolibarr_created_at, dolibarr_updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    ON CONFLICT (dolibarr_product_id) DO UPDATE SET
      sku = EXCLUDED.sku, name = EXCLUDED.name, description = EXCLUDED.description,
      long_description = EXCLUDED.long_description, price = EXCLUDED.price,
      category_id = EXCLUDED.category_id, is_active = EXCLUDED.is_active, slug = EXCLUDED.slug,
      dolibarr_created_at = EXCLUDED.dolibarr_created_at,
      dolibarr_updated_at = EXCLUDED.dolibarr_updated_at, updated_at = NOW()
    RETURNING id;`;
  await db.query(queryText, [
    productData.dolibarr_product_id, productData.sku, productData.name, productData.description,
    productData.long_description, productData.price, productData.category_id, productData.is_active,
    productData.slug, dolibarrProductData.date_creation || null, dolibarrProductData.tms || null,
  ]);
  logger.info(`Webhook: Upserted product ${productData.name} (Dolibarr ID: ${productData.dolibarr_product_id})`);
}

async function upsertCategoryFromDolibarrData(dolibarrCategoryData) {
  const categoryData = {
    dolibarr_category_id: dolibarrCategoryData.id,
    name: dolibarrCategoryData.label || dolibarrCategoryData.name,
    description: dolibarrCategoryData.description,
    parent_dolibarr_category_id: dolibarrCategoryData.fk_parent || dolibarrCategoryData.parent_id,
  };
  const queryText = `
    INSERT INTO categories (
      dolibarr_category_id, name, description, parent_dolibarr_category_id,
      dolibarr_created_at, dolibarr_updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT (dolibarr_category_id) DO UPDATE SET
      name = EXCLUDED.name, description = EXCLUDED.description,
      parent_dolibarr_category_id = EXCLUDED.parent_dolibarr_category_id,
      dolibarr_created_at = EXCLUDED.dolibarr_created_at,
      dolibarr_updated_at = EXCLUDED.dolibarr_updated_at, updated_at = NOW()
    RETURNING id;`;
  await db.query(queryText, [
    categoryData.dolibarr_category_id, categoryData.name, categoryData.description,
    categoryData.parent_dolibarr_category_id,
    dolibarrCategoryData.date_creation || null, dolibarrCategoryData.tms || null,
  ]);
  logger.info(`Webhook: Upserted category ${categoryData.name} (Dolibarr ID: ${categoryData.dolibarr_category_id})`);
}


async function webhookRoutes(fastify, options) {
  fastify.post('/dolibarr', async (request, reply) => {
    // 1. Security Check (Example: Shared Secret)
    const providedSecret = request.headers['x-dolibarr-webhook-secret'] || request.query.secret;
    if (!WEBHOOK_SECRET || providedSecret !== WEBHOOK_SECRET) {
      request.log.warn({ headers: request.headers, query: request.query }, 'Webhook: Unauthorized attempt - Invalid or missing secret.');
      reply.code(401).send({ error: 'Unauthorized' });
      return;
    }

    const payload = request.body;
    request.log.info({ payload, requestId: request.id }, 'Webhook: Received payload:');

    // 2. Identify event type and entity ID (highly dependent on Dolibarr's webhook structure)
    // This is a placeholder structure - you MUST adapt it to what Dolibarr actually sends.
    const entity = payload.entity; // e.g., "product", "thirdparty", "category"
    const action = payload.action; // e.g., "create", "update", "delete"
    const entityId = payload.id || payload.object_id || payload.rowid; // ID of the affected object

    if (!entity || !action || !entityId) {
      request.log.warn({ payload, requestId: request.id }, 'Webhook: Payload missing entity, action, or ID.');
      reply.code(400).send({ error: 'Invalid payload structure' });
      return;
    }

    try {
      const logMeta = { entity, action, entityId, requestId: request.id };
      if (entity === 'product') {
        if (action === 'create' || action === 'update' || action === 'modify') { // 'modify' is common too
          request.log.info(logMeta, `Webhook: Processing product event`);
          const productDetails = await dolibarrApiService.getProductById(entityId);
          if (productDetails) {
            await upsertProductFromDolibarrData(productDetails); // This uses its own logger
          } else {
            request.log.warn(logMeta, `Webhook: Product ID not found via API after webhook.`);
          }
        } else if (action === 'delete') {
          request.log.info(logMeta, `Webhook: Received delete for product. Deletion handling not yet implemented.`);
        }
      } else if (entity === 'category') {
         if (action === 'create' || action === 'update' || action === 'modify') {
          request.log.info(logMeta, `Webhook: Processing category event`);
          const categoryDetails = await dolibarrApiService.getCategoryById(entityId);
           if (categoryDetails) {
            await upsertCategoryFromDolibarrData(categoryDetails); // This uses its own logger
          } else {
            request.log.warn(logMeta, `Webhook: Category ID not found via API after webhook.`);
          }
        } else if (action === 'delete') {
          request.log.info(logMeta, `Webhook: Received delete for category. Deletion handling not yet implemented.`);
        }
      } else if (entity === 'stock' || entity === 'product_stock') {
        if (action === 'update' || action === 'modify' || action === 'stock_decrease' || action === 'stock_increase') {
          request.log.info(logMeta, `Webhook: Processing stock event`);
          const dolibarrProductId = entityId; // This is an assumption, payload structure is key
          // const stockDataFromApi = await dolibarrApiService.getProductStock(dolibarrProductId);
          // const stockEntriesToProcess = Array.isArray(stockDataFromApi) ? stockDataFromApi : (stockDataFromApi ? [stockDataFromApi] : []);
          request.log.info(logMeta, `Webhook: Stock event for product ${dolibarrProductId}. Further processing to update local stock_levels table is needed here.`);
          // TODO: Implement detailed upsert logic for stock_levels
        }
      } else {
        request.log.info(logMeta, `Webhook: Received event for unhandled entity or action.`);
      }

      reply.code(200).send({ status: 'success', message: 'Webhook processed' });
    } catch (error) {
      request.log.error({ err: error, payload, requestId: request.id }, 'Webhook: Error processing event');
      // Reply with 500 so Dolibarr might retry (if it supports retries)
      // The global error handler will also catch this if we re-throw, but replying here is fine.
      reply.code(500).send({ error: 'Internal Server Error while processing webhook' });
    }
  });
}

export default webhookRoutes;
