import categoryController from '../controllers/categoryController.js';
import productController from '../controllers/productController.js';

// Define schema/validation for request/response if desired, using Fastify's schema capabilities.
// Example for listProducts query parameters:
const listProductsSchema = {
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
  params: {
    type: 'object',
    properties: {
      slug: { type: 'string' },
    },
    required: ['slug'],
  },
  // Define response schema for a single product
};


async function apiRoutes(fastify, options) {
  // Category Routes
  fastify.get('/categories', categoryController.getAllCategories);
  // fastify.get('/categories/:idOrSlug', categoryController.getCategory); // Example for single category

  // Product Routes
  fastify.get('/products', { schema: listProductsSchema }, productController.listProducts);
  fastify.get('/products/:slug', { schema: getProductBySlugSchema }, productController.getProductBySlug);
  // Consider an alternative by ID:
  // fastify.get('/products/id/:id', productController.getProductById);


  // TODO: Add routes for:
  // - Search products
  // - Get products by tags/attributes (more advanced filtering)
}

export default apiRoutes;
