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


  let queryText = `
    SELECT
      p.id, p.dolibarr_product_id, p.sku, p.name, p.description, p.price, p.slug, p.is_active,
      c.name as category_name,
      -- Aggregate images (example: get first image as thumbnail_url)
      (SELECT pi.cdn_url FROM product_images pi WHERE pi.product_id = p.id ORDER BY pi.display_order ASC, pi.id ASC LIMIT 1) as thumbnail_url
    FROM products p
    LEFT JOIN categories c ON p.category_id = c.id
  `;
  const queryParams = [];
  let paramIndex = 1;
  const conditions = [];

  if (category_id) {
    conditions.push(`p.category_id = $${paramIndex++}`);
    queryParams.push(parseInt(category_id, 10));
  }

  // Add more conditions for other filters here

  if (conditions.length > 0) {
    queryText += ` WHERE ${conditions.join(' AND ')}`;
  }

  // Count total products for pagination (matching filters)
  let countQueryText = `SELECT COUNT(*) FROM products p`;
  if (conditions.length > 0) {
    countQueryText += ` WHERE ${conditions.join(' AND ').replace(/p\.category_id/g, 'category_id')}`; // Adjust for alias if needed
  }

  queryText += ` ORDER BY p.${sortByColumn} ${order.toUpperCase()} LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
  queryParams.push(parseInt(limit, 10), offset);

  try {
    const { rows: products } = await db.query(queryText, queryParams);
    const { rows: countResult } = await db.query(countQueryText, queryParams.slice(0, conditions.length)); // Only filter params for count

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

    // Structure the response
    const response = {
      ...product,
      variants: variants.map(v => ({
        ...v,
        images: images.filter(img => img.variant_id === v.id), // Attach variant-specific images
        stock: stockLevels.filter(s => s.variant_id === v.id) // Attach variant-specific stock
      })),
      // Base product images (not tied to a specific variant)
      base_images: images.filter(img => img.product_id === product.id && img.variant_id IS NULL),
      // Base product stock (if stock can be for base product without variants, or as an aggregate)
      base_stock: stockLevels.filter(s => s.product_id === product.id && s.variant_id IS NULL),
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


export default {
  listProducts,
  getProductBySlug,
};
