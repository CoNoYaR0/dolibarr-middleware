import dolibarrApi from './dolibarrApiService.js';
import db from './dbService.js';
import config from '../config/index.js';
// import s3Service from './s3Service.js'; // No longer needed for OVH strategy
import path from 'path'; // Still useful for filename extraction
import logger from '../utils/logger.js';

// --- Transformation Functions ---

function transformCategory(dolibarrCategory) {
  return {
    dolibarr_category_id: dolibarrCategory.id,
    name: dolibarrCategory.label || dolibarrCategory.name,
    description: dolibarrCategory.description,
    parent_dolibarr_category_id: dolibarrCategory.fk_parent || dolibarrCategory.parent_id,
    dolibarr_created_at: dolibarrCategory.date_creation || null,
    dolibarr_updated_at: dolibarrCategory.tms || null,
  };
}

function transformProduct(dolibarrProduct, categoryDolibarrToLocalIdMap) {
  let localCategoryId = null;
  if (dolibarrProduct.fk_categorie || dolibarrProduct.category_id) {
    const dolibarrCatId = parseInt(dolibarrProduct.fk_categorie || dolibarrProduct.category_id, 10);
    localCategoryId = categoryDolibarrToLocalIdMap.get(dolibarrCatId);
    if (!localCategoryId) {
      logger.warn({ dolibarrCatId, productId: dolibarrProduct.ref }, `Local category ID not found for Dolibarr category ID`);
    }
  }
  return {
    dolibarr_product_id: dolibarrProduct.id,
    sku: dolibarrProduct.ref,
    name: dolibarrProduct.label || dolibarrProduct.name,
    description: dolibarrProduct.description,
    long_description: dolibarrProduct.note_public || dolibarrProduct.long_description,
    price: parseFloat(dolibarrProduct.price) || 0,
    category_id: localCategoryId,
    is_active: !dolibarrProduct.status_tosell || parseInt(dolibarrProduct.status_tosell, 10) === 1,
    slug: dolibarrProduct.ref ? dolibarrProduct.ref.toLowerCase().replace(/[^a-z0-9]+/g, '-') : `product-${dolibarrProduct.id}`,
    dolibarr_created_at: dolibarrProduct.date_creation || null,
    dolibarr_updated_at: dolibarrProduct.tms || null,
  };
}

function transformVariant(dolibarrVariant, localProductId) {
  let attributesJson = {};
  if (Array.isArray(dolibarrVariant.attributes)) {
    dolibarrVariant.attributes.forEach(attr => {
      if (attr.code || attr.option) {
        attributesJson[attr.code || attr.option] = attr.value;
      }
    });
  } else if (typeof dolibarrVariant.attributes === 'object' && dolibarrVariant.attributes !== null) {
    attributesJson = dolibarrVariant.attributes;
  }
  return {
    dolibarr_variant_id: dolibarrVariant.id,
    product_id: localProductId,
    sku_variant: dolibarrVariant.ref || `${dolibarrVariant.parent_ref}-var-${dolibarrVariant.id}`,
    price_modifier: parseFloat(dolibarrVariant.price_var) || 0,
    attributes: attributesJson,
    dolibarr_created_at: dolibarrVariant.date_creation || null,
    dolibarr_updated_at: dolibarrVariant.tms || null,
  };
}

function transformProductImage(dolibarrImageInfo, localProductId, localVariantId, filenameFromDolibarr) {
  const sanitizedFilename = (filenameFromDolibarr || `placeholder_image_${Date.now()}.jpg`).replace(/[^a-zA-Z0-9._-]/g, '_');
  const cdnUrl = `${config.cdn.baseUrl}${sanitizedFilename}`; // config.cdn.baseUrl should end with a '/'

  return {
    product_id: localProductId,
    variant_id: localVariantId,
    s3_bucket: null, // Not used
    s3_key: null,    // Not used
    cdn_url: cdnUrl,
    alt_text: dolibarrImageInfo.alt || dolibarrImageInfo.label || sanitizedFilename,
    display_order: parseInt(dolibarrImageInfo.position, 10) || 0,
    is_thumbnail: dolibarrImageInfo.is_thumbnail || false,
    dolibarr_image_id: dolibarrImageInfo.id || dolibarrImageInfo.ref, // Dolibarr's image ID
    // Store original filename/path from Dolibarr if useful for the external PHP sync script
    original_dolibarr_filename: filenameFromDolibarr,
    original_dolibarr_path: dolibarrImageInfo.path || dolibarrImageInfo.filepath || dolibarrImageInfo.url_photo_absolute || dolibarrImageInfo.url,
  };
}

