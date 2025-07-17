import dolibarrApi from './dolibarrApiService.js';
import db from './dbService.js';
import config from '../config/index.js';
import logger from '../utils/logger.js';
import categoryController from '../controllers/categoryController.js';
import productController from '../controllers/productController.js';
import dolibarrApiService from './dolibarrApiService.js';

// --- Transformation Functions ---

function transformCategory(dolibarrCategory) {
  return {
    dolibarr_category_id: dolibarrCategory.id,
    name: dolibarrCategory.label || dolibarrCategory.name,
    description: dolibarrCategory.description,
    parent_dolibarr_category_id: dolibarrCategory.fk_parent || dolibarrCategory.parent_id,
    dolibarr_created_at: dolibarrCategory.date_creation ? new Date(parseInt(dolibarrCategory.date_creation, 10) * 1000) : null,
    dolibarr_updated_at: dolibarrCategory.tms ? new Date(parseInt(dolibarrCategory.tms, 10) * 1000) : null,
  };
}

function transformProduct(dolibarrProduct) { // categoryDolibarrToLocalIdMap no longer needed here
  return {
    dolibarr_product_id: dolibarrProduct.id,
    sku: dolibarrProduct.ref,
    name: dolibarrProduct.label || dolibarrProduct.name,
    description: dolibarrProduct.description,
    long_description: dolibarrProduct.note_public || dolibarrProduct.long_description,
    price: parseFloat(dolibarrProduct.price) || 0,
    // category_id removed - will be handled by product_categories_map
    is_active: !dolibarrProduct.status_tosell || parseInt(dolibarrProduct.status_tosell, 10) === 1,
    slug: dolibarrProduct.ref ? dolibarrProduct.ref.toLowerCase().replace(/[^a-z0-9]+/g, '-') : `product-${dolibarrProduct.id}`,
    dolibarr_created_at: dolibarrProduct.date_creation ? new Date(parseInt(dolibarrProduct.date_creation, 10) * 1000) : null,
    dolibarr_updated_at: dolibarrProduct.tms ? new Date(parseInt(dolibarrProduct.tms, 10) * 1000) : null,
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
    dolibarr_created_at: dolibarrVariant.date_creation ? new Date(parseInt(dolibarrVariant.date_creation, 10) * 1000) : null,
    dolibarr_updated_at: dolibarrVariant.tms ? new Date(parseInt(dolibarrVariant.tms, 10) * 1000) : null,
  };
}

function transformProductImage(dolibarrImageInfo, localProductId, localVariantId, filenameFromDolibarr) {
  const sanitizedFilename = (filenameFromDolibarr || `placeholder_image_${Date.now()}.jpg`).replace(/[^a-zA-Z0-9._-]/g, '_');
  const cdnUrl = `${config.cdn.baseUrl}${sanitizedFilename}`;
  return {
    product_id: localProductId,
    variant_id: localVariantId,
    s3_bucket: null,
    s3_key: null,
    cdn_url: cdnUrl,
    alt_text: dolibarrImageInfo.alt || dolibarrImageInfo.label || sanitizedFilename,
    display_order: parseInt(dolibarrImageInfo.position, 10) || 0,
    is_thumbnail: dolibarrImageInfo.is_thumbnail || false,
    dolibarr_image_id: dolibarrImageInfo.id || dolibarrImageInfo.ref,
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
    dolibarr_updated_at: (dolibarrStockEntry.tms || dolibarrStockEntry.date_modification) ? new Date(parseInt(dolibarrStockEntry.tms || dolibarrStockEntry.date_modification, 10) * 1000) : new Date(),
  };
}

// --- Sync Functions ---

async function syncCategories() {
  logger.info('[SYNC] Starting category synchronization...');
  let allCategories = [];
  let currentPage = 0;
  const limit = 100;
  try {
    while (true) {
      const params = { limit: limit, page: currentPage };
      logger.info(`[SYNC] Fetching categories from Dolibarr... Page: ${currentPage}`);
      const categoriesPage = await dolibarrApi.getCategories(params);
      if (!categoriesPage || categoriesPage.length === 0) break;
      allCategories = allCategories.concat(categoriesPage);
      if (categoriesPage.length < limit) break;
      currentPage++;
    }
    logger.info(`[SYNC] Fetched ${allCategories.length} categories.`);
    for (const item of allCategories) {
      const data = transformCategory(item);
      logger.info(`[SYNC] Writing category ${data.name} to Supabase...`);
      await db.query(
        `INSERT INTO categories (dolibarr_category_id, name, description, parent_dolibarr_category_id, dolibarr_created_at, dolibarr_updated_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (dolibarr_category_id) DO UPDATE SET
           name = EXCLUDED.name, description = EXCLUDED.description, parent_dolibarr_category_id = EXCLUDED.parent_dolibarr_category_id,
           dolibarr_created_at = EXCLUDED.dolibarr_created_at, dolibarr_updated_at = EXCLUDED.dolibarr_updated_at, updated_at = NOW()`,
        [data.dolibarr_category_id, data.name, data.description, data.parent_dolibarr_category_id, data.dolibarr_created_at, data.dolibarr_updated_at]
      );
      logger.info(`[SYNC] Category ${data.name} synchronized successfully.`);
    }
    logger.info('[SYNC] Category synchronization finished.');
  } catch (error) {
    logger.error({ err: error }, '[SYNC] Error during category synchronization');
  }
}

