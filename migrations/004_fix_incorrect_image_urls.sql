-- Migration: 004_fix_incorrect_image_urls.sql
-- Updates existing product_images cdn_url to use the product's SKU (ref) as the folder.

BEGIN;

UPDATE product_images pi
SET cdn_url = 'https://cdn.stainedglass.tn/' || p.sku || '/' || pi.original_dolibarr_filename
FROM products p
WHERE pi.product_id = p.id
  AND p.sku IS NOT NULL
  AND p.sku != ''
  AND pi.original_dolibarr_filename IS NOT NULL
  AND pi.original_dolibarr_filename != '';

-- Then, remove any double slashes
UPDATE product_images
SET cdn_url = REGEXP_REPLACE(cdn_url, '([^:]\/)\/+', '\1', 'g')
WHERE cdn_url LIKE '%//%';

COMMIT;
