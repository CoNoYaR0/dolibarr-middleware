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

export default {
  getAllCategories,
};
