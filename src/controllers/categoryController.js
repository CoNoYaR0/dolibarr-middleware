import db from '../services/dbService.js';

// const logger = console; // Will use request.log provided by Fastify

/**
 * Get all categories.
 * TODO: Add options for filtering, sorting, pagination if needed.
 */
async function getAllCategories(request, reply) {
  const { limit = 10, page = 1, sort_by = 'name', sort_order = 'asc' } = request.query;
  const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);

  // Basic validation for sort_order
  const validSortOrders = ['asc', 'desc'];
  const order = validSortOrders.includes(sort_order.toLowerCase()) ? sort_order.toLowerCase() : 'asc';

  // Basic validation for sort_by - whitelist columns
  const validSortColumns = ['name', 'created_at', 'updated_at']; // Add more as needed
  const sortByColumn = validSortColumns.includes(sort_by.toLowerCase()) ? sort_by.toLowerCase() : 'name';

  try {
    const queryText = `
      SELECT
        id,
        name,
        description,
        dolibarr_category_id,
        parent_dolibarr_category_id,
        slug
      FROM categories
      ORDER BY ${sortByColumn} ${order.toUpperCase()}
      LIMIT $1 OFFSET $2;
    `;
    const { rows: categories } = await db.query(queryText, [limit, offset]);

    const countQuery = 'SELECT COUNT(*) FROM categories';
    const { rows: countResult } = await db.query(countQuery);
    const totalCategories = parseInt(countResult[0].count, 10);
    const totalPages = Math.ceil(totalCategories / parseInt(limit, 10));

    reply.send({
      data: categories,
      pagination: {
        total_categories: totalCategories,
        total_pages: totalPages,
        current_page: parseInt(page, 10),
        per_page: parseInt(limit, 10),
      },
    });
  } catch (error) {
    request.log.error({ err: error, requestId: request.id }, 'Error fetching categories');
    reply.code(500).send({ error: 'Failed to fetch categories', message: error.message });
  }
}

// Add other category-related controller functions here if needed (e.g., getCategoryBySlugOrId)

/**
 * Get a single category by its local primary key ID.
 * @param {number} id - The local primary key ID of the category.
 * @param {object} logger - Optional logger instance.
 */
async function getCategoryById(id, logger) {
  try {
    const queryText = `
      SELECT id, name, description, dolibarr_category_id, parent_id, parent_dolibarr_category_id,
             created_at, updated_at, dolibarr_created_at, dolibarr_updated_at
      FROM categories
      WHERE id = $1;
    `;
    const { rows } = await db.query(queryText, [id]);
    if (rows.length === 0) {
      return null;
    }
    return rows[0];
  } catch (error) {
    logger.error({ err: error, categoryId: id }, 'Error in getCategoryById');
    throw error;
  }
}

/**
 * Get a single category by its Dolibarr ID.
 * @param {string|number} dolibarrId - The Dolibarr ID of the category.
 * @param {object} logger - Optional logger instance.
 */
async function getCategoryByDolibarrId(dolibarrId, logger) {
  try {
    const queryText = `
      SELECT id, name, description, dolibarr_category_id, parent_id, parent_dolibarr_category_id,
             created_at, updated_at, dolibarr_created_at, dolibarr_updated_at
      FROM categories
      WHERE dolibarr_category_id = $1;
    `;
    const { rows } = await db.query(queryText, [dolibarrId]);
    if (rows.length === 0) {
      return null;
    }
    return rows[0];
  } catch (error) {
    logger.error({ err: error, dolibarrCategoryId: dolibarrId }, 'Error in getCategoryByDolibarrId');
    throw error;
  }
}

/**
 * Add a new category to the database.
 * @param {object} categoryPayload - Data for the new category (transformed).
 *                                   Expected fields: dolibarr_category_id, name, description,
 *                                   parent_id (local parent ID), parent_dolibarr_category_id,
 *                                   dolibarr_created_at, dolibarr_updated_at.
 * @param {object} logger - Optional logger instance.
 */
