-- Run in psql if products still use old Unsplash URLs (404 in Next/Image).
-- Each row gets a stable Picsum URL from its id.

UPDATE products
SET image_url = 'https://picsum.photos/seed/p-' || replace(id::text, '-', '') || '/800/600'
WHERE image_url IS NULL OR image_url ILIKE '%unsplash.com%';