async function syncProducts() {
  logger.info('[SYNC] Starting product synchronization...');
  const catMapRes = await db.query('SELECT dolibarr_category_id, id FROM categories WHERE dolibarr_category_id IS NOT NULL;');
  const catMap = new Map(catMapRes.rows.map(r => [parseInt(r.dolibarr_category_id, 10), r.id]));
  logger.info({ catMapContent: Array.from(catMap.entries()) }, '[SYNC] Category map created:');
  let allProducts = [];
  let currentPage = 0;
  const limit = 100;
  try {
    while (true) {
      const params = { limit: limit, page: currentPage, sqlfilters: 't.tosell = 1' };
      logger.info(`[SYNC] Fetching products from Dolibarr... Page: ${currentPage}`);
      const productsPage = await dolibarrApi.getProducts(params);
      if (!productsPage || productsPage.length === 0) break;
      allProducts = allProducts.concat(productsPage);
      if (productsPage.length < limit) break;
      currentPage++;
    }
    logger.info(`[SYNC] Fetched ${allProducts.length} products.`);
    for (const dolibarrProductData of allProducts) {
      logger.info(`[SYNC] Processing product ${dolibarrProductData.label}...`);
      logger.info({ productId: dolibarrProductData.id, ref: dolibarrProductData.ref, fk_categorie: dolibarrProductData.fk_categorie, api_category_id: dolibarrProductData.category_id }, '[SYNC] Raw product category fields from API:');

      const productToInsert = transformProduct(dolibarrProductData); // Pass only dolibarrProductData
      if (!productToInsert.dolibarr_product_id) continue;

      logger.info(`[SYNC] Writing product ${productToInsert.name} to Supabase...`);
      const { rows: insertedProductRows } = await db.query(
        `INSERT INTO products (dolibarr_product_id, sku, name, description, long_description, price, is_active, slug, dolibarr_created_at, dolibarr_updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (dolibarr_product_id) DO UPDATE SET
           sku = EXCLUDED.sku, name = EXCLUDED.name, description = EXCLUDED.description, long_description = EXCLUDED.long_description,
           price = EXCLUDED.price, is_active = EXCLUDED.is_active, slug = EXCLUDED.slug,
           dolibarr_created_at = EXCLUDED.dolibarr_created_at, dolibarr_updated_at = EXCLUDED.dolibarr_updated_at, updated_at = NOW()
         RETURNING id, dolibarr_product_id;`,
        [productToInsert.dolibarr_product_id, productToInsert.sku, productToInsert.name, productToInsert.description, productToInsert.long_description, productToInsert.price, productToInsert.is_active, productToInsert.slug, productToInsert.dolibarr_created_at, productToInsert.dolibarr_updated_at]
      );

      if (insertedProductRows && insertedProductRows.length > 0) {
        const localProductId = insertedProductRows[0].id;
        const currentDolibarrProductId = insertedProductRows[0].dolibarr_product_id;
        logger.info(`[SYNC] Product ${productToInsert.name} synchronized successfully.`);

        await db.query('DELETE FROM product_categories_map WHERE product_id = $1', [localProductId]);
        logger.info({ localProductId }, `[SYNC] Cleared existing category links for product.`);

        try {
          logger.info(`[SYNC] Fetching categories for product ${productToInsert.name}...`);
          const productCategoriesArray = await dolibarrApi.getProductCategories(currentDolibarrProductId);
          logger.info({ productId: currentDolibarrProductId, fetchedCategories: productCategoriesArray }, '[SYNC] Categories fetched for product:');

          if (productCategoriesArray && productCategoriesArray.length > 0) {
            for (const productDolibarrCategory of productCategoriesArray) {
              if (productDolibarrCategory && productDolibarrCategory.id) {
                const localCatId = catMap.get(parseInt(productDolibarrCategory.id, 10));
                if (localCatId) {
                  logger.info(`[SYNC] Linking product ${productToInsert.name} to category ${productDolibarrCategory.label}...`);
                  await db.query(
                    'INSERT INTO product_categories_map (product_id, category_id) VALUES ($1, $2) ON CONFLICT (product_id, category_id) DO NOTHING',
                    [localProductId, localCatId]
                  );
                  logger.info({ productId: currentDolibarrProductId, localProductId, dolibarrCategoryId: productDolibarrCategory.id, localCategoryId: localCatId }, '[SYNC] Linked product to category in map table.');
                } else {
                  logger.warn({ productId: currentDolibarrProductId, dolibarrCategoryId: productDolibarrCategory.id }, '[SYNC] Local category mapping not found for product category.');
                }
              } else {
                logger.info({ productId: currentDolibarrProductId, categoryItem: productDolibarrCategory }, '[SYNC] No valid category ID found in productCategoriesArray item.');
              }
            }
          } else {
            logger.info({ productId: currentDolibarrProductId }, '[SYNC] No categories returned by getProductCategories for this product.');
          }
        } catch (catError) {
          logger.error({ err: catError, productId: currentDolibarrProductId }, `[SYNC] Error fetching or linking categories for product.`);
        }
      }
    }
    logger.info('[SYNC] Product synchronization finished.');
  } catch (error) {
    logger.error({ err: error }, '[SYNC] Error during product synchronization');
  }
}

