import categoryController from '../controllers/categoryController.js';
import productController from '../controllers/productController.js';
import syncController from '../controllers/syncController.js';

// Define schema/validation for request/response if desired, using Fastify's schema capabilities.
// Example for listProducts query parameters:
const listProductsSchema = {
  summary: 'List products',
  description: 'Retrieves a paginated list of synchronized products. Supports filtering by category_id and sorting by various fields.',
  tags: ['Products'],
  querystring: {
    type: 'object',
    properties: {
      limit: { type: 'integer', minimum: 1, default: 10 },
      page: { type: 'integer', minimum: 1, default: 1 },
      category_id: { type: 'integer', minimum: 1 },
      sort_by: { type: 'string', enum: ['name', 'price', 'created_at', 'updated_at'], default: 'name' },
      sort_order: { type: 'string', enum: ['asc', 'desc'], default: 'asc' },
      // Add other filter properties here
    },
  },
  // You can also define response schemas for better documentation and validation
  // response: {
  //   200: {
  //     type: 'object',
  //     properties: {
  //       data: { type: 'array', items: { /* product schema */ } },
  //       pagination: { /* pagination schema */ }
  //     }
  //   }
  // }
};

// Example for getProductBySlug params
const getProductBySlugSchema = {
  summary: 'Get product by slug',
  description: 'Retrieves detailed information for a single product by its URL slug, including its variants, image URLs, stock levels, and associated categories.',
  tags: ['Products'],
  params: {
    type: 'object',
    properties: {
      slug: { type: 'string' },
    },
    required: ['slug'],
  },
  // Define response schema for a single product
};


async function apiRoutes(fastify) {
  // Category Routes
  fastify.get('/categories', {
    schema: {
      summary: 'List all categories',
      description: 'Retrieves a list of all synchronized categories from the local database.',
      tags: ['Categories'],
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'integer', minimum: 1, default: 10 },
          page: { type: 'integer', minimum: 1, default: 1 },
          sort_by: { type: 'string', enum: ['name', 'created_at', 'updated_at'], default: 'name' },
          sort_order: { type: 'string', enum: ['asc', 'desc'], default: 'asc' },
        },
      },
    }
  }, categoryController.getAllCategories);
  // fastify.get('/categories/:idOrSlug', categoryController.getCategory); // Example for single category

  // Product Routes
  fastify.get('/products', { schema: listProductsSchema }, productController.listProducts);
  fastify.get('/products/:slug', { schema: getProductBySlugSchema }, productController.getProductBySlug);
  // Consider an alternative by ID:
  // fastify.get('/products/id/:id', productController.getProductById);


  // TODO: Add routes for:
  // - Search products
  fastify.get('/products/search', {
    schema: {
      summary: 'Search products',
      description: 'Searches for products by name, description, or SKU.',
      tags: ['Products'],
      querystring: {
        type: 'object',
        properties: {
          q: { type: 'string' },
          limit: { type: 'integer', minimum: 1, default: 10 },
          page: { type: 'integer', minimum: 1, default: 1 },
        },
        required: ['q'],
      },
    }
  }, productController.searchProducts);
  // - Get products by tags/attributes (more advanced filtering)

  // Sync routes
    fastify.post('/sync', {
        schema: {
            summary: 'Trigger a manual data synchronization',
            description: 'Starts the full data synchronization process from Dolibarr to the local database. This is an asynchronous operation.',
            tags: ['Sync'],
        }
    }, syncController.manualSync);
}

export default apiRoutes;
