-- Add new columns to products table
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'physical',
ADD COLUMN IF NOT EXISTS colors TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS sizes TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS images TEXT[] DEFAULT '{}';

-- Make stock nullable for services
ALTER TABLE products 
ALTER COLUMN stock DROP NOT NULL;

-- Create storage bucket for products if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('products', 'products', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for products bucket

-- Allow public read access to product images
CREATE POLICY "Public Access"
ON storage.objects FOR SELECT
USING ( bucket_id = 'products' );

-- Allow authenticated users to upload product images
CREATE POLICY "Authenticated Upload"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK ( bucket_id = 'products' );

-- Allow users to update their own images (optional, but good for management)
CREATE POLICY "Owner Update"
ON storage.objects FOR UPDATE
TO authenticated
USING ( bucket_id = 'products' );

-- Allow users to delete their own images
CREATE POLICY "Owner Delete"
ON storage.objects FOR DELETE
TO authenticated
USING ( bucket_id = 'products' );

