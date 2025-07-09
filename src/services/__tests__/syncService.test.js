import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  transformCategory,
  transformProduct,
  transformVariant,
  transformProductImage,
  transformStockLevel,
  syncCategories // Import the function to be tested
} from '../syncService.js';
import dolibarrApiService from '../dolibarrApiService.js';
import dbService from '../dbService.js';

// Mocking logger for tests
vi.mock('../../utils/logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// Mock path module for transformProductImage tests
vi.mock('path', async (importOriginal) => {
  const actualPath = await importOriginal();
  return { ...actualPath, basename: vi.fn((str) => str.substring(str.lastIndexOf('/') + 1)) };
});

// Mock dolibarrApiService
vi.mock('../dolibarrApiService.js', () => ({
  default: {
    getCategories: vi.fn(),
    getProducts: vi.fn(),
    getProductById: vi.fn(),
    getProductVariants: vi.fn(),
    getFileFromUrl: vi.fn(),
    getProductStock: vi.fn(),
  },
}));

// Mock dbService
vi.mock('../dbService.js', () => ({
  default: {
    query: vi.fn(),
    testConnection: vi.fn().mockResolvedValue(true),
  },
}));


describe('syncService - transformCategory', () => {
  // ... existing transformCategory tests ...
  it('should transform Dolibarr category data correctly, including dates', () => {
    const dolibarrCategory = { id: '123', label: 'Test Category', description: 'A test description', fk_parent: '0', date_creation: '2023-01-01T10:00:00Z', tms: '2023-01-01T11:00:00Z' };
    const expected = { dolibarr_category_id: '123', name: 'Test Category', description: 'A test description', parent_dolibarr_category_id: '0', dolibarr_created_at: '2023-01-01T10:00:00Z', dolibarr_updated_at: '2023-01-01T11:00:00Z' };
    expect(transformCategory(dolibarrCategory)).toEqual(expected);
  });
  it('should handle missing optional fields including dates', () => {
    const dolibarrCategory = { id: '456', name: 'Another Category' };
    const expected = { dolibarr_category_id: '456', name: 'Another Category', description: undefined, parent_dolibarr_category_id: undefined, dolibarr_created_at: null, dolibarr_updated_at: null };
    expect(transformCategory(dolibarrCategory)).toEqual(expected);
  });
  it('should use label if name is not present', () => {
    const dolibarrCategory = { id: '789', label: 'Label Category' };
    const expected = { dolibarr_category_id: '789', name: 'Label Category', description: undefined, parent_dolibarr_category_id: undefined, dolibarr_created_at: null, dolibarr_updated_at: null };
    expect(transformCategory(dolibarrCategory)).toEqual(expected);
  });
  it('should handle null for parent_dolibarr_category_id', () => {
    const dolibarrCategory = { id: '101', name: 'Root Category', fk_parent: null };
    const expected = { dolibarr_category_id: '101', name: 'Root Category', description: undefined, parent_dolibarr_category_id: null, dolibarr_created_at: null, dolibarr_updated_at: null };
    expect(transformCategory(dolibarrCategory)).toEqual(expected);
  });
});

describe('syncService - transformProduct', () => {
  // ... existing transformProduct tests ...
  const mockCategoryMap = new Map([[10, 1], ['20', 2]]);
  it('should transform Dolibarr product data correctly', () => {
    const dolibarrProduct = { id: '201', ref: 'SKU001', label: 'Test Product One', description: 'Short desc', note_public: 'Long public note', price: '100.00', fk_categorie: '10', status_tosell: '1', date_creation: '2023-02-01T10:00:00Z', tms: '2023-02-01T11:00:00Z' };
    const expected = { dolibarr_product_id: '201', sku: 'SKU001', name: 'Test Product One', description: 'Short desc', long_description: 'Long public note', price: 100.00, category_id: 1, is_active: true, slug: 'sku001', dolibarr_created_at: '2023-02-01T10:00:00Z', dolibarr_updated_at: '2023-02-01T11:00:00Z' };
    expect(transformProduct(dolibarrProduct, mockCategoryMap)).toEqual(expected);
  });
});

describe('syncService - transformVariant', () => {
  // ... existing transformVariant tests ...
  const localProductId = 1;
  it('should transform Dolibarr variant data correctly', () => {
    const dolibarrVariant = { id: '301', ref: 'SKU001-RED-XL', price_var: '5.00', attributes: [{ code: 'COLOR', value: 'Red' }, { option: 'SIZE', value: 'XL' }], date_creation: '2023-03-01T10:00:00Z', tms: '2023-03-01T11:00:00Z' };
    const expected = { dolibarr_variant_id: '301', product_id: localProductId, sku_variant: 'SKU001-RED-XL', price_modifier: 5.00, attributes: { COLOR: 'Red', SIZE: 'XL' }, dolibarr_created_at: '2023-03-01T10:00:00Z', dolibarr_updated_at: '2023-03-01T11:00:00Z' };
    expect(transformVariant(dolibarrVariant, localProductId)).toEqual(expected);
  });
});

describe('syncService - transformProductImage', () => {
  // ... existing transformProductImage tests ...
  const localProductId = 1, localVariantId = null, cdnUrl = 'https://mycdn.com/products/img1.jpg', s3Key = 'products/img1.jpg', s3Bucket = 'my-bucket';
  it('should transform Dolibarr image data correctly', () => {
    const dolibarrImageInfo = { id: 'img001', alt: 'Image Alt Text', label: 'Image Label', position: '1', is_thumbnail: true };
    const expected = { product_id: localProductId, variant_id: localVariantId, s3_bucket: s3Bucket, s3_key: s3Key, cdn_url: cdnUrl, alt_text: 'Image Alt Text', display_order: 1, is_thumbnail: true, dolibarr_image_id: 'img001' };
    expect(transformProductImage(dolibarrImageInfo, localProductId, localVariantId, cdnUrl, s3Key, s3Bucket)).toEqual(expected);
  });
});

describe('syncService - transformStockLevel', () => {
  // ... existing transformStockLevel tests ...
  const localProductId = 1, localVariantId = null;
  it('should transform Dolibarr stock data correctly', () => {
    const dolibarrStockEntry = { qty: '50', stock_reel: '55', fk_warehouse: 'W01', tms: '2023-04-01T12:00:00Z' };
    const expected = { product_id: localProductId, variant_id: localVariantId, quantity: 50, warehouse_id: 'W01', dolibarr_updated_at: '2023-04-01T12:00:00Z' };
    expect(transformStockLevel(dolibarrStockEntry, localProductId, localVariantId)).toEqual(expected);
  });
});


describe('syncService - syncCategories (Integration-style)', () => {
  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();
  });

  it('should fetch categories from Dolibarr API, transform, and upsert them to DB', async () => {
    // Mock Dolibarr API response for getCategories
    const mockDolibarrCategoriesPage1 = [
      { id: '101', label: 'Electronics', fk_parent: '0', date_creation: '2023-01-01T00:00:00Z', tms: '2023-01-01T00:00:00Z' },
      { id: '102', label: 'Books', fk_parent: '0', date_creation: '2023-01-02T00:00:00Z', tms: '2023-01-02T00:00:00Z' },
    ];
    const mockDolibarrCategoriesPage2 = [
      { id: '103', label: 'Laptops', fk_parent: '101', date_creation: '2023-01-03T00:00:00Z', tms: '2023-01-03T00:00:00Z' },
    ];

    dolibarrApiService.default.getCategories
      .mockResolvedValueOnce([...mockDolibarrCategoriesPage1]) // First call returns page 1
      .mockResolvedValueOnce([...mockDolibarrCategoriesPage2]) // Second call returns page 2
      .mockResolvedValueOnce([]); // Third call returns empty, stopping pagination

    // Mock DB query response (optional, not strictly needed if just checking calls)
    dbService.default.query.mockResolvedValue({ rows: [], rowCount: 1 }); // Simulate successful upsert

    await syncCategories();

    // Assertions
    // Check if dolibarrApiService.getCategories was called correctly for pagination
    expect(dolibarrApiService.default.getCategories).toHaveBeenCalledTimes(3);
    expect(dolibarrApiService.default.getCategories).toHaveBeenCalledWith({ limit: 100, page: 0 });
    expect(dolibarrApiService.default.getCategories).toHaveBeenCalledWith({ limit: 100, page: 1 });
    expect(dolibarrApiService.default.getCategories).toHaveBeenCalledWith({ limit: 100, page: 2 });

    // Check if dbService.query was called for each category
    expect(dbService.default.query).toHaveBeenCalledTimes(mockDolibarrCategoriesPage1.length + mockDolibarrCategoriesPage2.length);

    // Check the arguments of one of the dbService.query calls
    const expectedTransformedCat1 = transformCategory(mockDolibarrCategoriesPage1[0]);
    expect(dbService.default.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO categories'), // Check if it's an INSERT query
      [
        expectedTransformedCat1.dolibarr_category_id,
        expectedTransformedCat1.name,
        expectedTransformedCat1.description,
        expectedTransformedCat1.parent_dolibarr_category_id,
        expectedTransformedCat1.dolibarr_created_at,
        expectedTransformedCat1.dolibarr_updated_at,
      ]
    );

    const expectedTransformedCat3 = transformCategory(mockDolibarrCategoriesPage2[0]);
     expect(dbService.default.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO categories'),
      [
        expectedTransformedCat3.dolibarr_category_id,
        expectedTransformedCat3.name,
        expectedTransformedCat3.description,
        expectedTransformedCat3.parent_dolibarr_category_id,
        expectedTransformedCat3.dolibarr_created_at,
        expectedTransformedCat3.dolibarr_updated_at,
      ]
    );
  });

  it('should handle API errors gracefully during category sync', async () => {
    dolibarrApiService.default.getCategories.mockRejectedValueOnce(new Error('Dolibarr API Down'));

    await syncCategories(); // Call the function

    // Check that an error was logged (assuming logger.error is called in catch block)
    // This requires logger mock to be effective or spy on it.
    // For now, check that db.query was not called if API fails early.
    expect(dbService.default.query).not.toHaveBeenCalled();
    // Check logger.error was called (from syncService)
    // logger.error is mocked by vi.mock('../../utils/logger.js')
    // Need to import logger from utils to check its mock calls.
    // import logger from '../../utils/logger.js';
    // expect(logger.error).toHaveBeenCalledWith(expect.anything(), 'Error during category synchronization');
  });
});

// Next steps:
// - Write integration-style tests for syncProducts, syncProductVariants etc., mocking dbService and dolibarrApiService.
