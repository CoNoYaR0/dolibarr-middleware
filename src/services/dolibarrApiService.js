import config from '../config/index.js';
import logger from '../utils/logger.js'; // Import shared logger
// Node.js 18+ has fetch globally available.
// For older versions or more features, you might use a library like axios or node-fetch.
// import fetch from 'node-fetch'; // Example if not using global fetch or need specific features

const BASE_URL = config.dolibarr.apiUrl.endsWith('/')
  ? config.dolibarr.apiUrl.slice(0, -1)
  : config.dolibarr.apiUrl;

const API_KEY = config.dolibarr.apiKey;
const TIMEOUT = config.dolibarr.timeout;

/**
 * Generic helper function to make requests to the Dolibarr API.
 * @param {string} endpoint - The API endpoint (e.g., '/products').
 * @param {object} [options={}] - Fetch options (method, headers, body, etc.).
 * @param {object} [params] - URL query parameters.
 * @returns {Promise<any>} The JSON response from the API.
 * @throws {Error} If the request fails or returns a non-ok status.
 */
async function request(endpoint, options = {}, params = {}, isDocument = false) {
  const url = new URL(`${BASE_URL}${endpoint}`);
  logger.info({ url }, 'Request URL:');

  // Add query parameters
  Object.keys(params).forEach(key => url.searchParams.append(key, params[key]));

  const defaultHeaders = {
    'Accept': isDocument ? 'application/octet-stream' : 'application/json',
    'DOLAPIKEY': API_KEY,
    ...options.headers,
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT);

  try {
    const response = await fetch(url.toString(), {
      ...options,
      headers: defaultHeaders,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      let errorData;
      try {
        errorData = await response.json();
      } catch {
        // If response is not JSON, use text
        errorData = { message: await response.text() };
      }
      const error = new Error(
        `Dolibarr API request failed: ${response.status} ${response.statusText} - Endpoint: ${endpoint}`
      );
      error.status = response.status;
      error.data = errorData; // Attach more detailed error info if available
      throw error;
    }

    // Handle cases where response might be empty for certain successful requests (e.g., 204 No Content)
    if (response.status === 204) {
      return null;
    }

    if (isDocument) {
      const contentType = response.headers.get('content-type') || 'application/octet-stream';
      const buffer = Buffer.from(await response.arrayBuffer());
      return { buffer, contentType };
    }

    return response.json();
  } catch (error) {
    clearTimeout(timeoutId);
    const logPayload = { err: error, endpoint, method: options.method || 'GET', url: url.toString() };
    if (error.name === 'AbortError') {
      logger.error(logPayload, `Dolibarr API request timed out after ${TIMEOUT}ms`);
      throw new Error(`Dolibarr API request timed out after ${TIMEOUT}ms - Endpoint: ${endpoint}`);
    }
    logger.error(logPayload, 'Dolibarr API request error');
    // Re-throw other errors (network, parsing, etc.)
    throw error;
  }
}

/**
 * Fetches a list of products.
 * @param {object} [queryParams={}] - Query parameters (e.g., limit, page, category).
 * See Dolibarr API documentation for available product query params.
 * @returns {Promise<Array<any>>} A list of products.
 */
async function getProducts(queryParams = {}) {
  // Default sort and limit, adjust as per Dolibarr API capabilities
  const defaults = {
    sortfield: 't.ref',
    sortorder: 'ASC',
    limit: 100, // Max limit might be 100 for some Dolibarr APIs
    ...queryParams,
  };
  return request('/products', {}, defaults);
}

/**
 * Fetches details for a single product.
 * @param {number|string} productId - The ID of the product.
 * @returns {Promise<object>} The product details.
 */
async function getProductById(productId) {
  const product = await request(`/products/${productId}`);
  const documents = await request('/documents', {}, { modulepart: 'product', id: productId });
  product.photos = documents;
  return product;
}

/**
 * Fetches a list of categories.
 * @param {object} [queryParams={}] - Query parameters.
 * See Dolibarr API documentation for available category query params.
 * @returns {Promise<Array<any>>} A list of categories.
 */
async function getCategories(queryParams = {}) {
  const defaults = {
    // sortfield: 't.rowid', // Changed from t.label, trying Dolibarr default from Swagger
    // sortorder: 'ASC', // Corresponding sort order for t.rowid
    limit: 100,
    ...queryParams,
  };
  // Removed sortfield and sortorder to use Dolibarr's absolute default for the endpoint
  const paramsToPass = { ...defaults };
  delete paramsToPass.sortfield;
  delete paramsToPass.sortorder;
  return request('/categories', {}, paramsToPass);
}

/**
 * Fetches details for a single category.
 * @param {number|string} categoryId - The ID of the category.
 * @returns {Promise<object>} The category details.
 */
async function getCategoryById(categoryId) {
  return request(`/categories/${categoryId}`);
}

// Add more functions as needed (e.g., getStock, getProductVariants, getOrders etc.)

/**
 * Fetches variants for a given product.
 * NOTE: The exact endpoint for variants in Dolibarr API needs to be verified.
 * This could be /products/{id}/variants or variants might be included in the /products/{id} response itself.
 * Adjust implementation based on actual Dolibarr API structure.
 * @param {number|string} productId - The ID of the parent product.
 * @param {object} [queryParams={}] - Query parameters.
 * @returns {Promise<Array<any>>} A list of product variants.
 */
async function getProductVariants(productId, queryParams = {}) {
  // Placeholder endpoint: verify and adjust this path!
  // Some APIs might return variants as part of the main product object,
  // in which case this function might not call a separate endpoint but extract from getProductById.
  // Or, variants might be a top-level resource filterable by product_id.
  // This example assumes a dedicated sub-resource endpoint.
  return request(`/products/${productId}/variants`, {}, queryParams);
}


async function getDocument(module_part, original_file) {
  return request('/documents/download', {}, { module_part, original_file }, true);
}

/**
 * Fetches stock information for a given product.
 * NOTE: The exact endpoint and structure for stock in Dolibarr API needs to be verified.
 * It might be /products/{id}/stock, or part of the main product data, or a global /stocklevel endpoint filterable by product.
 * This example assumes an endpoint that returns stock details for a product, potentially including per-warehouse and variant stock.
 * @param {number|string} dolibarrProductId - The Dolibarr ID of the product.
 * @param {object} [queryParams={}] - Query parameters (e.g., warehouse_id).
 * @returns {Promise<Array<any>|object>} Stock information. The structure will vary greatly.
 */
async function getProductStock(dolibarrProductId, queryParams = {}) {
  // Placeholder: Adjust endpoint. Common patterns:
  // 1. /products/{dolibarrProductId}/stocklevels
  // 2. /stocklevels?product_id={dolibarrProductId}
  // 3. Stock info might be part of the /products/{dolibarrProductId} response itself.
  // This example assumes a dedicated sub-resource or filterable endpoint.
  // Changed from /stocklevels to /stock based on Swagger spec and 404 errors
  logger.info({ dolibarrProductId, type: typeof dolibarrProductId }, 'getProductStock called with ID:'); // Diagnostic log
  return request(`/products/${dolibarrProductId}/stock`, {}, queryParams);
}

/**
 * Fetches the categories for a given product.
 * @param {number|string} dolibarrProductId - The ID of the product.
 * @returns {Promise<Array<any>>} A list of categories the product belongs to.
 */
async function getProductCategories(dolibarrProductId) {
  // Endpoint based on Dolibarr Swagger: /categories/object/{type}/{id}
  // where type is 'product'
  logger.info({ dolibarrProductId }, 'getProductCategories called for product ID:');
  return request(`/categories/object/product/${dolibarrProductId}`);
}

export default {
  getProducts,
  getProductById,
  getCategories,
  getCategoryById,
  getProductVariants,
  getProductStock,
  getProductCategories,
  getDocument,
};