async function syncProductVariants() {
  logger.info('[SYNC] Starting product variant synchronization...');
  const prodsRes = await db.query('SELECT id, dolibarr_product_id FROM products WHERE dolibarr_product_id IS NOT NULL;');
  if (prodsRes.rows.length === 0) { logger.info('[SYNC] No products to sync variants for.'); return; }
  for (const p of prodsRes.rows) {
    try {
      logger.info(`[SYNC] Fetching variants for product ${p.dolibarr_product_id}...`);
      const variants = await dolibarrApi.getProductVariants(p.dolibarr_product_id);
      if (!variants || variants.length === 0) continue;
      logger.info(`[SYNC] Found ${variants.length} variants for product ${p.dolibarr_product_id}.`);
      for (const v of variants) {
        if (!v.id) continue;
        const data = transformVariant(v, p.id);
        logger.info(`[SYNC] Writing variant ${data.sku_variant} to Supabase...`);
        await db.query(
          `INSERT INTO product_variants (dolibarr_variant_id, product_id, sku_variant, price_modifier, attributes, dolibarr_created_at, dolibarr_updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (dolibarr_variant_id) DO UPDATE SET
             product_id = EXCLUDED.product_id, sku_variant = EXCLUDED.sku_variant, price_modifier = EXCLUDED.price_modifier,
             attributes = EXCLUDED.attributes, dolibarr_created_at = EXCLUDED.dolibarr_created_at,
             dolibarr_updated_at = EXCLUDED.dolibarr_updated_at, updated_at = NOW()`,
          [data.dolibarr_variant_id, data.product_id, data.sku_variant, data.price_modifier, data.attributes, data.dolibarr_created_at, data.dolibarr_updated_at]
        );
        logger.info(`[SYNC] Variant ${data.sku_variant} synchronized successfully.`);
      }
    } catch (error) {
      logger.error({ err: error, productId: p.dolibarr_product_id }, `[SYNC] Error syncing variants`);
    }
  }
  logger.info('[SYNC] Product variant synchronization finished.');
}

async function syncProductImageMetadata() {
  logger.info('[SYNC] Starting product image metadata synchronization...');
  const productsResult = await db.query('SELECT id, dolibarr_product_id FROM products WHERE dolibarr_product_id IS NOT NULL;');
  if (productsResult.rows.length === 0) {
    logger.info('[SYNC] No products found to sync image metadata for.');
    return;
  }

  for (const product of productsResult.rows) {
    logger.info(`[SYNC] Fetching image metadata for Dolibarr product ID: ${product.dolibarr_product_id} (Local ID: ${product.id})`);
    try {
      const dolibarrProductData = await dolibarrApi.getProductById(product.dolibarr_product_id);
      logger.info({ dolibarrProductData }, '[SYNC] Dolibarr product data:');
      const imagesToProcess = dolibarrProductData.photos || dolibarrProductData.images || [];
      logger.info({ imagesToProcess }, '[SYNC] Images to process:');

      if (!imagesToProcess || imagesToProcess.length === 0) {
        logger.info(`[SYNC] No image metadata found in Dolibarr data for product ID: ${product.dolibarr_product_id}`);
        continue;
      }
      logger.info(`[SYNC] Found ${imagesToProcess.length} potential image entries for product ID: ${product.dolibarr_product_id}`);

      for (const dolibarrImageInfo of imagesToProcess) {
        logger.info({ dolibarrImageInfo }, '[SYNC] Processing image...');
        let filenameFromDolibarr = dolibarrImageInfo.relativename;
        if (!filenameFromDolibarr) {
          filenameFromDolibarr = dolibarrImageInfo.filename;
        }

        if (!filenameFromDolibarr) {
          logger.warn({ dolibarrImageInfo, productId: product.dolibarr_product_id }, `[SYNC] Skipping image due to missing filename in metadata`);
          continue;
        }

        try {
          const cdnUrl = `${config.cdn.baseUrl}${filenameFromDolibarr}`;
          const imageDataForDb = transformProductImage(
            dolibarrImageInfo, product.id, null,
            filenameFromDolibarr
          );
          imageDataForDb.cdn_url = cdnUrl;
          logger.info(`[SYNC] Writing image ${cdnUrl} to Supabase...`);

          const imageQueryText = `
            INSERT INTO product_images (
              product_id, variant_id, cdn_url, alt_text, display_order, is_thumbnail,
              dolibarr_image_id, original_dolibarr_filename, original_dolibarr_path,
              s3_bucket, s3_key
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NULL, NULL)
            ON CONFLICT (product_id, original_dolibarr_filename)
            DO UPDATE SET
              cdn_url = EXCLUDED.cdn_url,
              alt_text = EXCLUDED.alt_text,
              display_order = EXCLUDED.display_order,
              is_thumbnail = EXCLUDED.is_thumbnail,
              original_dolibarr_path = EXCLUDED.original_dolibarr_path,
              updated_at = NOW()
            RETURNING id;
          `;

          await db.query(imageQueryText, [
            imageDataForDb.product_id, imageDataForDb.variant_id, imageDataForDb.cdn_url,
            imageDataForDb.alt_text, imageDataForDb.display_order, imageDataForDb.is_thumbnail,
            imageDataForDb.dolibarr_image_id, imageDataForDb.original_dolibarr_filename, imageDataForDb.original_dolibarr_path,
          ]);
          logger.info({ cdnUrl: imageDataForDb.cdn_url, productId: product.dolibarr_product_id }, `[SYNC] Upserted image metadata`);
        } catch (dbUpsertError) {
          logger.error({ err: dbUpsertError, filenameFromDolibarr, productId: product.dolibarr_product_id }, `[SYNC] Error upserting image metadata`);
        }
      }
    } catch (error) {
      logger.error({ err: error, productId: product.dolibarr_product_id }, `[SYNC] Error fetching image metadata`);
    }
  }
  logger.info('[SYNC] Product image metadata synchronization finished.');
}


