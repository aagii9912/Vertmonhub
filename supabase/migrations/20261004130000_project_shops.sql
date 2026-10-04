-- Төсөл = shop. Нэг shop нэг л төслийн мөртэй байна; төсөл дотор дэд төсөл үүсгэхгүй.
-- Шинэ төсөл үүсгэхэд shop, түүний төслийн мөр, ажилтнуудын гишүүнчлэл болон
-- admin_audit_log нэг гүйлгээнд хадгалагдана. Additive: одоо байгаа мөрийг өөрчлөхгүй.
-- Олон төсөлтэй хуучин shop-ийг scripts/migrate-project-shops.mjs тусад нь салгана.

-- 1. Нэг shop-д хоёр дахь төсөл нэмэх, эсвэл төслийг төсөлтэй shop руу зөөхийг хориглоно.
CREATE OR REPLACE FUNCTION private.enforce_one_project_per_shop()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
    IF TG_OP = 'UPDATE' AND NEW.shop_id IS NOT DISTINCT FROM OLD.shop_id THEN
        RETURN NEW;
    END IF;
    -- Нэг shop-д зэрэг нэмэх хүсэлтүүдийг дарааллуулна.
    PERFORM 1 FROM public.shops WHERE id = NEW.shop_id FOR UPDATE;
    IF EXISTS (SELECT 1 FROM public.projects WHERE shop_id = NEW.shop_id AND id <> NEW.id) THEN
        RAISE EXCEPTION 'Төсөл дотор дэд төсөл үүсгэхгүй. Шинэ төслийг тусдаа үүсгэнэ үү.'
            USING ERRCODE = '23505';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS projects_one_per_shop ON public.projects;
CREATE TRIGGER projects_one_per_shop
    BEFORE INSERT OR UPDATE OF shop_id ON public.projects
    FOR EACH ROW EXECUTE FUNCTION private.enforce_one_project_per_shop();

-- 2. Ганц төсөлтэй shop-ийн нэр төслийн нэрийг дагана (төсөл солих цэс shop-ийн нэрийг харуулна).
CREATE OR REPLACE FUNCTION private.sync_project_shop_name()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
    IF NEW.name IS DISTINCT FROM OLD.name AND NOT EXISTS (
        SELECT 1 FROM public.projects WHERE shop_id = NEW.shop_id AND id <> NEW.id
    ) THEN
        UPDATE public.shops SET name = NEW.name WHERE id = NEW.shop_id;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS projects_sync_shop_name ON public.projects;
CREATE TRIGGER projects_sync_shop_name
    AFTER UPDATE OF name ON public.projects
    FOR EACH ROW EXECUTE FUNCTION private.sync_project_shop_name();

-- 3. Шинэ төсөл = шинэ shop + түүний төслийн мөр + сонгосон ажилтнуудын гишүүнчлэл.
CREATE OR REPLACE FUNCTION public.create_project_shop(
    p_fields jsonb,
    p_member_ids uuid[],
    p_actor uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public
AS $$
DECLARE
    v_name text;
    v_status text;
    v_shop_id uuid;
    v_project public.projects%ROWTYPE;
    v_members uuid[];
BEGIN
    IF p_actor IS NULL OR p_fields IS NULL OR jsonb_typeof(p_fields) <> 'object' THEN
        RAISE EXCEPTION 'Төслийн мэдээлэл буруу байна' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM jsonb_object_keys(p_fields) AS fields(key)
        WHERE key NOT IN ('name', 'location', 'district', 'description', 'status')) THEN
        RAISE EXCEPTION 'Зөвшөөрөгдөөгүй төслийн талбар' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM jsonb_each(p_fields) AS fields(key, value)
        WHERE jsonb_typeof(value) NOT IN ('string', 'null')) THEN
        RAISE EXCEPTION 'Төслийн мэдээлэл буруу байна' USING ERRCODE = '22023';
    END IF;

    v_name := btrim(p_fields->>'name');
    v_status := coalesce(nullif(btrim(p_fields->>'status'), ''), 'active');
    IF v_name IS NULL OR length(v_name) NOT BETWEEN 1 AND 160 THEN
        RAISE EXCEPTION 'Төслийн нэр 1–160 тэмдэгт байна' USING ERRCODE = '22023';
    END IF;
    IF v_status NOT IN ('active', 'planned', 'on_hold', 'completed') THEN
        RAISE EXCEPTION 'Төслийн төлөв буруу байна' USING ERRCODE = '22023';
    END IF;
    IF length(coalesce(p_fields->>'location', '')) > 200
        OR length(coalesce(p_fields->>'district', '')) > 120
        OR length(coalesce(p_fields->>'description', '')) > 2000 THEN
        RAISE EXCEPTION 'Төслийн мэдээлэл хэт урт байна' USING ERRCODE = '22023';
    END IF;

    -- Төсөл үүсгэх хүсэлтүүдийг дарааллуулж, нэрийн давхардлыг найдвартай шалгана.
    PERFORM pg_advisory_xact_lock(hashtext('public.create_project_shop'));
    IF EXISTS (SELECT 1 FROM public.projects WHERE lower(btrim(name)) = lower(v_name))
        OR EXISTS (SELECT 1 FROM public.shops WHERE lower(btrim(name)) = lower(v_name)) THEN
        RAISE EXCEPTION 'Ийм нэртэй төсөл аль хэдийн байна' USING ERRCODE = '23505';
    END IF;

    SELECT coalesce(array_agg(DISTINCT member), '{}') INTO v_members
    FROM unnest(coalesce(p_member_ids, '{}'::uuid[]) || ARRAY[p_actor]) AS members(member)
    WHERE member IS NOT NULL;
    IF cardinality(v_members) > 200 THEN
        RAISE EXCEPTION 'Нэг удаад 200-аас олон ажилтан нэмэхгүй' USING ERRCODE = '22023';
    END IF;
    -- Зөвхөн дүртэй (системийн) хэрэглэгчийг гишүүн болгоно.
    IF EXISTS (SELECT 1 FROM unnest(v_members) AS members(member)
        WHERE NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = member)) THEN
        RAISE EXCEPTION 'Сонгосон ажилтан олдсонгүй' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.shops (name, is_active, setup_completed)
    VALUES (v_name, true, true)
    RETURNING id INTO v_shop_id;

    INSERT INTO public.projects (shop_id, name, location, district, description, status)
    VALUES (
        v_shop_id, v_name,
        nullif(btrim(p_fields->>'location'), ''),
        nullif(btrim(p_fields->>'district'), ''),
        nullif(btrim(p_fields->>'description'), ''),
        v_status
    )
    RETURNING * INTO v_project;

    INSERT INTO public.shop_members (shop_id, user_id, role)
    SELECT v_shop_id, member, 'member' FROM unnest(v_members) AS members(member)
    ON CONFLICT (shop_id, user_id) DO NOTHING;

    INSERT INTO public.admin_audit_log (actor_id, action, target_id, meta)
    VALUES (p_actor, 'project.create', v_project.id::text,
        jsonb_build_object('shop_id', v_shop_id, 'name', v_name, 'members', cardinality(v_members)));

    RETURN to_jsonb(v_project) || jsonb_build_object('shops', jsonb_build_object('name', v_name));
END;
$$;

REVOKE ALL ON FUNCTION public.create_project_shop(jsonb, uuid[], uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_project_shop(jsonb, uuid[], uuid) TO service_role;