function transformStockLevel(dolibarrStockEntry, localProductId, localVariantId) {
  return {
    product_id: localProductId,
    variant_id: localVariantId,
    quantity: parseInt(dolibarrStockEntry.qty || dolibarrStockEntry.stock_reel || 0, 10),
    warehouse_id: dolibarrStockEntry.fk_warehouse || dolibarrStockEntry.warehouse_id || 'default',
    dolibarr_updated_at: dolibarrStockEntry.tms || dolibarrStockEntry.date_modification || new Date().toISOString(),
  };
}

// --- Sync Functions ---

async function syncCategories() {
  logger.info('Starting category synchronization...');
  let allCategories = [];
  let currentPage = 0;
  const limit = 100;
  try {
    while (true) {
      const params = { limit: limit, page: currentPage };
      const categoriesPage = await dolibarrApi.getCategories(params);
      if (!categoriesPage || categoriesPage.length === 0) break;
      allCategories = allCategories.concat(categoriesPage);
      if (categoriesPage.length < limit) break;
      currentPage++;
    }
    logger.info(`Fetched ${allCategories.length} categories.`);
    for (const item of allCategories) {
      const data = transformCategory(item);
      await db.query(
        `INSERT INTO categories (dolibarr_category_id, name, description, parent_dolibarr_category_id, dolibarr_created_at, dolibarr_updated_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (dolibarr_category_id) DO UPDATE SET
           name = EXCLUDED.name, description = EXCLUDED.description, parent_dolibarr_category_id = EXCLUDED.parent_dolibarr_category_id,
           dolibarr_created_at = EXCLUDED.dolibarr_created_at, dolibarr_updated_at = EXCLUDED.dolibarr_updated_at, updated_at = NOW()`,
        [data.dolibarr_category_id, data.name, data.description, data.parent_dolibarr_category_id, data.dolibarr_created_at, data.dolibarr_updated_at]
      );
    }
    logger.info('Category synchronization finished.');
  } catch (error) {
    logger.error({ err: error }, 'Error during category synchronization');
  }
}

async function syncProducts() {
  logger.info('Starting product synchronization...');
  const catMapRes = await db.query('SELECT dolibarr_category_id, id FROM categories WHERE dolibarr_category_id IS NOT NULL;');
  const catMap = new Map(catMapRes.rows.map(r => [r.dolibarr_category_id, r.id]));
  let allProducts = [];
  let currentPage = 0;
  const limit = 100;
  try {
    while (true) {
      const params = { limit: limit, page: currentPage };
      const productsPage = await dolibarrApi.getProducts(params);
      if (!productsPage || productsPage.length === 0) break;
      allProducts = allProducts.concat(productsPage);
      if (productsPage.length < limit) break;
      currentPage++;
    }
    logger.info(`Fetched ${allProducts.length} products.`);
    for (const item of allProducts) {
      const data = transformProduct(item, catMap);
      if (!data.dolibarr_product_id) continue;
      await db.query(
        `INSERT INTO products (dolibarr_product_id, sku, name, description, long_description, price, category_id, is_active, slug, dolibarr_created_at, dolibarr_updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT (dolibarr_product_id) DO UPDATE SET
           sku = EXCLUDED.sku, name = EXCLUDED.name, description = EXCLUDED.description, long_description = EXCLUDED.long_description,
           price = EXCLUDED.price, category_id = EXCLUDED.category_id, is_active = EXCLUDED.is_active, slug = EXCLUDED.slug,
           dolibarr_created_at = EXCLUDED.dolibarr_created_at, dolibarr_updated_at = EXCLUDED.dolibarr_updated_at, updated_at = NOW()`,
        [data.dolibarr_product_id, data.sku, data.name, data.description, data.long_description, data.price, data.category_id, data.is_active, data.slug, data.dolibarr_created_at, data.dolibarr_updated_at]
      );
    }
    logger.info('Product synchronization finished.');
  } catch (error) {
    logger.error({ err: error }, 'Error during product synchronization');
  }
}