async function syncStockLevels() {
  logger.info('[SYNC] Starting stock level synchronization...');
  const prodsRes = await db.query('SELECT p.id as local_product_id, p.dolibarr_product_id, pv.id as local_variant_id, pv.dolibarr_variant_id FROM products p LEFT JOIN product_variants pv ON p.id = pv.product_id WHERE p.dolibarr_product_id IS NOT NULL;');
  if (prodsRes.rows.length === 0) { logger.info('[SYNC] No products/variants to sync stock for.'); return; }

  logger.info({ productsFromDB: prodsRes.rows }, '[SYNC] Products available for stock mapping:');

  const uniqProdIds = [...new Set(prodsRes.rows.map(r => r.dolibarr_product_id))];

  for (const dlbProdId of uniqProdIds) {
    try {
      logger.info(`[SYNC] Fetching stock for product ${dlbProdId}...`);
      const stockApiData = await dolibarrApi.getProductStock(dlbProdId);
      logger.info({ dlbProdId, stockApiDataFromDolibarr: stockApiData }, '[SYNC] Raw stock API data received:');

      if (!stockApiData || !stockApiData.stock_warehouses || Object.keys(stockApiData.stock_warehouses).length === 0) {
        logger.info({ dlbProdId }, '[SYNC] No stock_warehouses data or empty stock_warehouses for product.');
        continue;
      }

      for (const warehouseId in stockApiData.stock_warehouses) {
        const stockDetail = stockApiData.stock_warehouses[warehouseId];

        const syntheticEntry = {
          qty: stockDetail.real,
          fk_warehouse: warehouseId,
          tms: stockApiData.tms || null
        };

        let locProdId = null;
        let locVarId = null;

        const productRecord = prodsRes.rows.find(
          r => String(r.dolibarr_product_id) === String(dlbProdId)
        );

        if (productRecord) {
          if (productRecord.dolibarr_variant_id) {
            locVarId = productRecord.local_variant_id;
            locProdId = productRecord.local_product_id;
          } else {
            locProdId = productRecord.local_product_id;
          }
        } else {
          logger.warn({ dlbProdId }, "[SYNC] Dolibarr Product ID for stock entry not found in local product/variant map. Skipping warehouse entry.");
          continue;
        }

        const data = transformStockLevel(syntheticEntry, locProdId, locVarId);
        logger.info(`[SYNC] Writing stock for product ${dlbProdId} to Supabase...`);
        await db.query(
          `INSERT INTO stock_levels (product_id, variant_id, quantity, warehouse_id, dolibarr_updated_at, last_checked_at)
           VALUES ($1, $2, $3, $4, $5, NOW())
           ON CONFLICT (product_id, variant_id, warehouse_id) DO UPDATE SET
             quantity = EXCLUDED.quantity, dolibarr_updated_at = EXCLUDED.dolibarr_updated_at,
             last_checked_at = NOW(), updated_at = NOW()`,
          [data.product_id, data.variant_id, data.quantity, data.warehouse_id, data.dolibarr_updated_at]
        );
        logger.info(`[SYNC] Stock for product ${dlbProdId} synchronized successfully.`);
      }
    } catch (error) {
      if (!error.status || error.status !== 404) {
        logger.error({ err: error, productId: dlbProdId }, `[SYNC] Error processing stock for product`);
      }
    }
  }
  logger.info('[SYNC] Stock level synchronization finished.');
}

// --- Main Sync Orchestrator ---

async function runInitialSync() {
  try {
    logger.info('[SYNC] === Starting Full Initial Data Synchronization ===');
    await syncCategories();
    await syncProducts();
    await syncProductVariants();
    await syncProductImageMetadata();
    await syncStockLevels();
    logger.info('[SYNC] === Full Initial Data Synchronization Finished ===');
  } catch (error) {
    logger.error({ err: error }, '[SYNC] === Full Initial Data Synchronization Failed ===');
    process.exit(1);
  }
}

