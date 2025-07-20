-- Migration: 006_add_unique_constraint_to_product_images.sql
-- Adds a unique constraint to the product_images table.

BEGIN;

ALTER TABLE product_images
ADD CONSTRAINT uq_product_images_product_variant_original_filename
UNIQUE (product_id, variant_id, original_dolibarr_filename);

COMMIT;
