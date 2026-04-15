-- Add missing columns for product features
alter table products
add column if not exists type text default 'physical' check (type in ('physical', 'service', 'appointment')),
add column if not exists images text[] default '{}',
add column if not exists colors text[] default '{}',
add column if not exists sizes text[] default '{}';

-- Migrate old image_url data to new images array
update products 
set images = array[image_url] 
where image_url is not null 
  and (images is null or images = '{}');