export default {
  runInitialSync,
  // Initial sync functions
  syncCategories,
  syncProducts,
  syncProductVariants,
  syncProductImageMetadata,
  syncStockLevels,
  // Transformation functions
  transformCategory,
  transformProduct,
  transformVariant,
  transformProductImage,
  transformStockLevel,
  // Specific webhook handlers
  handleProductCreate,
  handleProductModify,
  handleProductDelete,
  handleCategoryCreate,
  handleCategoryModify,
  handleCategoryDelete,
  handleStockMovement,
  // Helper sync functions for webhooks
  syncProductStockByDolibarrId,
  syncProductVariantsByDolibarrId,
  // Main webhook dispatcher
  handleWebhook,
};

// --- Webhook Processing Logic ---

async function handleProductCreate(objectData, eventLogger) {
  eventLogger.info({ dolibarrProductId: objectData.id, data: objectData }, 'EVENT: PRODUCT_CREATE received. Processing...');
  try {
    const transformedData = transformProduct(objectData); // transformProduct is already defined

    // Add/Upsert the product
    const product = await productController.addProduct(transformedData, eventLogger);
    if (!product || !product.id) {
      eventLogger.error({ dolibarrProductId: objectData.id }, 'Failed to add/update product in DB or did not return product ID.');
      // Consider throwing an error here if product creation is critical for subsequent steps
      return;
    }
    const localProductId = product.id;
    const dolibarrProductId = product.dolibarr_product_id; // Use the ID from the DB record

    eventLogger.info({ localProductId, dolibarrProductId }, 'Product added/updated in DB.');

    // Fetch and link categories
    try {
      const categoriesFromApi = await dolibarrApiService.getProductCategories(dolibarrProductId);
      eventLogger.info({ dolibarrProductId, categoriesFromApi }, 'Categories fetched from API for new product.');
      const dolibarrCategoryIdsToLink = categoriesFromApi
        .map(cat => cat.id)
        .filter(id => id != null && id !== undefined && String(id).trim() !== "");

      if (dolibarrCategoryIdsToLink.length > 0) {
        await productController.linkProductToCategories(localProductId, dolibarrCategoryIdsToLink, eventLogger);
        eventLogger.info({ localProductId, dolibarrCategoryIdsToLink }, 'Product categories linked.');
      } else {
        eventLogger.info({ localProductId, dolibarrProductId }, 'No categories returned from API to link for this product, or all IDs were invalid.');
      }
    } catch (catError) {
      eventLogger.error({ err: catError, localProductId, dolibarrProductId }, 'Error fetching or linking product categories for PRODUCT_CREATE.');
      // Non-fatal for now, product is created, categories can be fixed by a modify event or full sync
    }

    // Sync variants
    try {
      await syncProductVariantsByDolibarrId(dolibarrProductId, localProductId, eventLogger);
    } catch (variantError) {
      eventLogger.error({ err: variantError, dolibarrProductId, localProductId }, 'Error during variant sync in PRODUCT_CREATE. Product created/updated, categories linked.');
      // Non-fatal for the main product creation flow
    }

    // TODO (Step 4 - already done, but good to keep track): Call stock sync: await syncProductStockByDolibarrId(dolibarrProductId, eventLogger);
    // Actually, stock sync should also be called here for a new product
    try {
      await syncProductStockByDolibarrId(dolibarrProductId, eventLogger); // Ensure this is called after product exists
    } catch (stockError) {
      eventLogger.error({ err: stockError, dolibarrProductId, localProductId }, 'Error during stock sync in PRODUCT_CREATE.');
    }


    eventLogger.info({ dolibarrProductId: objectData.id, localProductId }, 'PRODUCT_CREATE processing finished.');

  } catch (error) {
    eventLogger.error({ err: error, dolibarrProductId: objectData.id }, 'Error processing PRODUCT_CREATE');
    throw error; // Re-throw to be caught by the main webhook handler
  }
}

