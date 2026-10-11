-- M1: Identity — profiles, invitations, account_status_events + RLS
-- Target: prbgsnxpwyepdggdysnt (Release 1 only)

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users (id),
  email extensions.citext NOT NULL UNIQUE,
  full_name text NOT NULL,
  display_name text,
  phone text,
  avatar_url text,
  account_kind text NOT NULL CHECK (account_kind IN ('staff', 'client_user', 'system')),
  account_status text NOT NULL DEFAULT 'invited'
    CHECK (account_status IN ('invited', 'active', 'suspended', 'offboarded')),
  mfa_required boolean NOT NULL DEFAULT false,
  mfa_enforced_at timestamptz,
  last_login_at timestamptz,
  offboarded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL
);

CREATE INDEX profiles_account_kind_status_idx ON public.profiles (account_kind, account_status);
CREATE INDEX profiles_email_idx ON public.profiles (email);

CREATE TRIGGER profiles_set_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email extensions.citext NOT NULL,
  account_kind text NOT NULL CHECK (account_kind IN ('staff', 'client_user')),
  client_id uuid,
  invited_by uuid NOT NULL REFERENCES public.profiles (id),
  token_hash text NOT NULL UNIQUE,
  role_ids uuid[],
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  revoked_at timestamptz,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  CONSTRAINT invitations_client_kind_chk CHECK (
    (account_kind = 'client_user' AND client_id IS NOT NULL)
    OR (account_kind = 'staff' AND client_id IS NULL)
  )
);

CREATE TRIGGER invitations_set_updated_at
  BEFORE UPDATE ON public.invitations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.account_status_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  from_status text,
  to_status text NOT NULL,
  reason text,
  changed_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles FORCE ROW LEVEL SECURITY;
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invitations FORCE ROW LEVEL SECURITY;
ALTER TABLE public.account_status_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_status_events FORCE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION private.current_profile_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = private, public, pg_temp
AS $$
  SELECT p.id
  FROM public.profiles p
  WHERE p.id = auth.uid()
    AND p.account_status = 'active'
$$;

REVOKE ALL ON FUNCTION private.current_profile_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.current_profile_id() TO authenticated;

-- Bootstrap helpers: own profile readable; staff directory limited until M2 grants exist
CREATE POLICY profiles_select_self ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid());

CREATE POLICY profiles_update_self ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Profile insert: only via security definer trigger from auth.users (service) or later bootstrap
CREATE POLICY profiles_insert_service ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());

CREATE POLICY invitations_select_own_or_staff_pending ON public.invitations
  FOR SELECT TO authenticated
  USING (
    invited_by = auth.uid()
    OR email = (SELECT email FROM public.profiles WHERE id = auth.uid())
  );

CREATE POLICY account_status_events_select_self ON public.account_status_events
  FOR SELECT TO authenticated
  USING (profile_id = auth.uid());

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, account_kind, account_status)
  VALUES (
    NEW.id,
    COALESCE(NEW.email, NEW.id::text || '@unknown.local'),
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(COALESCE(NEW.email, 'user'), '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'account_kind', 'staff'),
    'active'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

GRANT SELECT, UPDATE ON public.profiles TO authenticated;
GRANT SELECT ON public.invitations TO authenticated;
GRANT SELECT ON public.account_status_events TO authenticated;
