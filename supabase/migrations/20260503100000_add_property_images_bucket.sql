-- Vertmon Hub: storage bucket for property images
-- Mirrors the products-bucket pattern from 20260119130000_create_storage.sql

INSERT INTO storage.buckets (id, name, public)
VALUES ('property-images', 'property-images', true)
ON CONFLICT (id) DO NOTHING;

-- Public can read property images
DROP POLICY IF EXISTS "Property Images Public Read" ON storage.objects;
CREATE POLICY "Property Images Public Read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'property-images');

-- Authenticated users can upload property images
DROP POLICY IF EXISTS "Property Images Authenticated Upload" ON storage.objects;
CREATE POLICY "Property Images Authenticated Upload"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'property-images' AND auth.role() = 'authenticated');

-- Authenticated users can update property images
DROP POLICY IF EXISTS "Property Images Authenticated Update" ON storage.objects;
CREATE POLICY "Property Images Authenticated Update"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'property-images' AND auth.role() = 'authenticated');

-- Authenticated users can delete property images
DROP POLICY IF EXISTS "Property Images Authenticated Delete" ON storage.objects;
CREATE POLICY "Property Images Authenticated Delete"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'property-images' AND auth.role() = 'authenticated');
