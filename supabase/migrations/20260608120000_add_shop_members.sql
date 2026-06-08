-- Vertmon Hub: Багийн гишүүнчлэл (shop_members)
-- Нэг компанийн дотоод систем — нэг shop-д олон ажилтан хандах боломжтой болгоно.
-- Өмнө нь shop-ийг зөвхөн shops.user_id (эзэн) ээр л resolve хийдэг байсан тул
-- super_admin-ийн үүсгэсэн ажилтан хоосон dashboard руу ордог байв.

-- Гишүүнчлэлийн хүснэгт
CREATE TABLE IF NOT EXISTS shop_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(shop_id, user_id)
);

-- Хурдан хайлтын индексүүд
CREATE INDEX IF NOT EXISTS idx_shop_members_shop_id ON shop_members(shop_id);
CREATE INDEX IF NOT EXISTS idx_shop_members_user_id ON shop_members(user_id);

-- Одоо байгаа shop эзэдийг гишүүнээр backfill хийх (тэд хандалтаа алдахгүй)
INSERT INTO shop_members (shop_id, user_id, role)
SELECT id, user_id, 'owner'
FROM shops
WHERE user_id IS NOT NULL
ON CONFLICT (shop_id, user_id) DO NOTHING;

-- RLS — серверийн service-role хандалт RLS-ийг алгасдаг ч аюулгүй байдлын үүднээс асаана
ALTER TABLE shop_members ENABLE ROW LEVEL SECURITY;

-- Хэрэглэгч өөрийн гишүүнчлэлийн мөрийг харна
CREATE POLICY "Members can view own membership"
    ON shop_members FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());

-- Зөвхөн admin дүртэй хэрэглэгч гишүүнчлэлийг удирдана
CREATE POLICY "Admins can manage membership"
    ON shop_members FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM user_roles ur
            WHERE ur.user_id = auth.uid() AND ur.role = 'admin'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM user_roles ur
            WHERE ur.user_id = auth.uid() AND ur.role = 'admin'
        )
    );

COMMENT ON TABLE shop_members IS 'Vertmon: shop-д хандах эрхтэй багийн гишүүд (нэг shop → олон ажилтан)';
COMMENT ON COLUMN shop_members.role IS 'owner: shop эзэн, member: багийн гишүүн';