async function handleProductModify(objectData, eventLogger) {
  eventLogger.info({ dolibarrProductId: objectData.id, data: objectData }, 'EVENT: PRODUCT_MODIFY received. Processing...');
  try {
    const dolibarrProductId = objectData.id;
    const transformedData = transformProduct(objectData);

    // Attempt to update the product.
    let product = await productController.updateProductByDolibarrId(dolibarrProductId, transformedData, eventLogger);

    if (!product) {
      // Product not found by dolibarrProductId for update.
      // This could mean it's a new product not yet synced or was deleted.
      // Try an upsert (addProduct handles ON CONFLICT DO UPDATE).
      eventLogger.warn({ dolibarrProductId }, 'Product not found for update. Attempting to upsert (create or update if exists).');
      product = await productController.addProduct(transformedData, eventLogger);
      if (!product) {
        eventLogger.error({ dolibarrProductId }, 'Failed to update or add product in DB for PRODUCT_MODIFY after initial update attempt failed.');
        return; // Critical failure if product cannot be established in DB
      }
    }

    const localProductId = product.id; // ID from our database

    eventLogger.info({ localProductId, dolibarrProductId }, 'Product ensured/updated in DB.');

    // Re-fetch, clear, and link categories
    try {
      eventLogger.info({ localProductId }, 'Clearing existing category links for product modification.');
      await productController.clearProductCategoryLinks(localProductId, eventLogger);

      const categoriesFromApi = await dolibarrApiService.getProductCategories(dolibarrProductId);
      eventLogger.info({ dolibarrProductId, categoriesFromApi }, 'Categories fetched from API for modified product.');
      const dolibarrCategoryIdsToLink = categoriesFromApi
        .map(cat => cat.id)
        .filter(id => id != null && id !== undefined && String(id).trim() !== "");

      if (dolibarrCategoryIdsToLink.length > 0) {
        await productController.linkProductToCategories(localProductId, dolibarrCategoryIdsToLink, eventLogger);
        eventLogger.info({ localProductId, dolibarrCategoryIdsToLink }, 'Product categories re-linked.');
      } else {
         eventLogger.info({ localProductId, dolibarrProductId }, 'No categories returned from API to re-link for this product, or all IDs were invalid.');
      }
    } catch (catError) {
      eventLogger.error({ err: catError, localProductId, dolibarrProductId }, 'Error re-linking product categories for PRODUCT_MODIFY.');
      // Non-fatal for now.
    }

    // Sync variants
    try {
      await syncProductVariantsByDolibarrId(dolibarrProductId, localProductId, eventLogger);
    } catch (variantError) {
      eventLogger.error({ err: variantError, dolibarrProductId, localProductId }, 'Error during variant sync in PRODUCT_MODIFY. Product updated, categories re-linked.');
      // Non-fatal
    }

    // Sync stock
    try {
      await syncProductStockByDolibarrId(dolibarrProductId, eventLogger);
    } catch (stockError) {
      eventLogger.error({ err: stockError, dolibarrProductId, localProductId }, 'Error during stock sync in PRODUCT_MODIFY.');
    }

    eventLogger.info({ dolibarrProductId: objectData.id, localProductId }, 'PRODUCT_MODIFY processing finished.');

  } catch (error) {
    eventLogger.error({ err: error, dolibarrProductId: objectData.id }, 'Error processing PRODUCT_MODIFY');
    throw error;
  }
}

/**
 * Synchronizes product variants for a given Dolibarr product ID.
 * Fetches variants from Dolibarr API and uses productController to update them in the local DB.
 * @param {string|number} dolibarrProductId - The Dolibarr ID of the parent product.
 * @param {number} localProductId - The local ID of the parent product.
 * @param {object} eventLogger - The logger instance.
 */
async function syncProductVariantsByDolibarrId(dolibarrProductId, localProductId, eventLogger) {
  eventLogger.info({ dolibarrProductId, localProductId }, 'Starting variant sync for product.');
  try {
    const variantsFromApi = await dolibarrApiService.getProductVariants(dolibarrProductId);
    eventLogger.info({ dolibarrProductId, localProductId, count: variantsFromApi.length }, `Fetched ${variantsFromApi.length} variants from API.`);

    // productController.syncProductVariants expects the transformVariant function.
    // Pass the one defined in this service.
    await productController.syncProductVariants(localProductId, variantsFromApi, transformVariant, eventLogger);

    eventLogger.info({ dolibarrProductId, localProductId }, 'Variant sync for product finished.');
  } catch (error) {
    // Specific error handling for variants if needed (e.g., API 404 means no variants)
    if (error.isAxiosError && error.response && error.response.status === 404) {
        eventLogger.info({ dolibarrProductId, localProductId }, 'No variants found for product in Dolibarr (API returned 404). Existing local variants (if any) will be cleared by syncProductVariants.');
        // Call syncProductVariants with empty array to ensure local variants are cleared
        await productController.syncProductVariants(localProductId, [], transformVariant, eventLogger);
    } else {
        eventLogger.error({ err: error, dolibarrProductId, localProductId }, 'Error during product variant synchronization.');
        throw error; // Re-throw for other errors
    }
  }
}

async function handleProductDelete(objectData, eventLogger) {
  eventLogger.info({ dolibarrProductId: objectData.id }, 'EVENT: PRODUCT_DELETE received. Processing...');
  try {
    const dolibarrProductId = objectData.id;
    // productController.deleteProductByDolibarrId already logs internally
    const deletedProduct = await productController.deleteProductByDolibarrId(dolibarrProductId, eventLogger);

    if (deletedProduct) {
      eventLogger.info({ dolibarrProductId, deletedLocalId: deletedProduct.id }, 'PRODUCT_DELETE processing: Product confirmed deleted from DB.');
    } else {
      // This is not necessarily an error, product might have been deleted already by a previous event or manual action.
      eventLogger.warn({ dolibarrProductId }, 'PRODUCT_DELETE processing: Product not found in DB (might be already deleted).');
    }
  } catch (error) {
    eventLogger.error({ err: error, dolibarrProductId: objectData.id }, 'Error processing PRODUCT_DELETE');
    throw error;
  }
}

