-- Create the junction table for product_categories many-to-many relationship
CREATE TABLE product_categories_map (
    product_id INTEGER NOT NULL,
    category_id INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (product_id, category_id),
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
);

-- Create a trigger to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION trigger_set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_product_categories_map_updated_at
BEFORE UPDATE ON product_categories_map
FOR EACH ROW
EXECUTE FUNCTION trigger_set_timestamp();

-- Remove the old category_id column from the products table
-- Make sure to back up your data if this is a production system,
-- as this is a destructive change to the existing products table structure.
-- We will transfer existing data in the sync logic if needed, but the column itself will be removed.
ALTER TABLE products
DROP COLUMN IF EXISTS category_id;

-- Optional: Add an index for faster lookups if you query from category_id often
CREATE INDEX IF NOT EXISTS idx_product_categories_map_category_id ON product_categories_map(category_id);
CREATE INDEX IF NOT EXISTS idx_product_categories_map_product_id ON product_categories_map(product_id);

COMMENT ON TABLE product_categories_map IS 'Junction table to link products to multiple categories (many-to-many).';
COMMENT ON COLUMN product_categories_map.product_id IS 'Foreign key referencing the local product ID.';
COMMENT ON COLUMN product_categories_map.category_id IS 'Foreign key referencing the local category ID.';
