-- Atomic role create/update for /api/admin/roles.
-- The route used to insert the role, then its module grants, then read it back,
-- with an unchecked best-effort rollback in between; a failure after the commit
-- returned 500 without an audit entry. save_role writes the role row, the module
-- grants and the admin_audit_log entry in one transaction and returns the saved
-- role with its grants. Additive: no existing data changes.

CREATE OR REPLACE FUNCTION public.save_role(
    p_role_id uuid,
    p_fields jsonb,
    p_modules text[],
    p_actor uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public
AS $$
DECLARE
    v_role public.roles%ROWTYPE;
    v_action text;
BEGIN
    IF p_fields IS NULL OR jsonb_typeof(p_fields) <> 'object' THEN
        RAISE EXCEPTION 'Дүрийн мэдээлэл буруу байна' USING ERRCODE = '22023';
    END IF;

    IF p_role_id IS NULL THEN
        INSERT INTO public.roles (name, display_name, display_name_mn, description, can_write, can_delete, can_access_admin, is_system)
        VALUES (
            p_fields->>'name',
            p_fields->>'display_name',
            p_fields->>'display_name_mn',
            NULLIF(p_fields->>'description', ''),
            COALESCE((p_fields->>'can_write')::boolean, false),
            COALESCE((p_fields->>'can_delete')::boolean, false),
            COALESCE((p_fields->>'can_access_admin')::boolean, false),
            false
        )
        RETURNING * INTO v_role;
        v_action := 'role.create';
    ELSE
        -- Serialize concurrent saves of the same role.
        PERFORM 1 FROM public.roles WHERE id = p_role_id FOR UPDATE;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Дүр олдсонгүй' USING ERRCODE = 'P0002';
        END IF;
        UPDATE public.roles SET
            display_name = CASE WHEN p_fields ? 'display_name' THEN p_fields->>'display_name' ELSE display_name END,
            display_name_mn = CASE WHEN p_fields ? 'display_name_mn' THEN p_fields->>'display_name_mn' ELSE display_name_mn END,
            description = CASE WHEN p_fields ? 'description' THEN p_fields->>'description' ELSE description END,
            can_write = CASE WHEN p_fields ? 'can_write' THEN (p_fields->>'can_write')::boolean ELSE can_write END,
            can_delete = CASE WHEN p_fields ? 'can_delete' THEN (p_fields->>'can_delete')::boolean ELSE can_delete END,
            can_access_admin = CASE WHEN p_fields ? 'can_access_admin' THEN (p_fields->>'can_access_admin')::boolean ELSE can_access_admin END,
            updated_at = now()
        WHERE id = p_role_id
        RETURNING * INTO v_role;
        v_action := 'role.update';
    END IF;

    -- NULL keeps the current grants; an array replaces them.
    IF p_modules IS NOT NULL THEN
        DELETE FROM public.role_permissions WHERE role_id = v_role.id AND NOT (module = ANY (p_modules));
        INSERT INTO public.role_permissions (role_id, module)
        SELECT v_role.id, m FROM unnest(p_modules) AS m
        ON CONFLICT (role_id, module) DO NOTHING;
    END IF;

    INSERT INTO public.admin_audit_log (actor_id, action, target_id, meta)
    VALUES (p_actor, v_action, v_role.id::text, jsonb_build_object('name', v_role.name));

    RETURN to_jsonb(v_role) || jsonb_build_object('role_permissions', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('id', rp.id, 'module', rp.module) ORDER BY rp.module)
        FROM public.role_permissions rp
        WHERE rp.role_id = v_role.id
    ), '[]'::jsonb));
END;
$$;

REVOKE ALL ON FUNCTION public.save_role(uuid, jsonb, text[], uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_role(uuid, jsonb, text[], uuid) TO service_role;
