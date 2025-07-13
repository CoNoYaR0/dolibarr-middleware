import db from '../services/dbService.js';

// const logger = console; // Will use request.log provided by Fastify

/**
 * Get all categories.
 * TODO: Add options for filtering, sorting, pagination if needed.
 */
async function getAllCategories(request, reply) {
  try {
    // For now, selecting all categories.
    // Consider adding parent_id if you want to reconstruct hierarchy on frontend,
    // or process hierarchy on backend.
    const { rows } = await db.query(
      'SELECT id, name, description, dolibarr_category_id, parent_dolibarr_category_id, slug FROM categories ORDER BY name ASC'
      // Assuming categories table has a 'slug' field, if not, it should be added or generated.
      // If 'slug' is not in categories, remove it from select.
    );
    // Our current categories schema does not have a 'slug' field yet.
    // Let's adjust the query for the current schema.
    // We should add 'slug' to categories table later if needed for SEO-friendly category URLs.

    const queryText = `
      SELECT
        id,
        name,
        description,
        dolibarr_category_id,
        parent_dolibarr_category_id
        -- Add slug here if/when categories table has a slug column
      FROM categories
      ORDER BY name ASC;
    `;
    const result = await db.query(queryText);

    reply.send(result.rows);
  } catch (error) {
    request.log.error({ err: error, requestId: request.id }, 'Error fetching categories');
    // The global error handler in server.js will now typically handle sending the response
    // So, we can just throw the error or let it propagate if not adding specific context here.
    // For consistency or if you want to shape the error before global handler:
    reply.code(500).send({ error: 'Failed to fetch categories', message: error.message });
    // However, it's often better to just: throw error; and let the centralized handler manage it.
    // Let's throw to use the centralized one.
    // throw error;
    // For now, keeping explicit reply but this could be simplified by throwing.
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
    (logger.error || logger)({ err: error, categoryId: id }, 'Error in getCategoryById');
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
    (logger.error || logger)({ err: error, dolibarrCategoryId: dolibarrId }, 'Error in getCategoryByDolibarrId');
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
    (logger.info || logger)({ newCategory: rows[0] }, `Category added/updated: ${name}`);
    return rows[0];
  } catch (error) {
    (logger.error || logger)({ err: error, categoryPayload }, 'Error in addCategory');
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
      (logger.warn || logger)({ dolibarrCategoryId: dolibarrId }, `Category with Dolibarr ID ${dolibarrId} not found for update.`);
      return null;
    }
    (logger.info || logger)({ updatedCategory: rows[0] }, `Category updated: ${name}`);
    return rows[0];
  } catch (error) {
    (logger.error || logger)({ err: error, dolibarrCategoryId: dolibarrId, categoryPayload }, 'Error in updateCategoryByDolibarrId');
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
      (logger.warn || logger)({ dolibarrCategoryId: dolibarrId }, `Category with Dolibarr ID ${dolibarrId} not found for deletion.`);
      return null;
    }
    (logger.info || logger)({ deletedCategory: rows[0] }, `Category deleted (Dolibarr ID: ${dolibarrId})`);
    return rows[0]; // Returns the deleted category data
  } catch (error) {
    (logger.error || logger)({ err: error, dolibarrCategoryId: dolibarrId }, 'Error in deleteCategoryByDolibarrId');
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
