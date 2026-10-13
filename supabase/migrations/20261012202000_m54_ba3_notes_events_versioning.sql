-- M54 BA-3: notes_internal hard-guard for client users; invoice/doc event emits

-- Move sensitive client notes behind staff-only table (portal cannot SELECT)
CREATE TABLE IF NOT EXISTS public.client_private_notes (
  client_id uuid PRIMARY KEY REFERENCES public.clients (id) ON DELETE CASCADE,
  notes_internal text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL
);

ALTER TABLE public.client_private_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_private_notes FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS client_private_notes_select ON public.client_private_notes;
CREATE POLICY client_private_notes_select ON public.client_private_notes
  FOR SELECT TO authenticated
  USING (
    private.has_permission_on_client('clients.read', client_id)
    OR private.has_permission('clients.manage')
  );

DROP POLICY IF EXISTS client_private_notes_write ON public.client_private_notes;
CREATE POLICY client_private_notes_write ON public.client_private_notes
  FOR ALL TO authenticated
  USING (
    private.has_permission_on_client('clients.manage', client_id)
    OR private.has_permission('clients.manage')
  )
  WITH CHECK (
    private.has_permission_on_client('clients.manage', client_id)
    OR private.has_permission('clients.manage')
  );

GRANT SELECT, INSERT, UPDATE ON public.client_private_notes TO authenticated;

INSERT INTO public.client_private_notes (client_id, notes_internal, updated_by)
SELECT c.id, c.notes_internal, NULL
FROM public.clients c
WHERE c.notes_internal IS NOT NULL
  AND length(trim(c.notes_internal)) > 0
ON CONFLICT (client_id) DO UPDATE
SET notes_internal = COALESCE(public.client_private_notes.notes_internal, EXCLUDED.notes_internal);

-- Clear legacy column so client SELECT on clients cannot leak notes
UPDATE public.clients SET notes_internal = NULL WHERE notes_internal IS NOT NULL;

CREATE OR REPLACE FUNCTION private.block_clients_notes_internal_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public, pg_temp
AS $$
BEGIN
  IF NEW.notes_internal IS NOT NULL AND length(trim(NEW.notes_internal)) > 0 THEN
    INSERT INTO public.client_private_notes (client_id, notes_internal, updated_by, updated_at)
    VALUES (NEW.id, NEW.notes_internal, auth.uid(), now())
    ON CONFLICT (client_id) DO UPDATE
      SET notes_internal = EXCLUDED.notes_internal,
          updated_by = EXCLUDED.updated_by,
          updated_at = now();
    NEW.notes_internal := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_clients_redirect_notes_internal ON public.clients;
CREATE TRIGGER trg_clients_redirect_notes_internal
  BEFORE INSERT OR UPDATE OF notes_internal ON public.clients
  FOR EACH ROW EXECUTE FUNCTION private.block_clients_notes_internal_write();

-- Wrap issue_invoice to emit client notification (no internal notes)
CREATE OR REPLACE FUNCTION public.issue_invoice(p_invoice_id uuid)
RETURNS public.invoices
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public, pg_temp
AS $$
DECLARE
  v_inv public.invoices%ROWTYPE;
  rid uuid;
  v_rule public.automation_rules%ROWTYPE;
