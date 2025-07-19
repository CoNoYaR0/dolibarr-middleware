-- Migration: 004_fix_incorrect_image_urls.sql
-- Updates existing product_images cdn_url to include the product folder.

BEGIN;

UPDATE product_images
SET cdn_url = 'https://cdn.stainedglass.tn/' || split_part(original_dolibarr_path, '/', 1) || '/' || original_dolibarr_filename
WHERE original_dolibarr_path IS NOT NULL
  AND original_dolibarr_path != ''
  AND original_dolibarr_filename IS NOT NULL
  AND original_dolibarr_filename != ''
  AND cdn_url NOT LIKE 'https://cdn.stainedglass.tn/' || split_part(original_dolibarr_path, '/', 1) || '/%';

COMMIT;
