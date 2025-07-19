-- Migration: 005_add_data_for_assiette_sidibou.sql
-- Adds missing data for the 'assiette-sidibou' product.

BEGIN;

-- Update product description and created_at
UPDATE products
SET
  description = 'A beautiful, handcrafted glass plate from Sidi Bou Said, Tunisia. Each plate is unique and features a stunning design inspired by the traditional art of the region.',
  dolibarr_created_at = '2023-10-26 10:00:00'
WHERE slug = 'assiette-sidibou';

-- Add product images
INSERT INTO product_images (product_id, cdn_url, alt_text, display_order, is_thumbnail)
SELECT id, 'https://cdn.stainedglass.tn/Assiette_sidibou/Assiette_sidibou-1.png', 'Assiette sidibou 1', 0, true
FROM products WHERE slug = 'assiette-sidibou';

INSERT INTO product_images (product_id, cdn_url, alt_text, display_order, is_thumbnail)
SELECT id, 'https://cdn.stainedglass.tn/Assiette_sidibou/Assiette_sidibou-2.jpg', 'Assiette sidibou 2', 1, false
FROM products WHERE slug = 'assiette-sidibou';

-- Add stock levels
INSERT INTO stock_levels (product_id, warehouse_id, quantity)
SELECT id, 'default', 10
FROM products WHERE slug = 'assiette-sidibou';

COMMIT;
