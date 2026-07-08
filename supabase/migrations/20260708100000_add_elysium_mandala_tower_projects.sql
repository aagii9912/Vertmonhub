-- Vertmon Hub: Elysium + Mandala 360/365 Tower төслүүдийг нэмэх (2026-07-08)
--
-- projects хүснэгт нь /admin/import-ын төслийн сонголт, санхүүгийн P&L automap,
-- procurement зэрэгт ашиглагддаг. Компанийн бүртгэлд Mandala Garden-ээс гадна
-- дараах төслүүд дутуу байсныг нэмнэ:
--   • Elysium Residence  (ЭЛИЗИУМ)
--   • Mandala 360 Tower  (360 МАНДАЛА / 360 Мандала Тауэр)
--   • Mandala 365 Tower  (365 МАНДАЛА / 365 Мандала Тауэр)
--
-- Idempotent: data/run-migrations.mjs бүх migration-ыг дахин ажиллуулдаг тул
-- нэрэнд нь elysium/элизиум/360/365 орсон төсөл тухайн shop-д аль хэдийн
-- байвал дахин үүсгэхгүй.
--
-- Shop сонголт: төсөл аль хэдийн бүртгэдэг shop байвал түүнд (одоогийн
-- нэг-tenant орчинд Vertmon-ий үндсэн shop), үгүй бол хамгийн эртний shop-д
-- харьяалуулна (/api/leads-ын primary-shop дүрэмтэй ижил).

DO $$
DECLARE
    v_shop_id UUID;
    v_elysium_id UUID;
    v_inserted INTEGER := 0;
    v_linked INTEGER := 0;
BEGIN
    -- Төсөлтэй shop-ыг эхэлж сонгоно (Mandala Garden бүртгэлтэй shop г.м)
    SELECT shop_id INTO v_shop_id
    FROM projects
    GROUP BY shop_id
    ORDER BY COUNT(*) DESC, MIN(created_at) ASC
    LIMIT 1;

    -- Төсөлгүй орчинд: хамгийн эртний shop
    IF v_shop_id IS NULL THEN
        SELECT id INTO v_shop_id FROM shops ORDER BY created_at ASC LIMIT 1;
    END IF;

    IF v_shop_id IS NULL THEN
        RAISE NOTICE 'Төслийн seed алгасав: shop олдсонгүй';
        RETURN;
    END IF;

    -- ============================================
    -- 1) Elysium Residence
    -- ============================================
    SELECT id INTO v_elysium_id
    FROM projects
    WHERE shop_id = v_shop_id
      AND (name ILIKE '%elysium%' OR name ILIKE '%элизиум%')
    LIMIT 1;

    IF v_elysium_id IS NULL THEN
        INSERT INTO projects (shop_id, name, district, description, status)
        VALUES (
            v_shop_id,
            'Elysium Residence',
            'Хан-Уул',
            'ЭЛИЗИУМ — бизнес зэрэглэлийн орон сууцны төсөл. 2027 оны 2-р улиралд ашиглалтад орно.',
            'active'
        )
        RETURNING id INTO v_elysium_id;
        v_inserted := v_inserted + 1;
    END IF;

    -- Өмнө нь скриптээр орсон Elysium байруудыг төсөлд нь холбоно
    -- (scripts/import-elysium-b1-units.ts нэрийг үргэлж 'Elysium ' угтвартай үүсгэдэг).
    -- properties.project_id багана 20260707120000-д нэмэгдсэн — энэ файлыг SQL
    -- editor-т дангаар нь ажиллуулсан ч эвдрэхгүйн тулд баганыг шалгана.
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'properties'
          AND column_name = 'project_id'
    ) THEN
        UPDATE properties
        SET project_id = v_elysium_id
        WHERE shop_id = v_shop_id
          AND project_id IS NULL
          AND name LIKE 'Elysium %';
        GET DIAGNOSTICS v_linked = ROW_COUNT;
    END IF;

    -- ============================================
    -- 2) Mandala 360 Tower
    -- ============================================
    IF NOT EXISTS (
        SELECT 1 FROM projects
        WHERE shop_id = v_shop_id AND name LIKE '%360%'
    ) THEN
        INSERT INTO projects (shop_id, name, location, description, status)
        VALUES (
            v_shop_id,
            'Mandala 360 Tower',
            'Үндэсний цэцэрлэгт хүрээлэнгийн баруун хойно',
            '360 МАНДАЛА цамхаг (360 Мандала Тауэр). Elysium-ийн борлуулалтын алба энд байрладаг.',
            'active'
        );
        v_inserted := v_inserted + 1;
    END IF;

    -- ============================================
    -- 3) Mandala 365 Tower
    -- ============================================
    IF NOT EXISTS (
        SELECT 1 FROM projects
        WHERE shop_id = v_shop_id AND name LIKE '%365%'
    ) THEN
        INSERT INTO projects (shop_id, name, description, status)
        VALUES (
            v_shop_id,
            'Mandala 365 Tower',
            '365 МАНДАЛА цамхаг (365 Мандала Тауэр).',
            'active'
        );
        v_inserted := v_inserted + 1;
    END IF;

    RAISE NOTICE 'Төслийн seed: % шинэ төсөл нэмэгдэв, % Elysium байр төсөлд холбогдов (shop %)',
        v_inserted, v_linked, v_shop_id;
END $$;
