-- M31b: Prefer "Owner" label for owner-role senders in task conversations

CREATE OR REPLACE FUNCTION private.profile_display_name(p_profile_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = private, public, pg_temp
AS $$
  SELECT CASE
    WHEN EXISTS (
      SELECT 1 FROM public.role_grants rg
      JOIN public.roles r ON r.id = rg.role_id AND r.code = 'owner' AND r.status = 'active'
      WHERE rg.profile_id = p_profile_id AND rg.status = 'active'
        AND (rg.ends_at IS NULL OR rg.ends_at > now())
    ) THEN 'Owner'
    ELSE COALESCE(NULLIF(trim(p.full_name), ''), p.email, 'Staff')
  END
  FROM public.profiles p WHERE p.id = p_profile_id;
$$;

UPDATE public.task_messages m
SET author_display_name = private.profile_display_name(m.author_id);
