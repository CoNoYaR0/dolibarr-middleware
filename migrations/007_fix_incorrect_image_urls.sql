-- Migration: 007_fix_incorrect_image_urls.sql
-- Updates existing product_images cdn_url to the correct format.

BEGIN;

UPDATE product_images
SET cdn_url = 'https://cdn.stainedglass.tn/' ||
              REPLACE(original_dolibarr_path, '/home/stainea/documents/produit/', '') || '/' ||
              original_dolibarr_filename
WHERE original_dolibarr_path IS NOT NULL
  AND original_dolibarr_path != ''
  AND original_dolibarr_filename IS NOT NULL
  AND original_dolibarr_filename != '';

-- Add subfolder based on product name
UPDATE product_images
SET cdn_url = 'https://cdn.stainedglass.tn/' ||
              SPLIT_PART(original_dolibarr_filename, '-', 1) || '/' ||
              original_dolibarr_filename
WHERE cdn_url LIKE 'https://cdn.stainedglass.tn/%';

-- Then, remove any double slashes
UPDATE product_images
SET cdn_url = REGEXP_REPLACE(cdn_url, '([^:]\/)\/+', '\1', 'g')
WHERE cdn_url LIKE '%//%';

COMMIT;
