-- Vertmon Hub: Хуучин e-commerce баганууд устгах (Phase 5, ДЕСТРУКТИВ)
-- `total_orders`, `total_spent`, `is_vip` нь Syncly e-commerce-ийн үлдэгдэл бөгөөд
-- үл хөдлөх хөрөнгийн CRM-д уншигдахаа больсон (код дотор reference байхгүй).
-- Энэ нь буцаах боломжгүй тул тусдаа, review хийгдэх migration болгож гаргав.

DROP INDEX IF EXISTS idx_customers_vip;

ALTER TABLE customers DROP COLUMN IF EXISTS total_orders;
ALTER TABLE customers DROP COLUMN IF EXISTS total_spent;
ALTER TABLE customers DROP COLUMN IF EXISTS is_vip;
