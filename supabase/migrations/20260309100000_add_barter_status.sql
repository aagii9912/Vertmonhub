-- Add 'barter' status to property_status enum
-- Бартер: байр солилцоо, хөрөнгөөр солих

ALTER TYPE property_status ADD VALUE IF NOT EXISTS 'barter';

COMMENT ON TYPE property_status IS 'available: боломжтой, reserved: захиалсан, sold: зарагдсан, rented: түрээслэсэн, barter: бартер/солилцоо';