async function syncProductVariants() {
  logger.info('Starting product variant synchronization...');
  const prodsRes = await db.query('SELECT id, dolibarr_product_id FROM products WHERE dolibarr_product_id IS NOT NULL;');
  if (prodsRes.rows.length === 0) { logger.info('No products to sync variants for.'); return; }
  for (const p of prodsRes.rows) {
    try {
      const variants = await dolibarrApi.getProductVariants(p.dolibarr_product_id);
      if (!variants || variants.length === 0) continue;
      for (const v of variants) {
        if (!v.id) continue;
        const data = transformVariant(v, p.id);
        await db.query(
          `INSERT INTO product_variants (dolibarr_variant_id, product_id, sku_variant, price_modifier, attributes, dolibarr_created_at, dolibarr_updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (dolibarr_variant_id) DO UPDATE SET
             product_id = EXCLUDED.product_id, sku_variant = EXCLUDED.sku_variant, price_modifier = EXCLUDED.price_modifier,
             attributes = EXCLUDED.attributes, dolibarr_created_at = EXCLUDED.dolibarr_created_at,
             dolibarr_updated_at = EXCLUDED.dolibarr_updated_at, updated_at = NOW()`,
          [data.dolibarr_variant_id, data.product_id, data.sku_variant, data.price_modifier, data.attributes, data.dolibarr_created_at, data.dolibarr_updated_at]
        );
      }
    } catch (error) {
      logger.error({ err: error, productId: p.dolibarr_product_id }, `Error syncing variants`);
    }
  }
  logger.info('Product variant synchronization finished.');
}

async function syncProductImageMetadata() { // Renamed from syncProductImages
  logger.info('Starting product image metadata synchronization (OVH CDN strategy)...');
  const productsResult = await db.query('SELECT id, dolibarr_product_id FROM products WHERE dolibarr_product_id IS NOT NULL;');
  if (productsResult.rows.length === 0) {
    logger.info('No products found to sync image metadata for.');
    return;
  }

  for (const product of productsResult.rows) {
    logger.info(`Fetching image metadata for Dolibarr product ID: ${product.dolibarr_product_id} (Local ID: ${product.id})`);
    try {
      const dolibarrProductData = await dolibarrApi.getProductById(product.dolibarr_product_id);
      const imagesToProcess = dolibarrProductData.photos || dolibarrProductData.images || [];

      if (!imagesToProcess || imagesToProcess.length === 0) {
        logger.info(`No image metadata found in Dolibarr data for product ID: ${product.dolibarr_product_id}`);
        continue;
      }
      logger.info(`Found ${imagesToProcess.length} potential image entries for product ID: ${product.dolibarr_product_id}`);

      for (const dolibarrImageInfo of imagesToProcess) {
        let filenameFromDolibarr = dolibarrImageInfo.filename;
        if (!filenameFromDolibarr) {
            const imageUrl = dolibarrImageInfo.url_photo_absolute || dolibarrImageInfo.url || dolibarrImageInfo.path || dolibarrImageInfo.filepath;
            if (imageUrl) {
                try {
                    filenameFromDolibarr = path.basename(new URL(imageUrl, config.dolibarr.apiUrl).pathname);
                } catch (e) {
                    logger.warn({ err: e, imageUrl, productId: product.dolibarr_product_id }, `Could not parse filename from URL for image.`);
                    filenameFromDolibarr = `image_${dolibarrImageInfo.id || Date.now()}${path.extname(imageUrl) || '.jpg'}`;
                }
            }
        }

        if (!filenameFromDolibarr) {
          logger.warn({ dolibarrImageInfo, productId: product.dolibarr_product_id }, `Skipping image due to missing filename in metadata`);
          continue;
        }

        try {
          const imageDataForDb = transformProductImage(
            dolibarrImageInfo, product.id, null, /* localVariantId if applicable */
            filenameFromDolibarr
          );

          // Using (product_id, dolibarr_image_id) as conflict target.
          // Ensure dolibarr_image_id is reliable and unique per product in your Dolibarr setup.
          // If not, (product_id, cdn_url) might be an alternative if cdn_urls are unique.
          const imageQueryText = `
            INSERT INTO product_images (
              product_id, variant_id, cdn_url, alt_text, display_order, is_thumbnail,
              dolibarr_image_id, original_dolibarr_filename, original_dolibarr_path,
              s3_bucket, s3_key
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NULL, NULL)
            ON CONFLICT (product_id, dolibarr_image_id)
            DO UPDATE SET
              cdn_url = EXCLUDED.cdn_url,
              alt_text = EXCLUDED.alt_text,
              display_order = EXCLUDED.display_order,
              is_thumbnail = EXCLUDED.is_thumbnail,
              original_dolibarr_filename = EXCLUDED.original_dolibarr_filename,
              original_dolibarr_path = EXCLUDED.original_dolibarr_path,
              updated_at = NOW()
            RETURNING id;
          `;

          if (!imageDataForDb.dolibarr_image_id) {
            logger.warn({imageDataForDb, productId: product.dolibarr_product_id}, "Attempting to insert image metadata without a dolibarr_image_id. Conflict resolution might not work as expected.");
            // Fallback: insert without conflict or use different conflict target like cdn_url if dolibarr_image_id is missing
            // For now, this will fail if dolibarr_image_id is null and product_id already has an image with null dolibarr_image_id
            // and your DB has a unique constraint like that (which it doesn't by default on (product_id, null)).
            // Best to ensure dolibarr_image_id is always populated.
          }

          await db.query(imageQueryText, [
            imageDataForDb.product_id, imageDataForDb.variant_id, imageDataForDb.cdn_url,
            imageDataForDb.alt_text, imageDataForDb.display_order, imageDataForDb.is_thumbnail,
            imageDataForDb.dolibarr_image_id, imageDataForDb.original_dolibarr_filename, imageDataForDb.original_dolibarr_path,
          ]);
          logger.info({ cdnUrl: imageDataForDb.cdn_url, productId: product.dolibarr_product_id }, `Upserted image metadata`);
        } catch (dbUpsertError) {
          logger.error({ err: dbUpsertError, filenameFromDolibarr, productId: product.dolibarr_product_id }, `Error upserting image metadata`);
        }
      }
    } catch (error) {
      logger.error({ err: error, productId: product.dolibarr_product_id }, `Error fetching image metadata`);
    }
  }
  logger.info('Product image metadata synchronization finished.');
}


