-- Migration: 001_initial_schema.sql

BEGIN;

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION trigger_set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Categories Table
CREATE TABLE IF NOT EXISTS categories (
    id SERIAL PRIMARY KEY,
    dolibarr_category_id INTEGER UNIQUE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    parent_dolibarr_category_id INTEGER, -- Cannot be a direct FK yet if parent might not exist
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    dolibarr_created_at TIMESTAMPTZ,
    dolibarr_updated_at TIMESTAMPTZ
);

CREATE TRIGGER set_categories_updated_at
BEFORE UPDATE ON categories
FOR EACH ROW
EXECUTE FUNCTION trigger_set_timestamp();

-- Products Table
CREATE TABLE IF NOT EXISTS products (
    id SERIAL PRIMARY KEY,
    dolibarr_product_id INTEGER UNIQUE NOT NULL,
    sku VARCHAR(100) UNIQUE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    long_description TEXT,
    price DECIMAL(12, 2), -- Increased precision for price
    currency_code VARCHAR(3) DEFAULT 'USD',
    category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    is_active BOOLEAN DEFAULT TRUE,
    meta_title VARCHAR(255),
    meta_description TEXT,
    slug VARCHAR(255) UNIQUE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    dolibarr_created_at TIMESTAMPTZ,
    dolibarr_updated_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_products_slug ON products(slug);
CREATE INDEX IF NOT EXISTS idx_products_category_id ON products(category_id);

CREATE TRIGGER set_products_updated_at
BEFORE UPDATE ON products
FOR EACH ROW
EXECUTE FUNCTION trigger_set_timestamp();

-- Product Variants Table
CREATE TABLE IF NOT EXISTS product_variants (
    id SERIAL PRIMARY KEY,
    dolibarr_variant_id INTEGER UNIQUE NOT NULL,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    sku_variant VARCHAR(100) UNIQUE,
    price_modifier DECIMAL(12, 2) DEFAULT 0.00, -- Price difference from base product or absolute price
    attributes JSONB, -- e.g., {"color": "Red", "size": "XL"}
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    dolibarr_created_at TIMESTAMPTZ,
    dolibarr_updated_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_product_variants_product_id ON product_variants(product_id);
CREATE INDEX IF NOT EXISTS idx_product_variants_attributes ON product_variants USING GIN (attributes); -- For searching/filtering by attributes

CREATE TRIGGER set_product_variants_updated_at
BEFORE UPDATE ON product_variants
FOR EACH ROW
EXECUTE FUNCTION trigger_set_timestamp();

-- Product Images Table
CREATE TABLE IF NOT EXISTS product_images (
    id SERIAL PRIMARY KEY,
    product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
    variant_id INTEGER REFERENCES product_variants(id) ON DELETE SET NULL, -- Can be NULL if image for base product
    s3_bucket VARCHAR(255),
    s3_key VARCHAR(1024),
    cdn_url VARCHAR(2048) NOT NULL,
    alt_text VARCHAR(255),
    display_order INTEGER DEFAULT 0,
    is_thumbnail BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    dolibarr_image_id VARCHAR(255),
    CONSTRAINT chk_product_or_variant_image CHECK (product_id IS NOT NULL OR variant_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_product_images_product_id ON product_images(product_id);
CREATE INDEX IF NOT EXISTS idx_product_images_variant_id ON product_images(variant_id);

CREATE TRIGGER set_product_images_updated_at
BEFORE UPDATE ON product_images
FOR EACH ROW
EXECUTE FUNCTION trigger_set_timestamp();

-- Stock Levels Table
CREATE TABLE IF NOT EXISTS stock_levels (
    id SERIAL PRIMARY KEY,
    product_id INTEGER, -- Can be NULL if variant_id is set
    variant_id INTEGER, -- Can be NULL if product_id is set
    quantity INTEGER NOT NULL DEFAULT 0,
    warehouse_id VARCHAR(100) DEFAULT 'default', -- Optional, if tracking stock per warehouse
    last_checked_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    dolibarr_updated_at TIMESTAMPTZ, -- Timestamp of last stock update in Dolibarr
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_stock_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    CONSTRAINT fk_stock_variant FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE CASCADE,
    CONSTRAINT chk_product_or_variant_stock CHECK (product_id IS NOT NULL OR variant_id IS NOT NULL),
    CONSTRAINT uq_stock_product_variant_warehouse UNIQUE (product_id, variant_id, warehouse_id)
);

CREATE INDEX IF NOT EXISTS idx_stock_levels_product_id ON stock_levels(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_levels_variant_id ON stock_levels(variant_id);

CREATE TRIGGER set_stock_levels_updated_at
BEFORE UPDATE ON stock_levels
FOR EACH ROW
EXECUTE FUNCTION trigger_set_timestamp();

-- Later, you might add a foreign key constraint for parent_dolibarr_category_id after all categories are inserted
-- ALTER TABLE categories ADD CONSTRAINT fk_parent_category FOREIGN KEY (parent_dolibarr_category_id) REFERENCES categories(dolibarr_category_id);
-- This is tricky with self-referencing by a non-primary key and initial data load. Often handled at application logic or with deferred constraints.

COMMIT;
