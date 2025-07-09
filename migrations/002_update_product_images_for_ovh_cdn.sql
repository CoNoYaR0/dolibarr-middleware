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
-- We need a unique constraint on these columns.
-- If dolibarr_image_id can be null, this is tricky. Let's assume for now it should be populated.
-- If dolibarr_image_id is NOT always present from Dolibarr, the ON CONFLICT logic
-- in syncService.js needs to be re-evaluated (e.g., conflict on cdn_url or another reliable unique attribute).

-- For now, let's assume we want to enforce uniqueness when dolibarr_image_id is present for a product.
-- The previous upsert used ON CONFLICT (product_id, dolibarr_image_id)
-- This requires a UNIQUE constraint on (product_id, dolibarr_image_id)
-- If dolibarr_image_id can be NULL, this simple unique constraint might not be what you want,
-- as (1, NULL) and (1, NULL) would be allowed.
-- A common workaround is to make dolibarr_image_id NOT NULL if it's part of a UNIQUE key,
-- or use a partial unique index as commented above.
-- Given the existing upsert:
-- ALTER TABLE product_images ADD CONSTRAINT uq_product_images_product_dolibarr_id UNIQUE (product_id, dolibarr_image_id);
-- This line is commented out as it might fail if existing data has nulls or duplicates.
-- This needs careful consideration based on actual Dolibarr data.
-- The syncService.js currently uses `ON CONFLICT (product_id, dolibarr_image_id) DO UPDATE`,
-- which implies such a unique constraint is desired. If `dolibarr_image_id` can be null,
-- this needs to be handled (e.g. by coalescing nulls to a special value in the constraint,
-- or by ensuring `dolibarr_image_id` is always populated from Dolibarr data if it's the intended key).

logger.warn('Review the UNIQUE constraint for product_images table based on your Dolibarr data for dolibarr_image_id reliability.');

COMMIT;