async function handleCategoryCreate(objectData, eventLogger) {
  eventLogger.info({ dolibarrCategoryId: objectData.id, data: objectData }, 'EVENT: CATEGORY_CREATE received. Processing...');
  try {
    const transformedData = transformCategory(objectData); // transformCategory is already defined

    let localParentId = null;
    if (transformedData.parent_dolibarr_category_id && transformedData.parent_dolibarr_category_id !== "0" && transformedData.parent_dolibarr_category_id !== 0) {
      const parentCategory = await categoryController.getCategoryByDolibarrId(transformedData.parent_dolibarr_category_id, eventLogger);
      if (parentCategory) {
        localParentId = parentCategory.id;
      } else {
        eventLogger.warn({ parentDolibarrId: transformedData.parent_dolibarr_category_id }, 'Parent category not found in local DB by Dolibarr ID. Setting parent_id to null.');
      }
    }

    const categoryPayload = {
      ...transformedData,
      parent_id: localParentId, // Add resolved local parent_id
    };

    await categoryController.addCategory(categoryPayload, eventLogger);
    eventLogger.info({ dolibarrCategoryId: objectData.id }, 'Category created/updated successfully.');

  } catch (error) {
    eventLogger.error({ err: error, dolibarrCategoryId: objectData.id }, 'Error processing CATEGORY_CREATE');
    throw error; // Re-throw to be caught by the main webhook handler
  }
}

async function handleCategoryModify(objectData, eventLogger) {
  eventLogger.info({ dolibarrCategoryId: objectData.id, data: objectData }, 'EVENT: CATEGORY_MODIFY received. Processing...');
  try {
    const transformedData = transformCategory(objectData);
    const dolibarrCategoryId = objectData.id;

    let localParentId = null;
    if (transformedData.parent_dolibarr_category_id && transformedData.parent_dolibarr_category_id !== "0" && transformedData.parent_dolibarr_category_id !== 0) {
      const parentCategory = await categoryController.getCategoryByDolibarrId(transformedData.parent_dolibarr_category_id, eventLogger);
      if (parentCategory) {
        localParentId = parentCategory.id;
      } else {
        eventLogger.warn({ parentDolibarrId: transformedData.parent_dolibarr_category_id }, 'Parent category not found in local DB for update. Setting parent_id to null.');
      }
    }

    const categoryPayload = {
      ...transformedData,
      parent_id: localParentId,
    };

    const updatedCategory = await categoryController.updateCategoryByDolibarrId(dolibarrCategoryId, categoryPayload, eventLogger);
    if (updatedCategory) {
      eventLogger.info({ dolibarrCategoryId }, 'Category updated successfully.');
    } else {
      eventLogger.warn({ dolibarrCategoryId }, 'Category not found for modification or no changes made.');
      // Optionally, treat as a create if not found (though addCategory with ON CONFLICT handles this better)
      // For now, if update fails to find, it's logged.
    }
  } catch (error) {
    eventLogger.error({ err: error, dolibarrCategoryId: objectData.id }, 'Error processing CATEGORY_MODIFY');
    throw error;
  }
}

async function handleCategoryDelete(objectData, eventLogger) {
  eventLogger.info({ dolibarrCategoryId: objectData.id }, 'EVENT: CATEGORY_DELETE received. Processing...');
  try {
    const dolibarrCategoryId = objectData.id;
    const deletedCategory = await categoryController.deleteCategoryByDolibarrId(dolibarrCategoryId, eventLogger);

    if (deletedCategory) {
      eventLogger.info({ dolibarrCategoryId }, 'Category deleted successfully.');
    } else {
      eventLogger.warn({ dolibarrCategoryId }, 'Category not found for deletion.');
    }
  } catch (error) {
    eventLogger.error({ err: error, dolibarrCategoryId: objectData.id }, 'Error processing CATEGORY_DELETE');
    throw error;
  }
}

async function handleStockMovement(objectData, eventLogger) {
  const dolibarrProductId = objectData.product_id;
  const warehouseIdHint = objectData.warehouse_id; // The specific warehouse that had movement
  const quantityChanged = objectData.qty;

  eventLogger.info({ dolibarrProductId, warehouseIdHint, quantityChanged }, 'EVENT: STOCK_MOVEMENT received. Initiating full stock sync for this product.');

  try {
    await syncProductStockByDolibarrId(dolibarrProductId, eventLogger);
    eventLogger.info({ dolibarrProductId }, 'Stock sync triggered by STOCK_MOVEMENT completed.');
  } catch (error) {
    eventLogger.error({ err: error, dolibarrProductId }, 'Error during stock sync triggered by STOCK_MOVEMENT.');
    throw error; // Re-throw to be caught by main webhook handler
  }
}

/**
 * Synchronizes the stock levels for a single product from Dolibarr to the local database.
 * This function fetches all stock information for the given Dolibarr product ID across all its warehouses
 * and updates the local stock_levels table.
 * @param {string|number} dolibarrProductId - The Dolibarr ID of the product.
 * @param {object} eventLogger - The logger instance.
 */
