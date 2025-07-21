-- Migration: 009_add_attributes_to_products.sql

BEGIN;

ALTER TABLE products
ADD COLUMN IF NOT EXISTS attributes JSONB;

COMMIT;
