-- Төслийн лидийг зөвхөн тухайн төслийн борлуулалтын менежер хариуцна.
-- Өмнөх бүртгэлээс төслийн харьяалал таахгүй, өгөгдөл нөхөхгүй.
CREATE UNIQUE INDEX IF NOT EXISTS projects_shop_id_id_key
    ON public.projects (shop_id, id);

CREATE TABLE IF NOT EXISTS public.sales_manager_projects (
    shop_id uuid NOT NULL,
    manager_name text NOT NULL,
    project_id uuid NOT NULL,
    PRIMARY KEY (shop_id, manager_name, project_id),
    FOREIGN KEY (shop_id, manager_name) REFERENCES public.sales_managers (shop_id, name)
        ON UPDATE CASCADE ON DELETE CASCADE,
    FOREIGN KEY (shop_id, project_id) REFERENCES public.projects (shop_id, id)
        ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS sales_manager_projects_project_idx
    ON public.sales_manager_projects (shop_id, project_id);

ALTER TABLE public.sales_manager_projects ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.sales_manager_projects FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.sales_manager_projects TO service_role;

-- Бүртгэл, акаунт болон төслийн харьяалал нэг гүйлгээгээр хадгалагдана.
-- project_ids байхгүй бол хуучин харьяалал хадгална; [] бол цэвэрлэнэ.
CREATE OR REPLACE FUNCTION public.save_sales_manager_roster(
    p_shop_id uuid,
    p_managers jsonb
) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public
AS $$
DECLARE
    v_manager jsonb;
    v_name text;
BEGIN
    IF p_shop_id IS NULL OR p_managers IS NULL OR jsonb_typeof(p_managers) <> 'array'
        OR jsonb_array_length(p_managers) > 500 THEN
        RAISE EXCEPTION 'Менежерийн мэдээлэл буруу байна' USING ERRCODE = '22023';
    END IF;

    -- Нэг байгууллагын зэрэгцээ бүртгэл хадгалалтыг дарааллуулна.
    PERFORM id FROM public.shops WHERE id = p_shop_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Байгууллага олдсонгүй' USING ERRCODE = '22023';
    END IF;

    FOR v_manager IN SELECT value FROM jsonb_array_elements(p_managers) LOOP
        IF jsonb_typeof(v_manager) IS DISTINCT FROM 'object'
            OR jsonb_typeof(v_manager->'name') IS DISTINCT FROM 'string'
            OR jsonb_typeof(v_manager->'is_active') IS DISTINCT FROM 'boolean'
            OR length(btrim(v_manager->>'name')) NOT BETWEEN 1 AND 120
            OR (v_manager ? 'user_id' AND jsonb_typeof(v_manager->'user_id') NOT IN ('string', 'null')) THEN
            RAISE EXCEPTION 'Менежерийн мэдээлэл буруу байна' USING ERRCODE = '22023';
        END IF;
        IF EXISTS (SELECT 1 FROM jsonb_object_keys(v_manager) AS fields(key)
            WHERE key NOT IN ('name', 'is_active', 'user_id', 'project_ids')) THEN
            RAISE EXCEPTION 'Зөвшөөрөгдөөгүй менежерийн талбар' USING ERRCODE = '22023';
        END IF;
        IF v_manager->>'user_id' IS NOT NULL AND NOT EXISTS (
            SELECT 1 FROM public.shop_members
            WHERE shop_id = p_shop_id AND user_id = (v_manager->>'user_id')::uuid
        ) THEN
            RAISE EXCEPTION 'Менежерийн акаунт энэ байгууллагад харьяалагдахгүй байна' USING ERRCODE = '22023';
        END IF;
        IF v_manager ? 'project_ids' THEN
            IF jsonb_typeof(v_manager->'project_ids') IS DISTINCT FROM 'array' THEN
                RAISE EXCEPTION 'Менежерийн төслийн жагсаалт буруу байна' USING ERRCODE = '22023';
            END IF;
            IF jsonb_array_length(v_manager->'project_ids') > 500 OR EXISTS (
                SELECT 1 FROM jsonb_array_elements(v_manager->'project_ids') AS projects(value)
                WHERE jsonb_typeof(value) IS DISTINCT FROM 'string'
            ) THEN
                RAISE EXCEPTION 'Менежерийн төслийн жагсаалт буруу байна' USING ERRCODE = '22023';
            END IF;
            IF EXISTS (
                SELECT 1 FROM jsonb_array_elements_text(v_manager->'project_ids') AS supplied(id)
                LEFT JOIN public.projects AS project ON project.id = supplied.id::uuid AND project.shop_id = p_shop_id
                WHERE project.id IS NULL
            ) THEN
                RAISE EXCEPTION 'Менежерийн төсөл энэ байгууллагад харьяалагдахгүй байна' USING ERRCODE = '22023';
            END IF;
        END IF;
    END LOOP;

    IF (SELECT count(DISTINCT btrim(value->>'name')) FROM jsonb_array_elements(p_managers))
        <> jsonb_array_length(p_managers) THEN
        RAISE EXCEPTION 'Ижил нэртэй менежер давхар байна' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (
        SELECT user_id FROM (
            SELECT (value->>'user_id')::uuid AS user_id FROM jsonb_array_elements(p_managers)
            UNION ALL
            SELECT roster.user_id FROM public.sales_managers AS roster
            WHERE roster.shop_id = p_shop_id AND roster.name NOT IN (
                SELECT btrim(value->>'name') FROM jsonb_array_elements(p_managers)
            )
        ) AS linked WHERE user_id IS NOT NULL GROUP BY user_id HAVING count(*) > 1
    ) THEN
        RAISE EXCEPTION 'Нэг акаунтыг энэ байгууллагад олон менежерт холбож болохгүй' USING ERRCODE = '23505';
    END IF;

    FOR v_manager IN SELECT value FROM jsonb_array_elements(p_managers) LOOP
        v_name := btrim(v_manager->>'name');
        INSERT INTO public.sales_managers (shop_id, name, is_active, user_id)
        VALUES (p_shop_id, v_name, (v_manager->>'is_active')::boolean, (v_manager->>'user_id')::uuid)
        ON CONFLICT (shop_id, name) DO UPDATE
            SET is_active = EXCLUDED.is_active, user_id = EXCLUDED.user_id;

        IF v_manager ? 'project_ids' THEN
            DELETE FROM public.sales_manager_projects WHERE shop_id = p_shop_id AND manager_name = v_name;
            INSERT INTO public.sales_manager_projects (shop_id, manager_name, project_id)
            SELECT p_shop_id, v_name, id::uuid FROM jsonb_array_elements_text(v_manager->'project_ids') AS projects(id)
            ON CONFLICT (shop_id, manager_name, project_id) DO NOTHING;
        END IF;
    END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.save_sales_manager_roster(uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_sales_manager_roster(uuid, jsonb) TO service_role;