async function addCategory(categoryPayload, logger) {
  const {
    dolibarr_category_id, name, description, parent_id, parent_dolibarr_category_id,
    dolibarr_created_at, dolibarr_updated_at
  } = categoryPayload;

  try {
    const queryText = `
      INSERT INTO categories (
        dolibarr_category_id, name, description, parent_id, parent_dolibarr_category_id,
        dolibarr_created_at, dolibarr_updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (dolibarr_category_id) DO UPDATE SET
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        parent_id = EXCLUDED.parent_id,
        parent_dolibarr_category_id = EXCLUDED.parent_dolibarr_category_id,
        dolibarr_created_at = EXCLUDED.dolibarr_created_at,
        dolibarr_updated_at = EXCLUDED.dolibarr_updated_at,
        updated_at = NOW()
      RETURNING *;
    `;
    const { rows } = await db.query(queryText, [
      dolibarr_category_id, name, description, parent_id, parent_dolibarr_category_id,
      dolibarr_created_at, dolibarr_updated_at
    ]);
    logger.info({ newCategory: rows[0] }, `Category added/updated: ${name}`);
    return rows[0];
  } catch (error) {
    logger.error({ err: error, categoryPayload }, 'Error in addCategory');
    throw error;
  }
}

/**
 * Update an existing category by its Dolibarr ID.
 * @param {string|number} dolibarrId - The Dolibarr ID of the category to update.
 * @param {object} categoryPayload - Data for updating the category (transformed).
 *                                   Expected fields: name, description, parent_id,
 *                                   parent_dolibarr_category_id, dolibarr_updated_at.
 * @param {object} logger - Optional logger instance.
 */
async function updateCategoryByDolibarrId(dolibarrId, categoryPayload, logger) {
  const {
    name, description, parent_id, parent_dolibarr_category_id,
    dolibarr_updated_at // dolibarr_created_at is usually not updated
  } = categoryPayload;

  try {
    const queryText = `
      UPDATE categories
      SET name = $1, description = $2, parent_id = $3, parent_dolibarr_category_id = $4,
          dolibarr_updated_at = $5, updated_at = NOW()
      WHERE dolibarr_category_id = $6
      RETURNING *;
    `;
    const { rows } = await db.query(queryText, [
      name, description, parent_id, parent_dolibarr_category_id,
      dolibarr_updated_at, dolibarrId
    ]);

    if (rows.length === 0) {
      logger.warn({ dolibarrCategoryId: dolibarrId }, `Category with Dolibarr ID ${dolibarrId} not found for update.`);
      return null;
    }
    logger.info({ updatedCategory: rows[0] }, `Category updated: ${name}`);
    return rows[0];
  } catch (error) {
    logger.error({ err: error, dolibarrCategoryId: dolibarrId, categoryPayload }, 'Error in updateCategoryByDolibarrId');
    throw error;
  }
}

/**
 * Delete a category by its Dolibarr ID.
 * @param {string|number} dolibarrId - The Dolibarr ID of the category to delete.
 * @param {object} logger - Optional logger instance.
 */
async function deleteCategoryByDolibarrId(dolibarrId, logger) {
  try {
    const queryText = 'DELETE FROM categories WHERE dolibarr_category_id = $1 RETURNING *;';
    const { rows } = await db.query(queryText, [dolibarrId]);

    if (rows.length === 0) {
      logger.warn({ dolibarrCategoryId: dolibarrId }, `Category with Dolibarr ID ${dolibarrId} not found for deletion.`);
      return null;
    }
    logger.info({ deletedCategory: rows[0] }, `Category deleted (Dolibarr ID: ${dolibarrId})`);
    return rows[0]; // Returns the deleted category data
  } catch (error) {
    logger.error({ err: error, dolibarrCategoryId: dolibarrId }, 'Error in deleteCategoryByDolibarrId');
    throw error; // Rethrow to be handled by service/route layer
  }
}


export default {
  getAllCategories,
  getCategoryById,
  getCategoryByDolibarrId,
  addCategory,
  updateCategoryByDolibarrId,
  deleteCategoryByDolibarrId,
};
