-- Migration: 002_update_product_images_for_ovh_cdn.sql
-- Adjusts the product_images table for the OVH CDN strategy.

BEGIN;

-- Make s3_bucket and s3_key nullable if they are not already (they are by default if not specified as NOT NULL)
-- This step might not be strictly necessary if they were already nullable, but it's good to be explicit.
ALTER TABLE product_images
  ALTER COLUMN s3_bucket DROP NOT NULL,
  ALTER COLUMN s3_key DROP NOT NULL;

-- Add new columns to store original Dolibarr image information
ALTER TABLE product_images
  ADD COLUMN IF NOT EXISTS original_dolibarr_filename VARCHAR(255),
  ADD COLUMN IF NOT EXISTS original_dolibarr_path TEXT;

-- Optional: Add a unique constraint if appropriate for your data.
-- This example assumes 'dolibarr_image_id' combined with 'product_id' should be unique.
-- If 'dolibarr_image_id' can be NULL, this constraint needs to be handled carefully
-- or a different unique key considered (e.g., based on cdn_url or original_dolibarr_filename if they are truly unique per product).
-- PostgreSQL treats NULLs as distinct in unique constraints, so multiple rows can have NULL for dolibarr_image_id.
-- A partial unique index might be better if dolibarr_image_id can be null but should be unique when NOT NULL:
-- CREATE UNIQUE INDEX IF NOT EXISTS uq_product_images_product_dolibarr_id_not_null
-- ON product_images (product_id, dolibarr_image_id)
-- WHERE dolibarr_image_id IS NOT NULL;
--
-- For the ON CONFLICT target used in syncService.js: (product_id, dolibarr_image_id)
-- For the ON CONFLICT target used in syncService.js: (product_id, original_dolibarr_filename)
-- We need a unique constraint on these columns.
ALTER TABLE product_images ADD CONSTRAINT uq_product_images_product_original_filename UNIQUE (product_id, original_dolibarr_filename);

COMMIT;