async function syncProductStockByDolibarrId(dolibarrProductId, eventLogger) {
  eventLogger.info({ dolibarrProductId }, 'Starting stock sync for single product.');

  try {
    const localProduct = await productController.getProductByDolibarrId(dolibarrProductId, eventLogger);
    if (!localProduct || !localProduct.id) {
      eventLogger.warn({ dolibarrProductId }, 'Product not found in local DB. Cannot sync stock.');
      return;
    }
    const internalProductId = localProduct.id;

    const stockApiData = await dolibarrApiService.getProductStock(dolibarrProductId);
    eventLogger.info({ dolibarrProductId, stockApiDataFromDolibarr: stockApiData }, 'Raw stock API data received for product.');

    if (!stockApiData || !stockApiData.stock_warehouses || typeof stockApiData.stock_warehouses !== 'object' || Object.keys(stockApiData.stock_warehouses).length === 0) {
      eventLogger.info({ dolibarrProductId }, 'No stock_warehouses data or empty/invalid stock_warehouses for product. Clearing existing stock might be an option here if desired.');
      // Potentially clear existing stock for this product if API returns none.
      // For now, we only update if data is present.
      // Example: await productController.clearStockForProduct(internalProductId, eventLogger);
      return;
    }

    let stockUpdateCount = 0;
    for (const dolibarrWarehouseId in stockApiData.stock_warehouses) {
      if (Object.prototype.hasOwnProperty.call(stockApiData.stock_warehouses, dolibarrWarehouseId)) {
        const stockDetail = stockApiData.stock_warehouses[dolibarrWarehouseId];
        const quantity = parseInt(stockDetail.real, 10); // 'real' seems to be the field from Dolibarr API v18

        if (isNaN(quantity)) {
            eventLogger.warn({ dolibarrProductId, dolibarrWarehouseId, stockDetail }, 'Invalid quantity received from API. Skipping stock update for this warehouse.');
            continue;
        }

        // For now, assuming stock is for the base product (variant_id = null)
        // Future enhancement: handle per-variant stock if API supports it and schema allows
        await productController.updateStockLevel(internalProductId, null, dolibarrWarehouseId, quantity, eventLogger);
        stockUpdateCount++;
      }
    }
    eventLogger.info({ dolibarrProductId, internalProductId, warehousesProcessed: stockUpdateCount }, 'Stock sync for product finished.');

  } catch (error) {
    // Handle 404 specifically for getProductStock - means product has no stock entries in Dolibarr
    if (error.isAxiosError && error.response && error.response.status === 404) {
      eventLogger.info({ dolibarrProductId }, 'Product has no stock information in Dolibarr (API returned 404). Local stock will not be updated, existing entries remain unless cleared.');
      // Consider clearing local stock for this product if API returns 404,
      // e.g., await productController.clearStockForProduct(internalProductId, eventLogger);
    } else {
      eventLogger.error({ err: error, dolibarrProductId }, 'Error during single product stock synchronization.');
      throw error; // Re-throw for other errors
    }
  }
}


/**
 * Main webhook dispatcher.
 * @param {object} payload - The webhook payload from Dolibarr.
 * @param {object} parentLogger - The Fastify logger instance from the request.
 */
async function handleWebhook(payload, parentLogger) {
  const { triggercode, object: objectData } = payload;
  // Create a child logger for this specific webhook event to carry triggercode and object ID
  const eventLogger = parentLogger.child({ triggercode, objectId: objectData.id || objectData.product_id });

  eventLogger.info('Webhook event received, dispatching...');

  try {
    switch (triggercode) {
      case 'PRODUCT_CREATE':
        await handleProductCreate(objectData, eventLogger);
        break;
      case 'PRODUCT_MODIFY':
        await handleProductModify(objectData, eventLogger);
        break;
      case 'PRODUCT_DELETE':
        await handleProductDelete(objectData, eventLogger);
        break;
      case 'CATEGORY_CREATE':
        await handleCategoryCreate(objectData, eventLogger);
        break;
      case 'CATEGORY_MODIFY':
        await handleCategoryModify(objectData, eventLogger);
        break;
      case 'CATEGORY_DELETE':
        await handleCategoryDelete(objectData, eventLogger);
        break;
      case 'STOCK_MOVEMENT':
        await handleStockMovement(objectData, eventLogger);
        break;
      default:
        eventLogger.warn(`Unknown triggercode: ${triggercode}. No action taken.`);
        break;
    }
    eventLogger.info('Webhook processing logic complete.');
  } catch (error) {
    eventLogger.error({ err: error }, `Error processing webhook for triggercode ${triggercode}`);
    // Re-throw the error if specific upstream handling is needed,
    // or handle it definitively here (e.g. by ensuring it's logged and moving on).
    // Since webhookRoutes.js already catches errors from the handleWebhook promise,
    // re-throwing here will ensure it's caught and logged by the route's error handler.
    throw error;
  }
}
