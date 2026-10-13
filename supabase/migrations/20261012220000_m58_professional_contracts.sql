-- M58: Professional contract management — body, quotation snapshot, templates, versions, workflow

-- ---------------------------------------------------------------------------
-- 1) Expand contracts status + body columns (preserve existing rows)
-- ---------------------------------------------------------------------------
ALTER TABLE public.contracts DROP CONSTRAINT IF EXISTS contracts_status_check;
ALTER TABLE public.contracts
  ADD CONSTRAINT contracts_status_check CHECK (
    status IN (
      'draft',
      'internal_review',
      'approved',
      'sent',
      'accepted',
      'active',
      'completed',
      'terminated',
      'cancelled',
      'rejected'
    )
  );

ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS project_id uuid,
  ADD COLUMN IF NOT EXISTS template_code text,
  ADD COLUMN IF NOT EXISTS version_no int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS parent_contract_id uuid,
  ADD COLUMN IF NOT EXISTS body_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS quotation_snapshot_json jsonb,
  ADD COLUMN IF NOT EXISTS acceptance_json jsonb,
  ADD COLUMN IF NOT EXISTS subtotal numeric(18, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_total numeric(18, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_terms text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contracts_project_tenant_fk') THEN
    ALTER TABLE public.contracts
      ADD CONSTRAINT contracts_project_tenant_fk
      FOREIGN KEY (client_id, project_id)
      REFERENCES public.projects (client_id, id)
      ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contracts_parent_fk') THEN
    ALTER TABLE public.contracts
      ADD CONSTRAINT contracts_parent_fk
      FOREIGN KEY (parent_contract_id)
      REFERENCES public.contracts (id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2) Templates (Owner-manageable without code changes)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.contract_templates (
  code text PRIMARY KEY,
  name text NOT NULL,
  description text,
  category text NOT NULL DEFAULT 'service'
    CHECK (category IN ('service', 'website', 'cms', 'mobile', 'support', 'other')),
  body_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS contract_templates_set_updated_at ON public.contract_templates;
CREATE TRIGGER contract_templates_set_updated_at BEFORE UPDATE ON public.contract_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.contract_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contract_templates FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS contract_templates_select ON public.contract_templates;
CREATE POLICY contract_templates_select ON public.contract_templates
  FOR SELECT TO authenticated
  USING (
    private.has_permission('finance.contracts.read')
    OR private.has_permission('finance.contracts.manage')
  );

DROP POLICY IF EXISTS contract_templates_write ON public.contract_templates;
CREATE POLICY contract_templates_write ON public.contract_templates
  FOR ALL TO authenticated
  USING (private.has_permission('finance.contracts.manage'))
  WITH CHECK (private.has_permission('finance.contracts.manage'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.contract_templates TO authenticated;

INSERT INTO public.contract_templates (code, name, description, category, body_json, sort_order)
VALUES (
  'okang_service_agreement',
  'OkangGroup Service Agreement',
  'Reusable master agreement for website, CMS, mobile and software delivery.',
  'service',
  jsonb_build_object(
    'scope_of_work',
    'OkangGroup will design, build and deliver the agreed digital solution described in the schedule of services, to a professional standard consistent with the accepted quotation.',
    'deliverables',
    jsonb_build_array(
      jsonb_build_object('title', 'Agreed solution delivery', 'description', 'Implementation of the accepted scope'),
      jsonb_build_object('title', 'Handover pack', 'description', 'Credentials, documentation and release notes as applicable')
    ),
    'milestones',
    jsonb_build_array(
      jsonb_build_object('title', 'Discovery / kick-off', 'due_offset_days', 7, 'description', 'Requirements confirmed'),
      jsonb_build_object('title', 'Build & review', 'due_offset_days', 30, 'description', 'Development and client review cycles'),
      jsonb_build_object('title', 'Launch / handover', 'due_offset_days', 45, 'description', 'Go-live or formal handover')
    ),
    'payment_schedule',
    jsonb_build_array(
      jsonb_build_object('label', 'Deposit', 'percent', 40, 'trigger', 'on_acceptance', 'description', 'Payable on contract acceptance'),
      jsonb_build_object('label', 'Progress', 'percent', 40, 'trigger', 'milestone', 'description', 'Payable at mid-project milestone'),
      jsonb_build_object('label', 'Final balance', 'percent', 20, 'trigger', 'on_completion', 'description', 'Payable on completion / go-live')
    ),
    'okang_responsibilities',
    'OkangGroup will provide competent personnel, communicate progress, protect confidential information, and deliver the agreed outputs within the contracted scope and currency.',
    'client_responsibilities',
    'The Client will provide timely feedback, content, access credentials and decisions required for delivery, and pay invoices according to the payment schedule.',
    'terms_and_conditions',
    E'1. Scope is limited to the services and amounts stated in this agreement and any attached quotation snapshot.\n2. Changes outside scope require a written amendment or revised quotation.\n3. Intellectual property in deliverables transfers to the Client upon full payment, unless otherwise agreed.\n4. Either party may terminate for material breach if not remedied within 14 days of written notice.\n5. Liability is limited to the contract value paid in the preceding 12 months, excluding fraud or wilful misconduct.\n6. This agreement is governed by the laws of England and Wales unless a different jurisdiction is agreed in writing.'
  ),
  10
)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  body_json = EXCLUDED.body_json,
  is_active = true,
  updated_at = now();

-- ---------------------------------------------------------------------------
-- 3) Version history (immutable snapshots of agreement body)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.contract_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES public.contracts (id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients (id) ON DELETE RESTRICT,
  version_no int NOT NULL,
  status text NOT NULL,
  title text NOT NULL,
  currency_code char(3) NOT NULL,
  value_amount numeric(18, 2),
  subtotal numeric(18, 2) NOT NULL DEFAULT 0,
  tax_total numeric(18, 2) NOT NULL DEFAULT 0,
  body_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  quotation_snapshot_json jsonb,
  change_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  UNIQUE (contract_id, version_no)
);

ALTER TABLE public.contract_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contract_versions FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS contract_versions_select ON public.contract_versions;
CREATE POLICY contract_versions_select ON public.contract_versions
  FOR SELECT TO authenticated
  USING (
    private.has_permission_on_client('finance.contracts.read', client_id)
    OR private.has_permission('finance.contracts.manage')
  );

DROP POLICY IF EXISTS contract_versions_insert ON public.contract_versions;
CREATE POLICY contract_versions_insert ON public.contract_versions
  FOR INSERT TO authenticated
  WITH CHECK (
    private.has_permission_on_client('finance.contracts.manage', client_id)
    OR private.has_permission('finance.contracts.manage')
  );

GRANT SELECT, INSERT ON public.contract_versions TO authenticated;

-- ---------------------------------------------------------------------------
-- 4) Helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.contract_can_edit(p_status text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT p_status IN ('draft', 'internal_review', 'rejected');
$$;

CREATE OR REPLACE FUNCTION private.contract_snapshot_version(
  p_contract public.contracts,
  p_note text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
BEGIN
  INSERT INTO public.contract_versions (
    contract_id, client_id, version_no, status, title, currency_code, value_amount,
    subtotal, tax_total, body_json, quotation_snapshot_json, change_note, created_by
  ) VALUES (
    p_contract.id, p_contract.client_id, p_contract.version_no, p_contract.status, p_contract.title,
    p_contract.currency_code, p_contract.value_amount, p_contract.subtotal, p_contract.tax_total,
    p_contract.body_json, p_contract.quotation_snapshot_json, p_note, auth.uid()
  )
  ON CONFLICT (contract_id, version_no) DO NOTHING;
END;
$$;

-- ---------------------------------------------------------------------------
-- 5) Save / create from accepted quotation
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.save_contract_draft(
  p_client_id uuid,
  p_title text,
  p_currency text,
  p_body jsonb,
  p_template_code text DEFAULT NULL,
  p_quotation_id uuid DEFAULT NULL,
  p_project_id uuid DEFAULT NULL,
  p_payment_terms text DEFAULT NULL,
  p_effective_on date DEFAULT NULL,
  p_ends_on date DEFAULT NULL,
  p_contract_id uuid DEFAULT NULL
)
RETURNS public.contracts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_quote public.quotations;
  v_row public.contracts;
  v_body jsonb := coalesce(p_body, '{}'::jsonb);
  v_services jsonb := '[]'::jsonb;
  v_subtotal numeric(18, 2) := 0;
  v_tax numeric(18, 2) := 0;
  v_total numeric(18, 2) := 0;
  v_snapshot jsonb;
  v_svc jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT private.has_permission('finance.contracts.manage') THEN
    RAISE EXCEPTION 'finance.contracts.manage required';
  END IF;
  IF p_client_id IS NULL OR btrim(coalesce(p_title, '')) = '' THEN
    RAISE EXCEPTION 'Client and title are required';
  END IF;

  -- Services totals from body.services (currency-specific, server-side)
  IF jsonb_typeof(v_body->'services') = 'array' THEN
    FOR v_svc IN SELECT value FROM jsonb_array_elements(v_body->'services')
    LOOP
      v_subtotal := v_subtotal + coalesce((v_svc->>'line_total')::numeric, 0);
    END LOOP;
  END IF;
  v_subtotal := round(coalesce(v_subtotal, 0), 2);
  v_tax := round(coalesce((v_body->>'tax_total')::numeric, 0), 2);
  v_total := round(v_subtotal + v_tax, 2);
  v_body := v_body || jsonb_build_object('tax_total', v_tax, 'subtotal', v_subtotal, 'total', v_total);

  IF p_quotation_id IS NOT NULL THEN
    SELECT * INTO v_quote FROM public.quotations WHERE id = p_quotation_id AND client_id = p_client_id;
    IF v_quote.id IS NULL THEN RAISE EXCEPTION 'Quotation not found for client'; END IF;
    IF v_quote.status <> 'accepted' THEN
      RAISE EXCEPTION 'Only accepted quotations can be linked (status=%)', v_quote.status;
    END IF;
  END IF;

  IF p_contract_id IS NULL THEN
    -- Immutable quotation snapshot at create time only
    IF v_quote.id IS NOT NULL THEN
      v_snapshot := jsonb_build_object(
        'quotation_id', v_quote.id,
        'quote_number', v_quote.quote_number,
        'status', v_quote.status,
        'currency_code', v_quote.currency_code,
        'subtotal', v_quote.subtotal,
        'tax_total', v_quote.tax_total,
        'total', v_quote.total,
        'lines_json', v_quote.lines_json,
        'notes', v_quote.notes,
        'valid_until', v_quote.valid_until,
        'snapshotted_at', now()
      );
      IF jsonb_typeof(v_body->'services') <> 'array' OR jsonb_array_length(v_body->'services') = 0 THEN
        v_services := coalesce(v_quote.lines_json, '[]'::jsonb);
        v_body := v_body || jsonb_build_object(
          'services', v_services,
          'subtotal', v_quote.subtotal,
          'tax_total', v_quote.tax_total,
          'total', v_quote.total
        );
        v_subtotal := v_quote.subtotal;
        v_tax := v_quote.tax_total;
        v_total := v_quote.total;
      END IF;
    END IF;

    INSERT INTO public.contracts (
      client_id, quotation_id, project_id, title, status, currency_code, value_amount,
      subtotal, tax_total, body_json, quotation_snapshot_json, template_code, payment_terms,
      effective_on, ends_on, terms_summary, created_by, updated_by, version_no
    ) VALUES (
      p_client_id, p_quotation_id, p_project_id, btrim(p_title), 'draft',
      upper(coalesce(nullif(p_currency, ''), v_quote.currency_code, 'GBP')),
      v_total, v_subtotal, v_tax, v_body, v_snapshot, p_template_code, p_payment_terms,
      p_effective_on, p_ends_on, left(coalesce(v_body->>'scope_of_work', ''), 500),
      v_uid, v_uid, 1
    )
    RETURNING * INTO v_row;

    PERFORM private.contract_snapshot_version(v_row, 'Initial draft');
  ELSE
    SELECT * INTO v_row FROM public.contracts WHERE id = p_contract_id AND client_id = p_client_id;
    IF v_row.id IS NULL THEN RAISE EXCEPTION 'Contract not found'; END IF;
    IF NOT private.contract_can_edit(v_row.status) THEN
      RAISE EXCEPTION 'Contract status % is not editable; create an amendment/revision', v_row.status;
    END IF;

    UPDATE public.contracts c SET
      title = btrim(p_title),
      project_id = p_project_id,
      template_code = coalesce(p_template_code, c.template_code),
      currency_code = upper(p_currency),
      body_json = v_body,
      subtotal = v_subtotal,
      tax_total = v_tax,
      value_amount = v_total,
      payment_terms = p_payment_terms,
      effective_on = p_effective_on,
      ends_on = p_ends_on,
      terms_summary = left(coalesce(v_body->>'scope_of_work', c.terms_summary), 500),
      updated_by = v_uid,
      updated_at = now()
      -- quotation_snapshot_json intentionally NOT updated
    WHERE c.id = p_contract_id
    RETURNING * INTO v_row;

    PERFORM private.contract_snapshot_version(v_row, 'Draft update');
  END IF;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.save_contract_draft(uuid, text, text, jsonb, text, uuid, uuid, text, date, date, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_contract_draft(uuid, text, text, jsonb, text, uuid, uuid, text, date, date, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.transition_contract_status(
  p_contract_id uuid,
  p_to_status text,
  p_note text DEFAULT NULL
)
RETURNS public.contracts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  v_row public.contracts;
  v_from text;
  v_allowed boolean := false;
BEGIN
  IF auth.uid() IS NULL OR NOT private.has_permission('finance.contracts.manage') THEN
    RAISE EXCEPTION 'finance.contracts.manage required';
  END IF;
  SELECT * INTO v_row FROM public.contracts WHERE id = p_contract_id FOR UPDATE;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'Contract not found'; END IF;
  v_from := v_row.status;

  v_allowed :=
    (v_from = 'draft' AND p_to_status IN ('internal_review', 'cancelled'))
    OR (v_from = 'internal_review' AND p_to_status IN ('approved', 'rejected', 'draft', 'cancelled'))
    OR (v_from = 'rejected' AND p_to_status IN ('draft', 'cancelled'))
    OR (v_from = 'approved' AND p_to_status IN ('sent', 'cancelled'))
    OR (v_from = 'sent' AND p_to_status IN ('accepted', 'rejected', 'cancelled'))
    OR (v_from = 'accepted' AND p_to_status IN ('active', 'cancelled'))
    OR (v_from = 'active' AND p_to_status IN ('completed', 'terminated'))
    OR (v_from = 'draft' AND p_to_status = 'approved'); -- Owner shortcut for small teams

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'Invalid transition % → %', v_from, p_to_status;
  END IF;

  -- Approvals / activation restricted to manage permission (already checked)

  UPDATE public.contracts SET
    status = p_to_status,
    updated_by = auth.uid(),
    updated_at = now(),
    version_no = CASE
      WHEN p_to_status IN ('approved', 'sent', 'accepted', 'active') THEN version_no
      ELSE version_no
    END
  WHERE id = p_contract_id
  RETURNING * INTO v_row;

  PERFORM private.contract_snapshot_version(v_row, coalesce(p_note, 'Status → ' || p_to_status));
  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.transition_contract_status(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.transition_contract_status(uuid, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.record_contract_acceptance(
  p_contract_id uuid,
  p_accepted_by_name text,
  p_accepted_by_email text DEFAULT NULL,
  p_method text DEFAULT 'recorded_in_okanggroup',
  p_evidence_note text DEFAULT NULL
)
RETURNS public.contracts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  v_row public.contracts;
BEGIN
  IF auth.uid() IS NULL OR NOT private.has_permission('finance.contracts.manage') THEN
    RAISE EXCEPTION 'finance.contracts.manage required';
  END IF;
  SELECT * INTO v_row FROM public.contracts WHERE id = p_contract_id FOR UPDATE;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'Contract not found'; END IF;
  IF v_row.status NOT IN ('sent', 'approved') THEN
    RAISE EXCEPTION 'Acceptance can only be recorded for sent/approved contracts';
  END IF;
  IF btrim(coalesce(p_accepted_by_name, '')) = '' THEN
    RAISE EXCEPTION 'Accepted-by name is required';
  END IF;

  UPDATE public.contracts SET
    status = 'accepted',
    acceptance_json = jsonb_build_object(
      'accepted_by_name', btrim(p_accepted_by_name),
      'accepted_by_email', nullif(btrim(coalesce(p_accepted_by_email, '')), ''),
      'method', coalesce(nullif(btrim(p_method), ''), 'recorded_in_okanggroup'),
      'evidence_note', nullif(btrim(coalesce(p_evidence_note, '')), ''),
      'document_version', version_no,
      'contract_number', contract_number,
      'recorded_at', now(),
      'recorded_by', auth.uid(),
      'legal_esignature', false,
      'disclaimer', 'Recorded acceptance evidence in OkangGroup — not a certified electronic signature provider.'
    ),
    updated_by = auth.uid(),
    updated_at = now()
  WHERE id = p_contract_id
  RETURNING * INTO v_row;

  PERFORM private.contract_snapshot_version(v_row, 'Client acceptance recorded');
  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.record_contract_acceptance(uuid, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_contract_acceptance(uuid, text, text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.revise_contract(p_contract_id uuid, p_note text DEFAULT NULL)
RETURNS public.contracts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  v_src public.contracts;
  v_new public.contracts;
BEGIN
  IF auth.uid() IS NULL OR NOT private.has_permission('finance.contracts.manage') THEN
    RAISE EXCEPTION 'finance.contracts.manage required';
  END IF;
  SELECT * INTO v_src FROM public.contracts WHERE id = p_contract_id;
  IF v_src.id IS NULL THEN RAISE EXCEPTION 'Contract not found'; END IF;
  IF v_src.status NOT IN ('accepted', 'active', 'sent', 'approved', 'rejected', 'completed') THEN
    RAISE EXCEPTION 'Contract cannot be revised from status %', v_src.status;
  END IF;

  INSERT INTO public.contracts (
    client_id, quotation_id, project_id, title, status, currency_code, value_amount,
    subtotal, tax_total, body_json, quotation_snapshot_json, template_code, payment_terms,
    effective_on, ends_on, terms_summary, parent_contract_id, version_no, created_by, updated_by
  ) VALUES (
    v_src.client_id, v_src.quotation_id, v_src.project_id,
    v_src.title || ' (Amendment)',
    'draft', v_src.currency_code, v_src.value_amount, v_src.subtotal, v_src.tax_total,
    v_src.body_json, v_src.quotation_snapshot_json, -- preserve original quote snapshot
    v_src.template_code, v_src.payment_terms, v_src.effective_on, v_src.ends_on, v_src.terms_summary,
    v_src.id, v_src.version_no + 1, auth.uid(), auth.uid()
  )
  RETURNING * INTO v_new;

  PERFORM private.contract_snapshot_version(
    v_new,
    coalesce(p_note, 'Amendment of ' || v_src.contract_number)
  );
  RETURN v_new;
END;
$$;

REVOKE ALL ON FUNCTION public.revise_contract(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.revise_contract(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_invoices_from_contract_schedule(p_contract_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  v_row public.contracts;
  v_item jsonb;
  v_created int := 0;
  v_percent numeric;
  v_amount numeric(18, 2);
  v_label text;
  v_total numeric(18, 2);
BEGIN
  IF auth.uid() IS NULL OR NOT (
    private.has_permission('finance.contracts.manage')
    OR private.has_permission('finance.invoices.manage')
  ) THEN
    RAISE EXCEPTION 'finance.contracts.manage or finance.invoices.manage required';
  END IF;

  SELECT * INTO v_row FROM public.contracts WHERE id = p_contract_id;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'Contract not found'; END IF;
  IF v_row.status NOT IN ('accepted', 'active') THEN
    RAISE EXCEPTION 'Invoices can only be generated from accepted/active contracts';
  END IF;

  v_total := coalesce(v_row.value_amount, v_row.subtotal + v_row.tax_total, 0);
  IF v_total <= 0 THEN RAISE EXCEPTION 'Contract has no value to invoice'; END IF;

  IF jsonb_typeof(v_row.body_json->'payment_schedule') <> 'array' THEN
    RAISE EXCEPTION 'Contract has no payment schedule';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(v_row.body_json->'payment_schedule')
  LOOP
    v_percent := coalesce((v_item->>'percent')::numeric, 0);
    v_amount := round(v_total * v_percent / 100.0, 2);
    v_label := coalesce(nullif(btrim(v_item->>'label'), ''), 'Contract instalment');
    IF v_amount <= 0 THEN CONTINUE; END IF;

    -- Skip if a draft/issued invoice already exists for this schedule label on the contract
    IF EXISTS (
      SELECT 1 FROM public.invoices i
      WHERE i.contract_id = v_row.id
        AND i.status <> 'void'
        AND i.notes ILIKE '%' || v_label || '%'
    ) THEN
      CONTINUE;
    END IF;

    INSERT INTO public.invoices (
      client_id, contract_id, quotation_id, project_id, status, currency_code,
      issue_date, due_date, subtotal, tax_total, total, amount_outstanding, notes, created_by
    ) VALUES (
      v_row.client_id, v_row.id, v_row.quotation_id, v_row.project_id, 'draft', v_row.currency_code,
      CURRENT_DATE, CURRENT_DATE + 14,
      v_amount, 0, v_amount, v_amount,
      'Generated from contract ' || v_row.contract_number || ' · ' || v_label,
      auth.uid()
    );
    v_created := v_created + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'created', v_created, 'contract_id', v_row.id);
END;
$$;

REVOKE ALL ON FUNCTION public.create_invoices_from_contract_schedule(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_invoices_from_contract_schedule(uuid) TO authenticated;
