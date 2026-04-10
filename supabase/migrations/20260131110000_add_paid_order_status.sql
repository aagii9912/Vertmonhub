-- Add 'paid' to order_status enum if not exists
-- This allows backward compatibility with legacy requests

DO $$
BEGIN
    -- Add 'paid' to the enum if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum 
        WHERE enumlabel = 'paid' 
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'order_status')
    ) THEN
        ALTER TYPE order_status ADD VALUE 'paid';
    END IF;
END$$;

-- End migration
SELECT 'Added paid status to order_status enum ✅' as result;
