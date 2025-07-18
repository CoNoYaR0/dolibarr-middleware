import db from '../services/dbService.js';
import Joi from 'joi';

// const logger = console; // Will use request.log provided by Fastify

const listProductsSchema = Joi.object({
  limit: Joi.number().integer().min(1).default(10),
  page: Joi.number().integer().min(1).default(1),
  category_id: Joi.number().integer().min(1),
  sort_by: Joi.string().valid('name', 'price', 'created_at', 'updated_at').default('name'),
  sort_order: Joi.string().valid('asc', 'desc').default('asc'),
  min_price: Joi.number().min(0),
  max_price: Joi.number().min(0),
});

/**
 * List products with pagination, basic filtering by category_id.
 * TODO: Add more filters (price range, attributes), sorting options.
 */
async function listProducts(request, reply) {
  const { error, value } = listProductsSchema.validate(request.query);
  if (error) {
    return reply.status(400).send({ error: 'Validation Error', details: error.details });
  }

  const { limit, page, category_id, sort_by, sort_order, min_price, max_price } = value;
  const offset = (page - 1) * limit;

  const order = sort_order;
  const sortByColumn = `"${sort_by}"`;


  let queryBase = `
    FROM products p
  `;
  let querySelect = `
    SELECT
      p.id, p.dolibarr_product_id, p.sku, p.name, p.description, p.price, p.slug, p.is_active,
      -- Get the thumbnail URL, preferring 'thumbnail' type
      (SELECT pi.cdn_url FROM product_images pi WHERE pi.product_id = p.id AND pi.image_type = 'thumbnail' ORDER BY pi.display_order ASC, pi.id ASC LIMIT 1) as thumbnail_url
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

  if (min_price) {
    conditions.push(`p.price >= $${paramIndex++}`);
    queryParams.push(parseFloat(min_price));
  }

  if (max_price) {
    conditions.push(`p.price <= $${paramIndex++}`);
    queryParams.push(parseFloat(max_price));
  }

  // Add more conditions for other filters here (e.g., is_active = true)
  conditions.push(`p.is_active = TRUE`); // Example: always filter for active products

  let whereClause = '';
  if (conditions.length > 0) {
    whereClause = ` WHERE ${conditions.join(' AND ')}`;
  } else {
    whereClause = ` WHERE p.is_active = TRUE`;
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

    request.log.info({ productCount: products.length, totalProducts, products, countResult }, 'Products fetched from database');

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
    reply.send({
      data: [],
      pagination: {
        total_products: 0,
        total_pages: 0,
        current_page: parseInt(page, 10),
        per_page: parseInt(limit, 10),
      },
    });
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

    // 3. Fetch product images
    const imagesQuery = `
      SELECT image_type as type, cdn_url as url
      FROM product_images
      WHERE product_id = $1
      ORDER BY display_order ASC, id ASC
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
      SELECT c.id, c.dolibarr_category_id, c.name, c.description, c.slug
      FROM product_categories_map pcm
      JOIN categories c ON pcm.category_id = c.id
      WHERE pcm.product_id = $1
      ORDER BY c.name;
    `;
    const { rows: productCategories } = await db.query(categoriesQuery, [product.id]);

    // Structure the response
    const response = {
      ...product,
      categories: productCategories,
      variants,
      images,
      stockLevels,
    };

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

async function searchProducts(request, reply) {
  const { q, limit = 10, page = 1 } = request.query;
  const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);

  if (!q) {
    return reply.code(400).send({ error: 'Query parameter "q" is required.' });
  }

  try {
    const searchQuery = `
      SELECT
        p.id, p.dolibarr_product_id, p.sku, p.name, p.description, p.price, p.slug, p.is_active,
        (SELECT pi.cdn_url FROM product_images pi WHERE pi.product_id = p.id ORDER BY pi.display_order ASC, pi.id ASC LIMIT 1) as thumbnail_url
      FROM products p
      WHERE
        p.name ILIKE $1 OR
        p.description ILIKE $1 OR
        p.sku ILIKE $1
      LIMIT $2 OFFSET $3;
    `;
    const { rows: products } = await db.query(searchQuery, [`%${q}%`, limit, offset]);

    const countQuery = `
      SELECT COUNT(*) FROM products p
      WHERE
        p.name ILIKE $1 OR
        p.description ILIKE $1 OR
        p.sku ILIKE $1;
    `;
    const { rows: countResult } = await db.query(countQuery, [`%${q}%`]);
    const totalProducts = parseInt(countResult[0].count, 10);
    const totalPages = Math.ceil(totalProducts / parseInt(limit, 10));

    request.log.info({ productCount: products.length, totalProducts }, 'Products fetched from database');
    console.log('Products sent to frontend:', products.length, products);

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
    request.log.error({ err: error, query: request.query, requestId: request.id }, 'Error searching products');
    reply.code(500).send({ error: 'Failed to search products', message: error.message });
  }
}

export default {
  listProducts,
  getProductBySlug,
  searchProducts,
  getProductByDolibarrId,
  addProduct,
  updateProductByDolibarrId,
  deleteProductByDolibarrId,
  clearProductCategoryLinks,
  linkProductToCategories,
  updateStockLevel,
  syncProductVariants,
};

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
    const { rows: existingVariants } = await db.query('SELECT * FROM product_variants WHERE product_id = $1', [localProductId]);
    const existingVariantsMap = new Map(existingVariants.map(v => [v.dolibarr_variant_id, v]));

    const variantsFromApiMap = new Map(variantsDataFromApi.map(v => [v.id, v]));

    // Delete variants that are no longer in the API
    for (const existingVariant of existingVariants) {
      if (!variantsFromApiMap.has(existingVariant.dolibarr_variant_id)) {
        await db.query('DELETE FROM product_variants WHERE id = $1', [existingVariant.id]);
        logger.info({ localProductId, variantId: existingVariant.id }, 'Deleted variant not present in API anymore.');
      }
    }

    // Insert or update variants from the API
    for (const dolibarrVariant of variantsDataFromApi) {
      if (!dolibarrVariant.id) {
        logger.warn({ localProductId, variantData: dolibarrVariant }, 'Skipping variant due to missing Dolibarr variant ID.');
        continue;
      }

      const variantPayload = transformVariantFn(dolibarrVariant, localProductId);
      const existingVariant = existingVariantsMap.get(dolibarrVariant.id);

      if (existingVariant) {
        // Update existing variant
        const queryText = `
          UPDATE product_variants SET
            sku_variant = $1, price_modifier = $2, attributes = $3,
            dolibarr_created_at = $4, dolibarr_updated_at = $5, updated_at = NOW()
          WHERE id = $6;
        `;
        await db.query(queryText, [
          variantPayload.sku_variant, variantPayload.price_modifier, variantPayload.attributes,
          variantPayload.dolibarr_created_at, variantPayload.dolibarr_updated_at, existingVariant.id
        ]);
        logger.info({ localProductId, variantId: existingVariant.id }, 'Updated variant.');
      } else {
        // Insert new variant
        const queryText = `
          INSERT INTO product_variants (
            dolibarr_variant_id, product_id, sku_variant, price_modifier, attributes,
            dolibarr_created_at, dolibarr_updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7);
        `;
        await db.query(queryText, [
          variantPayload.dolibarr_variant_id, variantPayload.product_id, variantPayload.sku_variant,
          variantPayload.price_modifier, variantPayload.attributes,
          variantPayload.dolibarr_created_at, variantPayload.dolibarr_updated_at
        ]);
        logger.info({ localProductId, dolibarrVariantId: dolibarrVariant.id }, 'Inserted new variant.');
      }
    }
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
