-- Independent Admin protection: existing role/provisioning APIs already use
-- service_role. Unlike the broader business boundary migration, this can be
-- applied before its companion surveys/marketing deployment.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
    ON public.user_roles, public.roles, public.role_permissions, public.shop_members
    FROM PUBLIC, anon, authenticated;

-- No active browser workflow consumes these server-side webhook records.
REVOKE ALL ON public.webhook_configs, public.webhook_logs FROM PUBLIC, anon, authenticated;

-- Attachment module metadata is part of the download authorization boundary.
-- Only the guarded API/tool may read or change it; legacy shop-only policies
-- must not let a member relabel a contract PDF as a readable lead attachment.
REVOKE ALL ON public.ai_attachments FROM PUBLIC, anon, authenticated;

-- Confidential AI uploads never share the public property-image buckets.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('ai-attachments', 'ai-attachments', false, 4194304,
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'])
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS private_attachments_server_only ON storage.objects;
CREATE POLICY private_attachments_server_only ON storage.objects AS RESTRICTIVE
    FOR ALL TO anon, authenticated
    USING (bucket_id <> 'ai-attachments') WITH CHECK (bucket_id <> 'ai-attachments');

NOTIFY pgrst, 'reload schema';
