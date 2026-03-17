-- Authentication & OAuth Schema
-- Run this in Supabase SQL Editor

-- ============================================
-- USER PROFILES (extends Supabase Auth)
-- ============================================
CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- UPDATE SHOPS TABLE
-- ============================================
ALTER TABLE shops ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES user_profiles(id) ON DELETE CASCADE;
ALTER TABLE shops ADD COLUMN IF NOT EXISTS facebook_page_name TEXT;
ALTER TABLE shops ADD COLUMN IF NOT EXISTS facebook_page_access_token TEXT;
ALTER TABLE shops ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
ALTER TABLE shops ADD COLUMN IF NOT EXISTS setup_completed BOOLEAN DEFAULT false;

-- Index for faster lookup
CREATE INDEX IF NOT EXISTS idx_shops_user ON shops(user_id);
CREATE INDEX IF NOT EXISTS idx_shops_active ON shops(is_active) WHERE is_active = true;

-- ============================================
-- FACEBOOK OAUTH TOKENS
-- ============================================
CREATE TABLE IF NOT EXISTS facebook_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES user_profiles(id) ON DELETE CASCADE,
  facebook_user_id TEXT NOT NULL,
  access_token TEXT NOT NULL,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fb_tokens_user ON facebook_tokens(user_id);

-- ============================================
-- USER PAGES (Facebook pages user has access to)
-- ============================================
CREATE TABLE IF NOT EXISTS user_facebook_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES user_profiles(id) ON DELETE CASCADE,
  page_id TEXT NOT NULL,
  page_name TEXT NOT NULL,
  page_access_token TEXT NOT NULL,
  is_connected BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_pages ON user_facebook_pages(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_page_unique ON user_facebook_pages(user_id, page_id);

-- ============================================
-- TRIGGERS
-- ============================================

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO user_profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email)
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

-- Enable RLS
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE shops ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE facebook_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_facebook_pages ENABLE ROW LEVEL SECURITY;

-- User profiles policies
CREATE POLICY "Users can view own profile" ON user_profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON user_profiles
  FOR UPDATE USING (auth.uid() = id);

-- Shops policies
CREATE POLICY "Users can view own shops" ON shops
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can create shops" ON shops
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own shops" ON shops
  FOR UPDATE USING (user_id = auth.uid());

-- Products policies
CREATE POLICY "Users can view own products" ON products
  FOR SELECT USING (shop_id IN (SELECT id FROM shops WHERE user_id = auth.uid()));

CREATE POLICY "Users can create products" ON products
  FOR INSERT WITH CHECK (shop_id IN (SELECT id FROM shops WHERE user_id = auth.uid()));

CREATE POLICY "Users can update own products" ON products
  FOR UPDATE USING (shop_id IN (SELECT id FROM shops WHERE user_id = auth.uid()));

CREATE POLICY "Users can delete own products" ON products
  FOR DELETE USING (shop_id IN (SELECT id FROM shops WHERE user_id = auth.uid()));

-- Customers policies
CREATE POLICY "Users can view own customers" ON customers
  FOR SELECT USING (shop_id IN (SELECT id FROM shops WHERE user_id = auth.uid()));

-- Orders policies
CREATE POLICY "Users can view own orders" ON orders
  FOR SELECT USING (shop_id IN (SELECT id FROM shops WHERE user_id = auth.uid()));

CREATE POLICY "Users can update own orders" ON orders
  FOR UPDATE USING (shop_id IN (SELECT id FROM shops WHERE user_id = auth.uid()));

-- Chat history policies
CREATE POLICY "Users can view own chats" ON chat_history
  FOR SELECT USING (shop_id IN (SELECT id FROM shops WHERE user_id = auth.uid()));

-- Facebook tokens policies
CREATE POLICY "Users can manage own FB tokens" ON facebook_tokens
  FOR ALL USING (user_id = auth.uid());

-- User pages policies
CREATE POLICY "Users can manage own pages" ON user_facebook_pages
  FOR ALL USING (user_id = auth.uid());

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Manual customer stats update function (called from API)
CREATE OR REPLACE FUNCTION update_customer_stats_manual(
  p_customer_id UUID,
  p_amount DECIMAL
)
RETURNS VOID AS $$
BEGIN
  UPDATE customers 
  SET 
    total_orders = total_orders + 1,
    total_spent = total_spent + p_amount,
    is_vip = CASE WHEN total_spent + p_amount >= 1000000 THEN true ELSE is_vip END
  WHERE id = p_customer_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

SELECT 'Auth schema created successfully! ✅' as result;

