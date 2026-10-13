-- M36: Complete CMS E2E acceptance (native managed content store)
-- Mirrors admin UI RPCs via JWT claim impersonation. Production HOLD.
-- Run on development project only.

DO $$
DECLARE
  v_owner uuid := 'a7bce15a-566a-43df-aa93-4f23da8bb35f';
  v_daniel uuid := '928646aa-759b-42b5-a346-19aa71ead822';
  v_inst uuid := 'f5dfa20e-3c7a-4b89-b77d-ac53339a1edf';
  v_mod uuid := '1bf60faa-bc75-46cd-8182-20899ea6b78e';
  v_doc uuid;
  v_status text;
  v_body jsonb;
  v_body2 jsonb;
  v_rev_count int;
  v_rev_no int;
  v_denied boolean;
  v_title text := 'E2E Acceptance Home ' || to_char(now(), 'YYYYMMDD-HH24MISS');
  v_slug text := 'e2e-acceptance-' || to_char(now(), 'YYYYMMDDHH24MISS');
  v_pub_body jsonb;
  v_restored jsonb;
  v_audit int;
  v_fake uuid := gen_random_uuid();
  v_daniel_publish boolean;
  v_mfa int;
BEGIN
  -- Fixtures
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_daniel) THEN
    RAISE EXCEPTION 'FAIL missing Daniel auth user';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.cms_instance_grants
    WHERE cms_instance_id = v_inst AND profile_id = v_daniel AND revoked_at IS NULL
      AND can_edit AND can_submit AND NOT can_publish
  ) THEN
    RAISE EXCEPTION 'FAIL Daniel grant must be edit+submit without publish';
  END IF;

  SELECT count(*) INTO v_mfa
  FROM auth.mfa_factors
  WHERE user_id = v_owner AND status = 'verified';
  IF v_mfa < 1 THEN
    RAISE EXCEPTION 'FAIL Owner MFA not verified';
  END IF;

  v_body := jsonb_build_object(
    'version', 2,
    'brand', jsonb_build_object(
      'siteName', 'OKG E2E Site',
      'primaryColor', '#0b3d2e',
      'accentColor', '#c4a35a',
      'backgroundColor', '#f7f4ef',
      'surfaceColor', '#ffffff',
      'textColor', '#1a1a1a',
      'fontFamily', '"Manrope", system-ui, sans-serif',
      'headingFont', '"Syne", Georgia, serif'
    ),
    'tokens', jsonb_build_object(
      'pageBackground', '#f7f4ef',
      'cardSurface', '#fff8ef',
      'text', '#1a1a1a',
      'primary', '#0b3d2e',
      'accent', '#c4a35a',
      'surface', '#ffffff'
    ),
    'breakpoints', jsonb_build_object('desktop', 1200, 'tablet', 768, 'mobile', 390),
    'styles', '[]'::jsonb,
    'interactions', '[]'::jsonb,
    'tree', jsonb_build_array(
      jsonb_build_object(
        'id', gen_random_uuid()::text, 'type', 'header', 'name', 'Header', 'chrome', true,
        'style', jsonb_build_object('display','flex','padding','0.95rem 1.35rem','backgroundColor','#0b3d2e','color','#ffffff'),
        'children', jsonb_build_array(
          jsonb_build_object('id', gen_random_uuid()::text, 'type', 'heading', 'name', 'Brand', 'props', jsonb_build_object('text', 'OKG E2E Site'))
        )
      ),
      jsonb_build_object(
        'id', gen_random_uuid()::text, 'type', 'nav', 'name', 'Navigation', 'chrome', true,
        'style', jsonb_build_object('display','flex','padding','0.75rem 1.25rem','backgroundColor','#0b3d2e','color','#ffffff'),
        'children', jsonb_build_array(
          jsonb_build_object('id', gen_random_uuid()::text, 'type', 'text', 'name', 'Links', 'props', jsonb_build_object('text', 'Home · About · Services · Contact'))
        )
      ),
      jsonb_build_object(
        'id', gen_random_uuid()::text, 'type', 'frame', 'name', 'Hero',
        'style', jsonb_build_object('display','flex','direction','column','align','center','gap','0.85rem','padding','3rem 2rem','textAlign','center'),
        'children', jsonb_build_array(
          jsonb_build_object('id', gen_random_uuid()::text, 'type', 'heading', 'name', 'Heading', 'props', jsonb_build_object('text', 'Welcome to E2E')),
          jsonb_build_object('id', gen_random_uuid()::text, 'type', 'text', 'name', 'Body', 'props', jsonb_build_object('text', 'Built during acceptance testing.')),
          jsonb_build_object('id', gen_random_uuid()::text, 'type', 'button', 'name', 'CTA', 'props', jsonb_build_object('text', 'Get started', 'href', '#contact'))
        )
      ),
      jsonb_build_object(
        'id', gen_random_uuid()::text, 'type', 'frame', 'name', 'About text',
        'style', jsonb_build_object('padding','2rem','maxWidth','720px'),
        'children', jsonb_build_array(
          jsonb_build_object('id', gen_random_uuid()::text, 'type', 'heading', 'name', 'Heading', 'props', jsonb_build_object('text', 'About')),
          jsonb_build_object('id', gen_random_uuid()::text, 'type', 'text', 'name', 'Body', 'props', jsonb_build_object('text', 'Nested-ready text section.'))
        )
      ),
      jsonb_build_object(
        'id', gen_random_uuid()::text, 'type', 'grid', 'name', 'Cards',
        'style', jsonb_build_object('display','grid','gridColumns',3,'gap','1rem','padding','1.5rem'),
        'children', jsonb_build_array(
          jsonb_build_object('id', gen_random_uuid()::text, 'type', 'card', 'name', 'Card A', 'style', jsonb_build_object('cardColor','#fff8ef','padding','1rem'),
            'children', jsonb_build_array(jsonb_build_object('id', gen_random_uuid()::text, 'type', 'heading', 'name', 'T', 'props', jsonb_build_object('text', 'Card A')))),
          jsonb_build_object('id', gen_random_uuid()::text, 'type', 'card', 'name', 'Card B', 'style', jsonb_build_object('cardColor','#eef6ff','padding','1rem'),
            'children', jsonb_build_array(jsonb_build_object('id', gen_random_uuid()::text, 'type', 'heading', 'name', 'T', 'props', jsonb_build_object('text', 'Card B')))),
          jsonb_build_object('id', gen_random_uuid()::text, 'type', 'card', 'name', 'Card C', 'style', jsonb_build_object('cardColor','#f3fff0','padding','1rem'),
            'children', jsonb_build_array(jsonb_build_object('id', gen_random_uuid()::text, 'type', 'heading', 'name', 'T', 'props', jsonb_build_object('text', 'Card C'))))
        )
      ),
      jsonb_build_object(
        'id', gen_random_uuid()::text, 'type', 'image', 'name', 'Image',
        'props', jsonb_build_object('imagePath', null, 'imageAlt', 'Placeholder'),
        'style', jsonb_build_object('minHeight','160px','padding','1rem')
      ),
      jsonb_build_object(
        'id', gen_random_uuid()::text, 'type', 'footer', 'name', 'Footer', 'chrome', true,
        'style', jsonb_build_object('padding','1.5rem','textAlign','center'),
        'children', jsonb_build_array(
          jsonb_build_object('id', gen_random_uuid()::text, 'type', 'text', 'name', 'Copy', 'props', jsonb_build_object('text', '© OKG E2E · Privacy'))
        )
      )
    )
  );

  -- Daniel: create + save rich v2 draft (steps 1-8, 10 persistence)
  PERFORM set_config('request.jwt.claim.sub', v_daniel::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_daniel::text, 'role', 'authenticated')::text, true);

  v_doc := public.save_client_cms_document(v_inst, v_mod, v_slug, v_title, v_body, NULL, false);

  SELECT status, body_json INTO v_status, v_body2 FROM public.client_cms_documents WHERE id = v_doc;
  IF v_status IS DISTINCT FROM 'draft' THEN RAISE EXCEPTION 'FAIL expected draft, got %', v_status; END IF;
  IF (v_body2->>'version') IS DISTINCT FROM '2' THEN RAISE EXCEPTION 'FAIL body version not 2'; END IF;
  IF jsonb_array_length(v_body2->'tree') < 7 THEN RAISE EXCEPTION 'FAIL tree incomplete on save'; END IF;
  IF (v_body2->'tokens'->>'cardSurface') IS DISTINCT FROM '#fff8ef' THEN RAISE EXCEPTION 'FAIL tokens lost'; END IF;
  IF (v_body2->'tree'->0->>'type') IS DISTINCT FROM 'header' THEN RAISE EXCEPTION 'FAIL header missing'; END IF;
  IF (v_body2->'tree'->6->>'type') IS DISTINCT FROM 'footer' THEN RAISE EXCEPTION 'FAIL footer missing'; END IF;

  -- Edit (step 11 style) + save again = reopen persistence
  v_body2 := jsonb_set(v_body2, '{tree,2,children,0,props,text}', '"Welcome to E2E (edited)"'::jsonb);
  v_doc := public.save_client_cms_document(v_inst, v_mod, v_slug, v_title, v_body2, v_doc, false);

  SELECT count(*), min(revision_no) INTO v_rev_count, v_rev_no
  FROM public.client_cms_revisions WHERE document_id = v_doc;
  IF v_rev_count < 1 THEN RAISE EXCEPTION 'FAIL no revisions after saves'; END IF;

  -- Re-read document (step 10)
  SELECT body_json INTO v_body2 FROM public.client_cms_documents WHERE id = v_doc;
  IF (v_body2->'tree'->2->'children'->0->'props'->>'text') IS DISTINCT FROM 'Welcome to E2E (edited)' THEN
    RAISE EXCEPTION 'FAIL reopen lost edit';
  END IF;

  -- Submit as Daniel (12)
  PERFORM public.submit_client_cms_document(v_doc, 'E2E ready for review');
  SELECT status INTO v_status FROM public.client_cms_documents WHERE id = v_doc;
  IF v_status IS DISTINCT FROM 'in_review' THEN RAISE EXCEPTION 'FAIL expected in_review'; END IF;

  -- Daniel cannot publish (13)
  v_daniel_publish := EXISTS (
    SELECT 1 FROM public.cms_instance_grants
    WHERE cms_instance_id = v_inst AND profile_id = v_daniel AND revoked_at IS NULL AND can_publish
  );
  IF v_daniel_publish THEN RAISE EXCEPTION 'FAIL Daniel grant has publish'; END IF;

  v_denied := false;
  BEGIN
    PERFORM public.decide_client_cms_document(v_doc, true, 'daniel try');
  EXCEPTION WHEN OTHERS THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN RAISE EXCEPTION 'FAIL Daniel was able to publish'; END IF;

  -- Owner publish to native store (14, 16, 17) — not an external website
  PERFORM set_config('request.jwt.claim.sub', v_owner::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner::text, 'role', 'authenticated')::text, true);
  PERFORM public.decide_client_cms_document(v_doc, true, 'Owner approved E2E');

  SELECT status, body_json INTO v_status, v_pub_body FROM public.client_cms_documents WHERE id = v_doc;
  IF v_status IS DISTINCT FROM 'published' THEN RAISE EXCEPTION 'FAIL expected published, got %', v_status; END IF;
  IF (v_pub_body->'tree'->2->'children'->0->'props'->>'text') IS DISTINCT FROM 'Welcome to E2E (edited)' THEN
    RAISE EXCEPTION 'FAIL published body mismatch';
  END IF;

  -- Restore earliest revision (18) then confirm draft restored
  SELECT min(revision_no) INTO v_rev_no FROM public.client_cms_revisions WHERE document_id = v_doc;
  PERFORM public.restore_client_cms_document(v_doc, v_rev_no);
  SELECT status, body_json INTO v_status, v_restored FROM public.client_cms_documents WHERE id = v_doc;
  IF v_status IS DISTINCT FROM 'draft' THEN RAISE EXCEPTION 'FAIL restore should return draft'; END IF;
  IF v_restored IS NULL OR jsonb_typeof(v_restored->'tree') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'FAIL restore emptied tree';
  END IF;

  -- Audit (19)
  SELECT count(*) INTO v_audit
  FROM public.cms_audit_events
  WHERE cms_instance_id = v_inst
    AND created_at > now() - interval '30 minutes';
  IF v_audit < 1 THEN
    RAISE EXCEPTION 'FAIL no recent cms_audit_events';
  END IF;

  -- Isolation (20)
  PERFORM set_config('request.jwt.claim.sub', v_fake::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_fake::text, 'role', 'authenticated')::text, true);
  v_denied := false;
  BEGIN
    PERFORM public.save_client_cms_document(v_inst, v_mod, 'x', 'Nope', '{}'::jsonb, NULL, false);
  EXCEPTION WHEN OTHERS THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN RAISE EXCEPTION 'FAIL unauthenticated edit allowed'; END IF;

  RAISE NOTICE 'E2E_ACCEPTANCE_PASS doc=% final_status=% revs=% audits=%', v_doc, v_status, v_rev_count, v_audit;
END;
$$;

SELECT 'm36_cms_e2e_acceptance OK' AS result;
