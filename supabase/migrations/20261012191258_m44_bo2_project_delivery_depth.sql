-- M44 BO-2: Project deliverables, change requests, handover checklist

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS handover_checklist_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS closed_at timestamptz,
  ADD COLUMN IF NOT EXISTS closure_notes text;

CREATE TABLE IF NOT EXISTS public.project_deliverables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  client_id uuid NOT NULL,
  name text NOT NULL,
  deliverable_type text NOT NULL DEFAULT 'general',
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'in_progress', 'ready_for_review', 'client_approved', 'delivered', 'cancelled')),
  due_on date,
  accepted_at timestamptz,
  notes text,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  UNIQUE (client_id, id),
  FOREIGN KEY (client_id, project_id) REFERENCES public.projects (client_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS project_deliverables_project_idx
  ON public.project_deliverables (project_id, sort_order);

CREATE TABLE IF NOT EXISTS public.change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  client_id uuid NOT NULL,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'submitted', 'approved', 'rejected', 'implemented', 'cancelled')),
  impact_summary text,
  requested_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  decided_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, id),
  FOREIGN KEY (client_id, project_id) REFERENCES public.projects (client_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS change_requests_project_idx
  ON public.change_requests (project_id, created_at DESC);

DROP TRIGGER IF EXISTS project_deliverables_set_updated_at ON public.project_deliverables;
CREATE TRIGGER project_deliverables_set_updated_at
  BEFORE UPDATE ON public.project_deliverables
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS change_requests_set_updated_at ON public.change_requests;
CREATE TRIGGER change_requests_set_updated_at
  BEFORE UPDATE ON public.change_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.project_deliverables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_deliverables FORCE ROW LEVEL SECURITY;
ALTER TABLE public.change_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.change_requests FORCE ROW LEVEL SECURITY;

CREATE POLICY project_deliverables_select ON public.project_deliverables
  FOR SELECT TO authenticated
  USING (private.has_permission_on_client('projects.read', client_id));

CREATE POLICY project_deliverables_write ON public.project_deliverables
  FOR ALL TO authenticated
  USING (private.has_permission_on_client('projects.manage', client_id))
  WITH CHECK (private.has_permission_on_client('projects.manage', client_id));

CREATE POLICY change_requests_select ON public.change_requests
  FOR SELECT TO authenticated
  USING (private.has_permission_on_client('projects.read', client_id));

CREATE POLICY change_requests_write ON public.change_requests
  FOR ALL TO authenticated
  USING (private.has_permission_on_client('projects.manage', client_id))
  WITH CHECK (private.has_permission_on_client('projects.manage', client_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_deliverables, public.change_requests TO authenticated;

INSERT INTO public.lookup_values (lookup_type, code, label, sort_order) VALUES
  ('deliverable_type', 'general', 'General', 10),
  ('deliverable_type', 'design', 'Design', 20),
  ('deliverable_type', 'content', 'Content', 30),
  ('deliverable_type', 'software', 'Software', 40),
  ('deliverable_type', 'handover', 'Handover pack', 50),
  ('project_category', 'general', 'General', 10),
  ('project_category', 'website', 'Website', 20),
  ('project_category', 'cms', 'CMS', 30),
  ('project_category', 'support', 'Support retainer', 40),
  ('handover_item', 'credentials', 'Credentials transferred', 10),
  ('handover_item', 'documentation', 'Documentation delivered', 20),
  ('handover_item', 'training', 'Client training complete', 30),
  ('handover_item', 'signoff', 'Client sign-off received', 40)
ON CONFLICT (lookup_type, code) DO NOTHING;

INSERT INTO public.settings (key, value_json) VALUES
  ('default_currency', '"GBP"'::jsonb),
  ('handover_checklist_defaults', '["credentials","documentation","training","signoff"]'::jsonb)
ON CONFLICT (key) DO NOTHING;