async function syncStockLevels() {
  logger.info('Starting stock level synchronization...');
  const prodsRes = await db.query('SELECT p.id as local_product_id, p.dolibarr_product_id, pv.id as local_variant_id, pv.dolibarr_variant_id FROM products p LEFT JOIN product_variants pv ON p.id = pv.product_id WHERE p.dolibarr_product_id IS NOT NULL;');
  if (prodsRes.rows.length === 0) { logger.info('No products/variants to sync stock for.'); return; }
  const varMap = new Map(prodsRes.rows.filter(r => r.dolibarr_variant_id).map(r => [r.dolibarr_variant_id, r.local_variant_id]));
  const uniqProdIds = [...new Set(prodsRes.rows.map(r => r.dolibarr_product_id))];
  for (const dlbProdId of uniqProdIds) {
    try {
      const stockApiData = await dolibarrApi.getProductStock(dlbProdId);
      const entries = Array.isArray(stockApiData) ? stockApiData : (stockApiData ? [stockApiData] : []);
      if (entries.length === 0) continue;
      for (const entry of entries) {
        let locProdId = null; let locVarId = null;
        if (entry.fk_product_fils || entry.variant_id) {
          const dlbVarId = parseInt(entry.fk_product_fils || entry.variant_id, 10);
          locVarId = varMap.get(dlbVarId);
          if (!locVarId) { logger.warn({dlbVarId}, "Local variant ID not found for Dolibarr variant ID in stock entry. Skipping."); continue; }
          const pRow = prodsRes.rows.find(r => r.local_variant_id === locVarId);
          if (pRow) locProdId = pRow.local_product_id; // product_id in stock_levels can be null if variant_id is set
        } else {
          const pRow = prodsRes.rows.find(r => r.dolibarr_product_id === dlbProdId && !r.dolibarr_variant_id);
          if (pRow) locProdId = pRow.local_product_id; else { logger.warn({dlbProdId}, "Base product not found for stock entry. Skipping."); continue; }
        }
        if (!locProdId && !locVarId) { logger.warn({entry}, "Could not determine local product/variant for stock. Skipping."); continue; }
        const data = transformStockLevel(entry, locProdId, locVarId);
        await db.query(
          `INSERT INTO stock_levels (product_id, variant_id, quantity, warehouse_id, dolibarr_updated_at, last_checked_at)
           VALUES ($1, $2, $3, $4, $5, NOW())
           ON CONFLICT (product_id, variant_id, warehouse_id) DO UPDATE SET
             quantity = EXCLUDED.quantity, dolibarr_updated_at = EXCLUDED.dolibarr_updated_at,
             last_checked_at = NOW(), updated_at = NOW()`,
          [data.product_id, data.variant_id, data.quantity, data.warehouse_id, data.dolibarr_updated_at]
        );
      }
    } catch (error) {
      logger.error({ err: error, productId: dlbProdId }, `Error syncing stock`);
    }
  }
  logger.info('Stock level synchronization finished.');
}

// --- Main Sync Orchestrator ---

async function runInitialSync() {
  logger.info('=== Starting Full Initial Data Synchronization ===');
  await syncCategories();
  await syncProducts();
  await syncProductVariants();
  await syncProductImageMetadata(); // Renamed
  await syncStockLevels();
  logger.info('=== Full Initial Data Synchronization Finished ===');
}

export default {
  runInitialSync,
  syncCategories,
  syncProducts,
  syncProductVariants,
  syncProductImageMetadata, // Renamed
  syncStockLevels,
  // Exporting transform functions for testing or other potential uses
  transformCategory,
  transformProduct,
  transformVariant,
  transformProductImage,
  transformStockLevel,
};
