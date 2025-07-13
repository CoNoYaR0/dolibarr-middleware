import db from '../services/dbService.js';

// const logger = console; // Will use request.log provided by Fastify

/**
 * List products with pagination, basic filtering by category_id.
 * TODO: Add more filters (price range, attributes), sorting options.
 */
async function listProducts(request, reply) {
  const { limit = 10, page = 1, category_id, sort_by = 'name', sort_order = 'asc' } = request.query;
  const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);

  // Basic validation for sort_order
  const validSortOrders = ['asc', 'desc'];
  const order = validSortOrders.includes(sort_order.toLowerCase()) ? sort_order.toLowerCase() : 'asc';

  // Basic validation for sort_by - whitelist columns
  const validSortColumns = ['name', 'price', 'created_at', 'updated_at']; // Add more as needed
  const sortByColumn = validSortColumns.includes(sort_by.toLowerCase()) ? sort_by.toLowerCase() : 'name';


  let queryBase = `
    FROM products p
  `;
  let querySelect = `
    SELECT
      p.id, p.dolibarr_product_id, p.sku, p.name, p.description, p.price, p.slug, p.is_active,
      -- Aggregate images (example: get first image as thumbnail_url)
      (SELECT pi.cdn_url FROM product_images pi WHERE pi.product_id = p.id ORDER BY pi.display_order ASC, pi.id ASC LIMIT 1) as thumbnail_url
  `;

  const queryParams = [];
  let paramIndex = 1;
  const conditions = [];
  let joins = '';

  if (category_id) {
    // Join with the mapping table to filter by category
    joins += ` INNER JOIN product_categories_map pcm ON p.id = pcm.product_id`;
    conditions.push(`pcm.category_id = $${paramIndex++}`);
    queryParams.push(parseInt(category_id, 10));
  }

  // Add more conditions for other filters here (e.g., is_active = true)
  // conditions.push(`p.is_active = TRUE`); // Example: always filter for active products

  let whereClause = '';
  if (conditions.length > 0) {
    whereClause = ` WHERE ${conditions.join(' AND ')}`;
  }

  // Count total products for pagination (matching filters)
  // For COUNT, we need to be careful if category_id filter makes the count distinct per product
  let countQueryText;
  if (category_id) {
    // If filtering by category, count distinct products that match
    countQueryText = `SELECT COUNT(DISTINCT p.id) ${queryBase} ${joins} ${whereClause}`;
  } else {
    countQueryText = `SELECT COUNT(p.id) ${queryBase} ${joins} ${whereClause}`;
  }

  const queryParamsForCount = [...queryParams]; // queryParams for count might be different if limit/offset are not needed

  let queryText = `${querySelect} ${queryBase} ${joins} ${whereClause} ORDER BY p.${sortByColumn} ${order.toUpperCase()} LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
  queryParams.push(parseInt(limit, 10), offset);

  request.log.debug({ queryText, queryParams, countQueryText, queryParamsForCount }, 'List products query');

  try {
    const { rows: products } = await db.query(queryText, queryParams);
    const { rows: countResult } = await db.query(countQueryText, queryParamsForCount);

    const totalProducts = parseInt(countResult[0].count, 10);
    const totalPages = Math.ceil(totalProducts / parseInt(limit, 10));

    reply.send({
      data: products,
      pagination: {
        total_products: totalProducts,
        total_pages: totalPages,
        current_page: parseInt(page, 10),
        per_page: parseInt(limit, 10),
      },
    });
  } catch (error) {
    request.log.error({ err: error, query: request.query, requestId: request.id }, 'Error listing products');
    // throw error; // Or let centralized handler do its job
    reply.code(500).send({ error: 'Failed to list products', message: error.message });
  }
}

/**
 * Get a single product by its slug (or ID).
 * Includes variants, images, and stock levels.
 */
async function getProductBySlug(request, reply) {
  const { slug } = request.params;
  // Could also support fetching by ID: const { idOrSlug } = request.params;
  // Then check if idOrSlug is numeric for ID or string for slug.

  try {
    // 1. Fetch the base product
    const productQuery = 'SELECT * FROM products WHERE slug = $1 AND is_active = TRUE'; // Or use ID
    const { rows: productResult } = await db.query(productQuery, [slug]);

    if (productResult.length === 0) {
      reply.code(404).send({ error: 'Product not found or not active' });
      return;
    }
    const product = productResult[0];

    // 2. Fetch product variants
    const variantsQuery = 'SELECT * FROM product_variants WHERE product_id = $1 ORDER BY id ASC'; // Add order if needed
    const { rows: variants } = await db.query(variantsQuery, [product.id]);

    // 3. Fetch product images (for base product and all its variants)
    // This query fetches all images associated with the product or any of its variants.
    // Frontend might need to associate them correctly.
    const imagesQuery = `
      SELECT * FROM product_images
      WHERE product_id = $1 OR variant_id IN (SELECT id FROM product_variants WHERE product_id = $1)
      ORDER BY variant_id NULLS FIRST, display_order ASC, id ASC
    `;
    const { rows: images } = await db.query(imagesQuery, [product.id]);

    // 4. Fetch stock levels (for base product and all its variants)
    // This query fetches all stock entries. Assumes 'default' warehouse if not specified.
    // Summing stock across warehouses might be needed or handled by frontend if multiple warehouses are used.
    const stockQuery = `
      SELECT product_id, variant_id, warehouse_id, quantity
      FROM stock_levels
      WHERE product_id = $1 OR variant_id IN (SELECT id FROM product_variants WHERE product_id = $1)
    `;
    const { rows: stockLevels } = await db.query(stockQuery, [product.id]);

    // 5. Fetch associated categories
    const categoriesQuery = `
      SELECT c.id, c.dolibarr_category_id, c.name, c.description /* add other category fields as needed, e.g., slug */
      FROM product_categories_map pcm
      JOIN categories c ON pcm.category_id = c.id
      WHERE pcm.product_id = $1
      ORDER BY c.name;
    `;
    const { rows: productCategories } = await db.query(categoriesQuery, [product.id]);

    // Structure the response
    const response = {
      ...product,
      categories: productCategories, // Add categories to the response
      variants: variants.map(v => ({
        ...v,
        images: images.filter(img => img.variant_id === v.id), // Attach variant-specific images
        stock: stockLevels.filter(s => s.variant_id === v.id) // Attach variant-specific stock
      })),
      // Base product images (not tied to a specific variant)
      base_images: images.filter(img => img.product_id === product.id && img.variant_id === null),
      // Base product stock (if stock can be for base product without variants, or as an aggregate)
      base_stock: stockLevels.filter(s => s.product_id === product.id && s.variant_id === null),
    };
    // A more sophisticated approach for stock might pre-aggregate it or provide a clearer structure.
    // For example, a total stock for the product, and then stock per variant.

    reply.send(response);

  } catch (error) {
    request.log.error({ err: error, params: request.params, requestId: request.id }, `Error fetching product by slug`);
    // throw error; // Or let centralized handler do its job
    reply.code(500).send({ error: 'Failed to fetch product details', message: error.message });
  }
}


/**
 * Get a single product by its Dolibarr ID.
 * @param {string|number} dolibarrProductId - The Dolibarr ID of the product.
 * @param {object} logger - Optional logger instance.
 */
async function getProductByDolibarrId(dolibarrProductId, logger) {
  try {
    const queryText = 'SELECT * FROM products WHERE dolibarr_product_id = $1;';
    const { rows } = await db.query(queryText, [dolibarrProductId]);
    if (rows.length === 0) {
      return null;
    }
    return rows[0];
  } catch (error) {
    logger.error({ err: error, dolibarrProductId }, 'Error in getProductByDolibarrId');
    throw error;
  }
}

/**
 * Synchronizes product variants for a given local product ID.
 * Deletes all existing variants for the product and then inserts the new ones from the API data.
 * @param {number} localProductId - The local ID of the parent product.
 * @param {Array<object>} variantsDataFromApi - Array of variant objects from Dolibarr API.
 * @param {function} transformVariantFn - The function to transform Dolibarr variant data to local DB schema.
 * @param {object} logger - Optional logger instance.
 */
async function syncProductVariants(localProductId, variantsDataFromApi, transformVariantFn, logger) {
  try {
    // Delete existing variants for this product
    const deleteResult = await db.query('DELETE FROM product_variants WHERE product_id = $1 RETURNING dolibarr_variant_id;', [localProductId]);
    if (deleteResult.rowCount > 0) {
      logger.info({ localProductId, count: deleteResult.rowCount, deleted_dolibarr_ids: deleteResult.rows.map(r => r.dolibarr_variant_id) }, `Deleted ${deleteResult.rowCount} existing variants for product.`);
    }

    if (!variantsDataFromApi || variantsDataFromApi.length === 0) {
      logger.info({ localProductId }, 'No new variants data provided from API. All existing variants (if any) have been cleared.');
      return;
    }

    let upsertedCount = 0;
    for (const dolibarrVariant of variantsDataFromApi) {
      if (!dolibarrVariant.id) {
        logger.warn({ localProductId, variantData: dolibarrVariant }, 'Skipping variant due to missing Dolibarr variant ID.');
        continue;
      }
      // The transformVariantFn is expected to be passed from syncService,
      // as it's currently defined there.
      const variantPayload = transformVariantFn(dolibarrVariant, localProductId);

      const queryText = `
        INSERT INTO product_variants (
          dolibarr_variant_id, product_id, sku_variant, price_modifier, attributes,
          dolibarr_created_at, dolibarr_updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (dolibarr_variant_id) DO UPDATE SET
          product_id = EXCLUDED.product_id,
          sku_variant = EXCLUDED.sku_variant,
          price_modifier = EXCLUDED.price_modifier,
          attributes = EXCLUDED.attributes,
          dolibarr_created_at = EXCLUDED.dolibarr_created_at,
          dolibarr_updated_at = EXCLUDED.dolibarr_updated_at,
          updated_at = NOW()
        RETURNING id;
      `;
      await db.query(queryText, [
        variantPayload.dolibarr_variant_id, variantPayload.product_id, variantPayload.sku_variant,
        variantPayload.price_modifier, variantPayload.attributes,
        variantPayload.dolibarr_created_at, variantPayload.dolibarr_updated_at
      ]);
      upsertedCount++;
    }
    logger.info({ localProductId, count: upsertedCount }, `Upserted ${upsertedCount} variants for product.`);

  } catch (error) {
    logger.error({ err: error, localProductId }, 'Error in syncProductVariants');
    throw error;
  }
}

/**
 * Add a new product to the database. Performs an UPSERT based on dolibarr_product_id.
 * @param {object} productPayload - Data for the new product (transformed from Dolibarr).
 *                                  Expected fields from transformProduct.
 * @param {object} logger - Optional logger instance.
 */
async function addProduct(productPayload, logger) {
  const {
    dolibarr_product_id, sku, name, description, long_description, price,
    is_active, slug, dolibarr_created_at, dolibarr_updated_at
  } = productPayload;

  try {
    const queryText = `
      INSERT INTO products (
        dolibarr_product_id, sku, name, description, long_description, price,
        is_active, slug, dolibarr_created_at, dolibarr_updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (dolibarr_product_id) DO UPDATE SET
        sku = EXCLUDED.sku,
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        long_description = EXCLUDED.long_description,
        price = EXCLUDED.price,
        is_active = EXCLUDED.is_active,
        slug = EXCLUDED.slug,
        dolibarr_created_at = EXCLUDED.dolibarr_created_at,
        dolibarr_updated_at = EXCLUDED.dolibarr_updated_at,
        updated_at = NOW()
      RETURNING *;
    `;
    const { rows } = await db.query(queryText, [
      dolibarr_product_id, sku, name, description, long_description, price,
      is_active, slug, dolibarr_created_at, dolibarr_updated_at
    ]);
    logger.info({ newProduct: rows[0] }, `Product added/updated: ${name} (Dolibarr ID: ${dolibarr_product_id})`);
    return rows[0];
  } catch (error) {
    logger.error({ err: error, productPayload }, 'Error in addProduct');
    throw error;
  }
}

/**
 * Update an existing product by its Dolibarr ID.
 * @param {string|number} dolibarrProductId - The Dolibarr ID of the product to update.
 * @param {object} productPayload - Data for updating the product.
 * @param {object} logger - Optional logger instance.
 */
async function updateProductByDolibarrId(dolibarrProductId, productPayload, logger) {
  const {
    sku, name, description, long_description, price,
    is_active, slug, dolibarr_updated_at // dolibarr_created_at is usually not updated
  } = productPayload;

  try {
    const queryText = `
      UPDATE products
      SET sku = $1, name = $2, description = $3, long_description = $4, price = $5,
          is_active = $6, slug = $7, dolibarr_updated_at = $8, updated_at = NOW()
      WHERE dolibarr_product_id = $9
      RETURNING *;
    `;
    const { rows } = await db.query(queryText, [
      sku, name, description, long_description, price,
      is_active, slug, dolibarr_updated_at, dolibarrProductId
    ]);

    if (rows.length === 0) {
      logger.warn({ dolibarrProductId }, `Product with Dolibarr ID ${dolibarrProductId} not found for update.`);
      return null;
    }
    logger.info({ updatedProduct: rows[0] }, `Product updated: ${name} (Dolibarr ID: ${dolibarrProductId})`);
    return rows[0];
  } catch (error) {
    logger.error({ err: error, dolibarrProductId, productPayload }, 'Error in updateProductByDolibarrId');
    throw error;
  }
}

/**
 * Delete a product by its Dolibarr ID.
 * Relies on ON DELETE CASCADE for related tables (product_categories_map, product_variants, stock_levels, images).
 * @param {string|number} dolibarrProductId - The Dolibarr ID of the product to delete.
 * @param {object} logger - Optional logger instance.
 */
async function deleteProductByDolibarrId(dolibarrProductId, logger) {
  try {
    // First, get the local product ID to ensure related data is logged or handled if needed before cascade
    const product = await getProductByDolibarrId(dolibarrProductId, logger);
    if (!product) {
      logger.warn({ dolibarrProductId }, `Product with Dolibarr ID ${dolibarrProductId} not found for deletion.`);
      return null;
    }

    // Note: product_categories_map, product_variants, stock_levels, images should have ON DELETE CASCADE
    // constraint on their product_id foreign key.
    const queryText = 'DELETE FROM products WHERE dolibarr_product_id = $1 RETURNING *;';
    const { rows } = await db.query(queryText, [dolibarrProductId]);

    logger.info({ deletedProduct: rows[0] }, `Product deleted (Dolibarr ID: ${dolibarrProductId})`);
    return rows[0];
  } catch (error) {
    logger.error({ err: error, dolibarrProductId }, 'Error in deleteProductByDolibarrId');
    throw error;
  }
}

/**
 * Clears all category associations for a given local product ID.
 * @param {number} internalProductId - The local ID of the product.
 * @param {object} logger - Optional logger instance.
 */
async function clearProductCategoryLinks(internalProductId, logger) {
  try {
    const { rowCount } = await db.query('DELETE FROM product_categories_map WHERE product_id = $1', [internalProductId]);
    logger.info({ internalProductId, clearedLinks: rowCount }, `Cleared ${rowCount} category links for product ID ${internalProductId}.`);
    return rowCount;
  } catch (error) {
    logger.error({ err: error, internalProductId }, 'Error in clearProductCategoryLinks');
    throw error;
  }
}

/**
 * Links a product to a list of categories using their Dolibarr IDs.
 * @param {number} internalProductId - The local ID of the product.
 * @param {Array<string|number>} arrayOfDolibarrCategoryIds - Array of Dolibarr category IDs to link.
 * @param {object} logger - Optional logger instance.
 */
async function linkProductToCategories(internalProductId, arrayOfDolibarrCategoryIds, logger) {
  if (!arrayOfDolibarrCategoryIds || arrayOfDolibarrCategoryIds.length === 0) {
    logger.info({ internalProductId }, 'No Dolibarr category IDs provided for linking.');
    return 0;
  }

  let linkedCount = 0;
  try {
    for (const dolibarrCatId of arrayOfDolibarrCategoryIds) {
      // Need categoryController to get local category ID from Dolibarr ID
      // This introduces a dependency, ensure categoryController is available or use a direct DB query here
      const categoryQuery = 'SELECT id FROM categories WHERE dolibarr_category_id = $1';
      const { rows: catRows } = await db.query(categoryQuery, [dolibarrCatId]);

      if (catRows.length > 0) {
        const localCategoryId = catRows[0].id;
        await db.query(
          'INSERT INTO product_categories_map (product_id, category_id) VALUES ($1, $2) ON CONFLICT (product_id, category_id) DO NOTHING',
          [internalProductId, localCategoryId]
        );
        linkedCount++;
        logger.info({ internalProductId, localCategoryId, dolibarrCatId }, `Linked product to category.`);
      } else {
        logger.warn({ internalProductId, dolibarrCatId }, `Category with Dolibarr ID ${dolibarrCatId} not found for linking.`);
      }
    }
    logger.info({ internalProductId, linkedCount }, `Finished linking product to categories.`);
    return linkedCount;
  } catch (error) {
    logger.error({ err: error, internalProductId, arrayOfDolibarrCategoryIds }, 'Error in linkProductToCategories');
    throw error;
  }
}


export default {
  listProducts,
  getProductBySlug,
  getProductByDolibarrId,
  addProduct,
  updateProductByDolibarrId,
  deleteProductByDolibarrId,
  clearProductCategoryLinks,
  linkProductToCategories,
  updateStockLevel,
  syncProductVariants, // Added this function
};

/**
 * Updates or inserts a stock level entry for a product/variant in a specific warehouse.
 * @param {number} internalProductId - The local ID of the product.
 * @param {number|null} internalVariantId - The local ID of the variant (null if stock is for base product).
 * @param {string|number} dolibarrWarehouseId - The Dolibarr warehouse ID.
 * @param {number} quantity - The stock quantity.
 * @param {object} logger - Optional logger instance.
 */
async function updateStockLevel(internalProductId, internalVariantId, dolibarrWarehouseId, quantity, logger) {
  try {
    // Stock levels table uses product_id (nullable), variant_id (nullable), and warehouse_id (varchar)
    // Ensure warehouse_id is treated as a string as per schema.
    const whId = String(dolibarrWarehouseId);
    const now = new Date();

    // product_id is required if variant_id is null.
    // variant_id implies product_id via its own FK, but stock_levels allows product_id to be null if variant_id is set.
    // However, our logic usually has product_id.
    // Let's ensure internalProductId is always provided if internalVariantId is null.
    if (internalVariantId === null && internalProductId === null) {
      logger.error({ internalProductId, internalVariantId, dolibarrWarehouseId, quantity }, 'Error in updateStockLevel: internalProductId cannot be null if internalVariantId is null.');
      throw new Error('internalProductId cannot be null if internalVariantId is null for stock level update.');
    }

    // If variantId is provided, product_id in stock_levels could technically be null
    // but it's better to store it if known. The productController.getProductByDolibarrId would give us the main product.
    // For now, the signature expects internalProductId.

    const queryText = `
      INSERT INTO stock_levels (product_id, variant_id, warehouse_id, quantity, dolibarr_updated_at, last_checked_at)
      VALUES ($1, $2, $3, $4, $5, $5)
      ON CONFLICT (product_id, variant_id, warehouse_id) DO UPDATE SET
        quantity = EXCLUDED.quantity,
        dolibarr_updated_at = EXCLUDED.dolibarr_updated_at,
        last_checked_at = EXCLUDED.last_checked_at,
        updated_at = NOW()
      RETURNING *;
    `;

    // Determine which ID to use for product_id in the stock_levels table.
    // If internalVariantId is present, internalProductId refers to the parent product.
    // The current schema for stock_levels has product_id and variant_id.
    // If stock is for a variant, product_id in stock_levels table should reference the main product.
    // If stock is for a base product (no variant), variant_id is null.

    const { rows } = await db.query(queryText, [
      internalProductId, // This should be the ID of the product record
      internalVariantId, // Null if stock is for the base product
      whId,
      quantity,
      now
    ]);

    logger.info({ stockLevel: rows[0] }, `Stock level updated for product/variant in warehouse ${whId}.`);
    return rows[0];
  } catch (error) {
    logger.error({ err: error, internalProductId, internalVariantId, dolibarrWarehouseId, quantity }, 'Error in updateStockLevel');
    throw error;
  }
}
