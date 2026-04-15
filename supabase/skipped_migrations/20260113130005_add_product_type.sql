-- Add product type to distinguish between products and services
-- Run this in Supabase SQL Editor

-- Add type column (default 'product' for backwards compatibility)
ALTER TABLE products ADD COLUMN IF NOT EXISTS type VARCHAR(20) DEFAULT 'product';

-- type can be: 'product' (бараа бүтээгдэхүүн) or 'service' (үйлчилгээ)
-- For products: stock = тоо хэмжээ
-- For services: stock = боломжит захиалгын тоо (slots)

-- Add unit column for display (e.g., 'ширхэг', 'захиалга', 'цаг')
ALTER TABLE products ADD COLUMN IF NOT EXISTS unit VARCHAR(50) DEFAULT 'ширхэг';

-- Example usage:
-- Product: Гар утас, type='product', stock=10, unit='ширхэг' => "10 ширхэг байна"
-- Service: Зураг ялзлах, type='service', stock=5, unit='захиалга' => "5 захиалга авах боломжтой"
-- Service: Гоо сайхан, type='service', stock=3, unit='цаг' => "3 цаг сул байна"

-- Update existing products to have proper type (if needed)
-- UPDATE products SET type = 'service' WHERE name ILIKE '%үйлчилгээ%' OR name ILIKE '%засвар%';
