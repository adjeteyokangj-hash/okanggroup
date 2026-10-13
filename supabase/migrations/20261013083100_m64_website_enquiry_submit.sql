-- M64: Public website enquiry → Operations business_enquiries (SECURITY DEFINER RPC)
-- Does not change Supabase Auth settings. Does not grant anon INSERT on business_enquiries.

INSERT INTO public.lookup_values (lookup_type, code, label, sort_order) VALUES
  ('enquiry_type', 'mobile_app', 'Mobile application', 15),
  ('enquiry_type', 'business_software', 'Business software', 16),
  ('enquiry_type', 'automation', 'Automation', 17),
  ('enquiry_type', 'digital_solutions', 'Digital solutions', 18)
ON CONFLICT (lookup_type, code) DO NOTHING;

CREATE OR REPLACE FUNCTION public.submit_website_enquiry(
  p_organisation_name text,
  p_contact_name text,
  p_contact_email text,
  p_contact_phone text DEFAULT NULL,
  p_summary text DEFAULT '',
  p_enquiry_type text DEFAULT 'other'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public, pg_temp
AS $$
DECLARE
  v_org text := left(btrim(COALESCE(p_organisation_name, '')), 200);
  v_name text := left(btrim(COALESCE(p_contact_name, '')), 120);
  v_email text := lower(left(btrim(COALESCE(p_contact_email, '')), 254));
  v_phone text := NULLIF(left(btrim(COALESCE(p_contact_phone, '')), 40), '');
  v_summary text := left(btrim(COALESCE(p_summary, '')), 4000);
  v_type text := lower(btrim(COALESCE(p_enquiry_type, 'other')));
  v_allowed text[] := ARRAY[
    'new_website',
    'mobile_app',
    'business_software',
    'automation',
    'digital_solutions',
    'cms_management',
    'support',
    'other'
  ];
  v_recent int;
  v_id uuid;
  v_number text;
BEGIN
  IF v_org = '' OR v_name = '' OR v_email = '' OR v_summary = '' THEN
    RAISE EXCEPTION 'Organisation, contact name, email and message are required'
      USING ERRCODE = '22023';
  END IF;

  IF v_email !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$' THEN
    RAISE EXCEPTION 'A valid email address is required'
      USING ERRCODE = '22023';
  END IF;

  IF NOT (v_type = ANY (v_allowed)) THEN
    v_type := 'other';
  END IF;

  SELECT count(*)::int INTO v_recent
  FROM public.business_enquiries
  WHERE source = 'website'
    AND lower(contact_email::text) = v_email
    AND created_at > now() - interval '1 hour';

  IF v_recent >= 3 THEN
    RAISE EXCEPTION 'Too many enquiries from this email. Please try again later.'
      USING ERRCODE = '54000';
  END IF;

  INSERT INTO public.business_enquiries (
    enquiry_number,
    status,
    source,
    enquiry_type,
    organisation_name,
    contact_name,
    contact_email,
    contact_phone,
    summary,
    created_by,
    updated_by
  ) VALUES (
    'AUTO',
    'new',
    'website',
    v_type,
    v_org,
    v_name,
    v_email,
    v_phone,
    v_summary,
    NULL,
    NULL
  )
  RETURNING id, enquiry_number INTO v_id, v_number;

  -- Mirror lightweight record for Company CMS contact inbox (existing table).
  INSERT INTO public.contact_enquiries (name, email, message, status)
  VALUES (
    left(v_name || ' / ' || v_org, 200),
    v_email,
    left('[' || v_number || '] ' || v_type || E'\n' || v_summary, 4000),
    'new'
  );

  RETURN jsonb_build_object(
    'ok', true,
    'enquiry_id', v_id,
    'enquiry_number', v_number
  );
END;
$$;

REVOKE ALL ON FUNCTION public.submit_website_enquiry(text, text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_website_enquiry(text, text, text, text, text, text) TO anon, authenticated;

COMMENT ON FUNCTION public.submit_website_enquiry(text, text, text, text, text, text) IS
  'Public website contact form → business_enquiries (source=website). Rate-limited. No Auth changes.';
