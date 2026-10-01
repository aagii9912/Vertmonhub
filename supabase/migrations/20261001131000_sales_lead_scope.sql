-- Төслийн харьяалал + өөрт хуваарилсан лидийн хүрээ.
-- Түүхэн лид, менежерийн харьяаллыг тааж нөхөхгүй.
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.can_read_sales_lead(
    p_shop_id uuid, p_project_id uuid, p_manager_name text
) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
    v_user uuid := auth.uid();
    v_role text;
    v_name text;
    v_active boolean := false;
    v_linked_count integer;
    v_has_active_link boolean;
    v_has_active_legacy_match boolean := false;
BEGIN
    IF v_user IS NULL OR p_shop_id IS NULL OR p_shop_id NOT IN (SELECT public.get_user_shop_ids()) THEN RETURN false; END IF;
    SELECT role INTO v_role FROM public.user_roles WHERE user_id = v_user;
    IF v_role IN ('admin', 'super_admin') THEN RETURN true; END IF;

    SELECT count(*), coalesce(bool_or(is_active), false) INTO v_linked_count, v_has_active_link
    FROM public.sales_managers WHERE shop_id = p_shop_id AND user_id = v_user;
    IF v_linked_count = 1 THEN
        SELECT name, is_active INTO v_name, v_active
        FROM public.sales_managers WHERE shop_id = p_shop_id AND user_id = v_user;
    ELSIF v_linked_count = 0 THEN
        SELECT manager.is_active INTO v_has_active_legacy_match
        FROM public.sales_managers AS manager
        JOIN public.user_profiles AS profile ON profile.id = v_user AND profile.full_name = manager.name
        WHERE manager.shop_id = p_shop_id AND manager.user_id IS NULL;
    END IF;

    -- Нэрээрх legacy таарц эрх олгохгүй; админ акаунтыг user_id-аар холбоно.
    -- Идэвхтэй акаунтын давхардсан холбоос байгууллагын эрх болж өргөжихгүй.
    IF coalesce(v_role, 'viewer') <> 'sales_manager' AND NOT coalesce(v_active, false)
        AND NOT v_has_active_link AND NOT coalesce(v_has_active_legacy_match, false) THEN RETURN true; END IF;
    RETURN coalesce(v_active, false) AND p_project_id IS NOT NULL
        AND p_manager_name = v_name AND EXISTS (
            SELECT 1 FROM public.sales_manager_projects
            WHERE shop_id = p_shop_id AND project_id = p_project_id AND manager_name = v_name
        );
END;
$$;

CREATE OR REPLACE FUNCTION private.can_read_sales_lead_id(p_shop_id uuid, p_lead_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.leads
        WHERE id = p_lead_id AND shop_id = p_shop_id AND deleted_at IS NULL
            AND private.can_read_sales_lead(shop_id, project_id, sales_manager_name)
    );
$$;
REVOKE ALL ON FUNCTION private.can_read_sales_lead(uuid, uuid, text), private.can_read_sales_lead_id(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.can_read_sales_lead(uuid, uuid, text), private.can_read_sales_lead_id(uuid, uuid) TO authenticated, service_role;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
    ON public.leads, public.lead_activities, public.property_viewings, public.sales_managers, public.ai_attachments FROM PUBLIC, anon, authenticated;
REVOKE SELECT ON public.leads, public.lead_activities, public.property_viewings FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leads, public.lead_activities, public.property_viewings TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_managers, public.ai_attachments TO service_role;

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sales_lead_scope_read ON public.leads;
CREATE POLICY sales_lead_scope_read ON public.leads AS RESTRICTIVE FOR SELECT TO authenticated
    USING (deleted_at IS NULL AND private.can_read_sales_lead(shop_id, project_id, sales_manager_name));

ALTER TABLE public.lead_activities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sales_lead_scope_read ON public.lead_activities;
CREATE POLICY sales_lead_scope_read ON public.lead_activities AS RESTRICTIVE FOR SELECT TO authenticated
    USING (private.can_read_sales_lead_id(shop_id, lead_id));

ALTER TABLE public.property_viewings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sales_lead_scope_read ON public.property_viewings;
CREATE POLICY sales_lead_scope_read ON public.property_viewings AS RESTRICTIVE FOR SELECT TO authenticated
    USING (deleted_at IS NULL AND CASE WHEN lead_id IS NULL
        THEN private.can_read_sales_lead(shop_id, NULL, NULL)
        ELSE private.can_read_sales_lead_id(shop_id, lead_id) END);

ALTER TABLE public.ai_attachments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sales_lead_attachment_read ON public.ai_attachments;
CREATE POLICY sales_lead_attachment_read ON public.ai_attachments AS RESTRICTIVE FOR SELECT TO authenticated
    USING (shop_id IN (SELECT public.get_user_shop_ids()) AND
        (entity_type <> 'lead' OR private.can_read_sales_lead_id(shop_id, entity_id)));

DO $$
BEGIN
    IF to_regclass('public.lead_attribution_events') IS NOT NULL THEN
        EXECUTE 'DROP POLICY IF EXISTS sales_lead_scope_read ON public.lead_attribution_events';
        EXECUTE 'CREATE POLICY sales_lead_scope_read ON public.lead_attribution_events AS RESTRICTIVE FOR SELECT TO authenticated
            USING (CASE WHEN lead_id IS NULL THEN private.can_read_sales_lead(shop_id, NULL, NULL)
                ELSE private.can_read_sales_lead_id(shop_id, lead_id) END)';
    END IF;
END;
$$;

-- Service-role бичилт ч өөр төслийн менежерийг хуваарилж болохгүй.
CREATE OR REPLACE FUNCTION private.enforce_sales_lead_assignment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
    IF TG_OP = 'UPDATE' AND NEW.shop_id IS NOT DISTINCT FROM OLD.shop_id
        AND NEW.project_id IS NOT DISTINCT FROM OLD.project_id
        AND NEW.sales_manager_name IS NOT DISTINCT FROM OLD.sales_manager_name THEN RETURN NEW; END IF;
    IF NEW.project_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.projects WHERE id = NEW.project_id AND shop_id = NEW.shop_id
    ) THEN RAISE EXCEPTION 'Лидийн төсөл байгууллагад харьяалагдахгүй байна' USING ERRCODE = '23514'; END IF;
    IF nullif(btrim(NEW.sales_manager_name), '') IS NULL THEN RETURN NEW; END IF;
    IF NEW.project_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.sales_manager_projects AS membership
        JOIN public.sales_managers AS manager ON manager.shop_id = membership.shop_id
            AND manager.name = membership.manager_name AND manager.is_active
        WHERE membership.shop_id = NEW.shop_id AND membership.project_id = NEW.project_id
            AND membership.manager_name = NEW.sales_manager_name
    ) THEN RAISE EXCEPTION 'Тухайн төслийн идэвхтэй борлуулалтын менежерийг сонгоно уу' USING ERRCODE = '23514'; END IF;
    RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.enforce_sales_lead_assignment() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS enforce_sales_lead_assignment ON public.leads;
CREATE TRIGGER enforce_sales_lead_assignment BEFORE INSERT OR UPDATE OF shop_id, project_id, sales_manager_name
    ON public.leads FOR EACH ROW EXECUTE FUNCTION private.enforce_sales_lead_assignment();

CREATE INDEX IF NOT EXISTS leads_sales_project_scope_idx
    ON public.leads (shop_id, sales_manager_name, project_id) WHERE deleted_at IS NULL;
