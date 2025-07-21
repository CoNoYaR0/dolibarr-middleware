-- Migration: 008_add_new_product_fields.sql

BEGIN;

-- Add new columns to products table
ALTER TABLE products
ADD COLUMN IF NOT EXISTS tax_rate DECIMAL(5, 2) DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS brand VARCHAR(255),
ADD COLUMN IF NOT EXISTS weight DECIMAL(10, 2),
ADD COLUMN IF NOT EXISTS weight_unit VARCHAR(10) DEFAULT 'kg',
ADD COLUMN IF NOT EXISTS height DECIMAL(10, 2),
ADD COLUMN IF NOT EXISTS width DECIMAL(10, 2),
ADD COLUMN IF NOT EXISTS depth DECIMAL(10, 2),
ADD COLUMN IF NOT EXISTS dimensions_unit VARCHAR(10) DEFAULT 'cm',
ADD COLUMN IF NOT EXISTS meta_keywords TEXT,
ADD COLUMN IF NOT EXISTS tags TEXT[];

-- Add new columns to product_variants table
ALTER TABLE product_variants
ADD COLUMN IF NOT EXISTS weight_modifier DECIMAL(10, 2) DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS dimensions_modifier JSONB;

-- Add new columns to stock_levels table
ALTER TABLE stock_levels
ADD COLUMN IF NOT EXISTS backorderable BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS stock_status VARCHAR(50) DEFAULT 'in_stock';

-- Create related_products table
CREATE TABLE IF NOT EXISTS related_products (
    id SERIAL PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    related_product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    relation_type VARCHAR(50) DEFAULT 'related', -- 'related', 'upsell', 'cross-sell'
    UNIQUE(product_id, related_product_id)
);

-- Create pricing_tiers table
CREATE TABLE IF NOT EXISTS pricing_tiers (
    id SERIAL PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    min_quantity INTEGER NOT NULL,
    price DECIMAL(12, 2) NOT NULL,
    UNIQUE(product_id, min_quantity)
);

COMMIT;
