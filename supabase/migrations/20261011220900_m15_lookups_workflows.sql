-- M15 minimal: lookups + workflow_definitions seeds

CREATE TABLE public.lookup_values (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lookup_type text NOT NULL,
  code text NOT NULL,
  label text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (lookup_type, code)
);

CREATE TABLE public.workflow_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  entity_type text NOT NULL,
  stages_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  value_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.lookup_values ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lookup_values FORCE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_definitions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings FORCE ROW LEVEL SECURITY;

CREATE POLICY lookup_values_read ON public.lookup_values FOR SELECT TO authenticated USING (true);
CREATE POLICY workflow_definitions_read ON public.workflow_definitions FOR SELECT TO authenticated USING (true);
CREATE POLICY settings_read ON public.settings FOR SELECT TO authenticated
  USING (private.has_permission('platform.settings.manage') OR private.has_platform_role('owner'));
CREATE POLICY settings_manage ON public.settings FOR ALL TO authenticated
  USING (private.has_permission('platform.settings.manage') OR private.has_platform_role('owner'))
  WITH CHECK (private.has_permission('platform.settings.manage') OR private.has_platform_role('owner'));

INSERT INTO public.lookup_values (lookup_type, code, label, sort_order) VALUES
  ('task_priority', 'low', 'Low', 10),
  ('task_priority', 'normal', 'Normal', 20),
  ('task_priority', 'high', 'High', 30),
  ('task_priority', 'urgent', 'Urgent', 40),
  ('task_status', 'backlog', 'Backlog', 10),
  ('task_status', 'assigned', 'Assigned', 20),
  ('task_status', 'in_progress', 'In progress', 30),
  ('task_status', 'blocked', 'Blocked', 40),
  ('task_status', 'in_review', 'In review', 50),
  ('task_status', 'done', 'Done', 60),
  ('task_status', 'cancelled', 'Cancelled', 70);

INSERT INTO public.workflow_definitions (code, name, entity_type, stages_json) VALUES
  ('project_stages', 'Project stages', 'project',
   '["enquiry","proposal","approved","planning","development","testing","client_review","delivered","maintenance","cancelled"]'::jsonb),
  ('company_cms_publish', 'Company CMS publish', 'cms_page',
   '["draft","in_review","scheduled","published","archived"]'::jsonb);

GRANT SELECT ON public.lookup_values, public.workflow_definitions TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.settings TO authenticated;