BEGIN
  IF NOT private.has_permission('finance.invoices.issue') THEN
    RAISE EXCEPTION 'Not authorised to issue invoices';
  END IF;
  SELECT * INTO v_inv FROM public.invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invoice not found'; END IF;
  IF v_inv.status <> 'draft' THEN RAISE EXCEPTION 'Only draft invoices can be issued'; END IF;

  UPDATE public.invoices
  SET status = 'issued',
      issue_date = COALESCE(issue_date, CURRENT_DATE),
      due_date = COALESCE(due_date, CURRENT_DATE + 30),
      amount_outstanding = total - amount_paid - amount_credited,
      updated_by = auth.uid()
  WHERE id = p_invoice_id
  RETURNING * INTO v_inv;

  SELECT * INTO v_rule FROM public.automation_rules WHERE code = 'invoice_issued_event' AND enabled;
  IF FOUND THEN
    FOR rid IN SELECT profile_id FROM private.client_member_ids(v_inv.client_id)
    LOOP
      PERFORM public.emit_notification(
        rid, 'invoice_issued',
        'New invoice available',
        'Invoice ' || COALESCE(v_inv.invoice_number, '') || ' for ' || v_inv.currency_code || ' ' || v_inv.total::text,
        'invoice_issued:' || v_inv.id::text || ':' || rid::text,
        'info', 'invoice_issued_event', v_inv.client_id, NULL, v_inv.id, NULL,
        'invoice', v_inv.id, '/portal/invoices', COALESCE(v_rule.channels_json, '["in_app"]'::jsonb), auth.uid()
      );
    END LOOP;
  END IF;

  RETURN v_inv;
END;
$$;

REVOKE ALL ON FUNCTION public.issue_invoice(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.issue_invoice(uuid) TO authenticated;

-- Notify clients when a document becomes client_visible + pending
CREATE OR REPLACE FUNCTION private.notify_document_shared()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public, pg_temp
AS $$
DECLARE
  rid uuid;
  v_rule public.automation_rules%ROWTYPE;
  v_should boolean := false;
BEGIN
  IF NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    v_should := (NEW.visibility = 'client_visible' AND NEW.approval_status = 'pending');
  ELSIF TG_OP = 'UPDATE' THEN
    v_should := (
      NEW.visibility = 'client_visible'
      AND NEW.approval_status = 'pending'
      AND (
        OLD.visibility IS DISTINCT FROM NEW.visibility
        OR OLD.approval_status IS DISTINCT FROM NEW.approval_status
      )
    );
  END IF;
  IF NOT v_should THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_rule FROM public.automation_rules WHERE code = 'document_shared_event' AND enabled;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  FOR rid IN SELECT profile_id FROM private.client_member_ids(NEW.client_id)
  LOOP
    PERFORM public.emit_notification(
      rid, 'document_shared',
      'Document shared for your review',
      left(COALESCE(NEW.title, 'Shared document'), 200),
      'doc_shared:' || NEW.id::text || ':' || rid::text,
      'info', 'document_shared_event', NEW.client_id, NEW.project_id, NULL, NULL,
      'project_document', NEW.id, '/portal/documents', COALESCE(v_rule.channels_json, '["in_app"]'::jsonb), NEW.uploaded_by
    );
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_project_documents_notify_shared ON public.project_documents;
CREATE TRIGGER trg_project_documents_notify_shared
  AFTER INSERT OR UPDATE OF visibility, approval_status, deleted_at ON public.project_documents
  FOR EACH ROW EXECUTE FUNCTION private.notify_document_shared();

-- Staff helper RPCs for private notes (admin UI)
CREATE OR REPLACE FUNCTION public.get_client_private_notes(p_client_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public, pg_temp
AS $$
BEGIN
  IF NOT (
    private.has_permission_on_client('clients.read', p_client_id)
    OR private.has_permission('clients.manage')
  ) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;
  RETURN (SELECT notes_internal FROM public.client_private_notes WHERE client_id = p_client_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.set_client_private_notes(p_client_id uuid, p_notes text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public, pg_temp
AS $$
BEGIN
  IF NOT (
    private.has_permission_on_client('clients.manage', p_client_id)
    OR private.has_permission('clients.manage')
  ) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;
  INSERT INTO public.client_private_notes (client_id, notes_internal, updated_by, updated_at)
  VALUES (p_client_id, NULLIF(trim(COALESCE(p_notes, '')), ''), auth.uid(), now())
  ON CONFLICT (client_id) DO UPDATE
    SET notes_internal = EXCLUDED.notes_internal,
        updated_by = auth.uid(),
        updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.get_client_private_notes(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_client_private_notes(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_client_private_notes(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_client_private_notes(uuid, text) TO authenticated;
