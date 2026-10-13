-- M52 BA-1: Business Automation schema — rules, outbox, recurring billing, notification extensions
-- Preserves BO-1..BO-7 and existing task/CMS notification kinds.

INSERT INTO public.permissions (code, description, category, is_sensitive) VALUES
  ('automation.read', 'View automation rules, runs and delivery history', 'automation', false),
  ('automation.manage', 'Configure automation rules, schedules and channels', 'automation', true),
  ('automation.run', 'Manually trigger automation sweeps', 'automation', true)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.code = 'owner'
  AND p.code IN ('automation.read', 'automation.manage', 'automation.run')
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
JOIN public.permissions p ON p.code IN ('automation.read', 'automation.run')
WHERE r.code IN ('platform_admin', 'operations_manager')
ON CONFLICT DO NOTHING;

INSERT INTO public.settings (key, value_json) VALUES
  ('email_delivery_enabled', 'false'::jsonb),
  ('automation_enabled', 'true'::jsonb),
  ('budget_warning_pct', '80'::jsonb),
  ('task_due_soon_days', '3'::jsonb),
  ('invoice_due_soon_days', '7'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Extend notifications for BO automation entity links + dedupe
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES public.clients (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS invoice_id uuid REFERENCES public.invoices (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS entity_type text,
  ADD COLUMN IF NOT EXISTS entity_id uuid,
  ADD COLUMN IF NOT EXISTS dedupe_key text,
  ADD COLUMN IF NOT EXISTS severity text NOT NULL DEFAULT 'info'
    CHECK (severity IN ('info', 'warning', 'critical')),
  ADD COLUMN IF NOT EXISTS link_path text,
  ADD COLUMN IF NOT EXISTS rule_code text;

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_kind_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_kind_check CHECK (kind IN (
  'task_message','task_files','task_assigned','task_decision','task_submitted',
  'cms_submitted','cms_decision','cms_published','cms_rejected','cms_client_approval',
  'cms_publish_failed','cms_access_changed','cms_assigned',
  'task_due_soon','task_overdue',
  'invoice_issued','invoice_due_soon','invoice_overdue','invoice_paid','recurring_invoice_created',
  'budget_warning','budget_exceeded',
  'milestone_overdue','change_request_pending','handover_incomplete',
  'document_approval_pending','document_approved','document_rejected','document_shared',
  'owner_alert','owner_summary','client_update'
));

CREATE UNIQUE INDEX IF NOT EXISTS notifications_recipient_dedupe_uidx
  ON public.notifications (recipient_id, dedupe_key)
  WHERE dedupe_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS notifications_client_id_idx ON public.notifications (client_id);
CREATE INDEX IF NOT EXISTS notifications_kind_created_idx ON public.notifications (kind, created_at DESC);

CREATE TABLE IF NOT EXISTS public.automation_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  category text NOT NULL CHECK (category IN (
    'task', 'finance', 'project', 'document', 'client', 'owner', 'reporting'
  )),
  description text,
  enabled boolean NOT NULL DEFAULT true,
  trigger_kind text NOT NULL CHECK (trigger_kind IN ('event', 'schedule')),
  schedule_every_hours int CHECK (schedule_every_hours IS NULL OR schedule_every_hours > 0),
  config_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  channels_json jsonb NOT NULL DEFAULT '["in_app"]'::jsonb,
  recipient_mode text NOT NULL CHECK (recipient_mode IN (
    'assignees', 'client_members', 'owners', 'permission_holders', 'explicit', 'account_managers'
  )),
  recipient_permission text,
  recipient_profile_ids uuid[] NOT NULL DEFAULT '{}',
  escalation_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_run_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.automation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_code text REFERENCES public.automation_rules (code) ON DELETE SET NULL,
  run_kind text NOT NULL DEFAULT 'sweep',
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'succeeded', 'failed', 'partial')),
  stats_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_text text,
  triggered_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS automation_runs_started_idx
  ON public.automation_runs (started_at DESC);

CREATE TABLE IF NOT EXISTS public.notification_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid REFERENCES public.notifications (id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('email')),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'sent', 'failed', 'skipped')),
  attempts int NOT NULL DEFAULT 0,
  max_attempts int NOT NULL DEFAULT 5,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error text,
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  dedupe_key text
);

CREATE UNIQUE INDEX IF NOT EXISTS notification_outbox_dedupe_uidx
  ON public.notification_outbox (channel, dedupe_key)
  WHERE dedupe_key IS NOT NULL AND status IN ('pending', 'processing', 'sent');

CREATE INDEX IF NOT EXISTS notification_outbox_poll_idx
  ON public.notification_outbox (status, next_attempt_at)
  WHERE status IN ('pending', 'failed');

CREATE TABLE IF NOT EXISTS public.recurring_billing_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients (id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  currency_code text NOT NULL DEFAULT 'GBP',
  subtotal numeric(18, 2) NOT NULL CHECK (subtotal >= 0),
  tax_total numeric(18, 2) NOT NULL DEFAULT 0 CHECK (tax_total >= 0),
  cadence text NOT NULL CHECK (cadence IN ('monthly', 'quarterly', 'yearly')),
  next_run_on date NOT NULL,
  active boolean NOT NULL DEFAULT true,
  last_invoice_id uuid REFERENCES public.invoices (id) ON DELETE SET NULL,
  created_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.recurring_billing_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id uuid NOT NULL REFERENCES public.recurring_billing_schedules (id) ON DELETE CASCADE,
  period_key text NOT NULL,
  invoice_id uuid REFERENCES public.invoices (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (schedule_id, period_key)
);

ALTER TABLE public.automation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_rules FORCE ROW LEVEL SECURITY;
ALTER TABLE public.automation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_runs FORCE ROW LEVEL SECURITY;
ALTER TABLE public.notification_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_outbox FORCE ROW LEVEL SECURITY;
ALTER TABLE public.recurring_billing_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recurring_billing_schedules FORCE ROW LEVEL SECURITY;
ALTER TABLE public.recurring_billing_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recurring_billing_runs FORCE ROW LEVEL SECURITY;

CREATE POLICY automation_rules_select ON public.automation_rules
  FOR SELECT TO authenticated
  USING (private.has_permission('automation.read') OR private.has_permission('automation.manage'));

CREATE POLICY automation_rules_write ON public.automation_rules
  FOR ALL TO authenticated
  USING (private.has_permission('automation.manage'))
  WITH CHECK (private.has_permission('automation.manage'));

CREATE POLICY automation_runs_select ON public.automation_runs
  FOR SELECT TO authenticated
  USING (private.has_permission('automation.read') OR private.has_permission('automation.manage'));

CREATE POLICY notification_outbox_select ON public.notification_outbox
  FOR SELECT TO authenticated
  USING (private.has_permission('automation.read') OR private.has_permission('automation.manage'));

CREATE POLICY recurring_billing_select ON public.recurring_billing_schedules
  FOR SELECT TO authenticated
  USING (
    private.has_permission_on_client('finance.invoices.read', client_id)
    OR private.has_permission('finance.invoices.manage')
    OR private.has_permission('automation.read')
  );

CREATE POLICY recurring_billing_write ON public.recurring_billing_schedules
  FOR ALL TO authenticated
  USING (
    private.has_permission_on_client('finance.invoices.manage', client_id)
    OR private.has_permission('automation.manage')
  )
  WITH CHECK (
    private.has_permission_on_client('finance.invoices.manage', client_id)
    OR private.has_permission('automation.manage')
  );

CREATE POLICY recurring_billing_runs_select ON public.recurring_billing_runs
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.recurring_billing_schedules s
      WHERE s.id = schedule_id
        AND (
          private.has_permission_on_client('finance.invoices.read', s.client_id)
          OR private.has_permission('finance.invoices.manage')
          OR private.has_permission('automation.read')
        )
    )
  );

GRANT SELECT, UPDATE ON public.automation_rules TO authenticated;
GRANT SELECT ON public.automation_runs TO authenticated;
GRANT SELECT ON public.notification_outbox TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.recurring_billing_schedules TO authenticated;
GRANT SELECT ON public.recurring_billing_runs TO authenticated;

-- Seed default rules (idempotent)
INSERT INTO public.automation_rules (
  code, name, category, description, enabled, trigger_kind, schedule_every_hours,
  config_json, channels_json, recipient_mode, recipient_permission, escalation_json
) VALUES
  ('task_due_soon', 'Task due soon', 'task', 'Notify assignees when a task is due within N days',
    true, 'schedule', 6, '{"days":3}'::jsonb, '["in_app"]'::jsonb, 'assignees', NULL,
    '{"escalate_after_hours":48,"escalate_to":"owners"}'::jsonb),
  ('task_overdue', 'Task overdue', 'task', 'Notify assignees and owners of overdue tasks',
    true, 'schedule', 6, '{}'::jsonb, '["in_app"]'::jsonb, 'assignees', NULL,
    '{"escalate_after_hours":24,"escalate_to":"owners"}'::jsonb),
  ('invoice_due_soon', 'Invoice due soon', 'finance', 'Remind finance holders and client of upcoming due dates',
    true, 'schedule', 12, '{"days":7}'::jsonb, '["in_app"]'::jsonb, 'permission_holders', 'finance.invoices.read',
    '{}'::jsonb),
  ('invoice_overdue', 'Invoice overdue', 'finance', 'Alert on overdue outstanding invoices',
    true, 'schedule', 12, '{}'::jsonb, '["in_app"]'::jsonb, 'permission_holders', 'finance.invoices.read',
    '{"escalate_after_hours":72,"escalate_to":"owners"}'::jsonb),
  ('budget_warning', 'Project budget warning', 'project', 'Warn when recorded expenses exceed threshold of budget',
    true, 'schedule', 24, '{"pct":80}'::jsonb, '["in_app"]'::jsonb, 'permission_holders', 'projects.manage',
    '{}'::jsonb),
  ('milestone_overdue', 'Milestone overdue', 'project', 'Alert when project milestones pass due date',
    true, 'schedule', 12, '{}'::jsonb, '["in_app"]'::jsonb, 'permission_holders', 'projects.manage',
    '{}'::jsonb),
  ('change_request_pending', 'Pending change requests', 'project', 'Alert managers of open change requests',
    true, 'schedule', 12, '{}'::jsonb, '["in_app"]'::jsonb, 'permission_holders', 'projects.manage',
    '{}'::jsonb),
  ('handover_incomplete', 'Handover incomplete', 'project', 'Remind when project nears target end with incomplete handover',
    true, 'schedule', 24, '{"days":7}'::jsonb, '["in_app"]'::jsonb, 'permission_holders', 'projects.manage',
    '{}'::jsonb),
  ('document_approval_pending', 'Document awaiting approval', 'document', 'Remind client members of pending approvals',
    true, 'schedule', 12, '{}'::jsonb, '["in_app"]'::jsonb, 'client_members', NULL,
    '{}'::jsonb),
  ('owner_daily_summary', 'Owner daily summary', 'reporting', 'Daily operational summary for Owner',
    true, 'schedule', 24, '{}'::jsonb, '["in_app"]'::jsonb, 'owners', NULL,
    '{}'::jsonb),
  ('invoice_issued_event', 'Invoice issued (event)', 'finance', 'Notify client when an invoice is issued',
    true, 'event', NULL, '{}'::jsonb, '["in_app"]'::jsonb, 'client_members', NULL,
    '{}'::jsonb),
  ('document_shared_event', 'Document shared (event)', 'document', 'Notify client when a document is shared for approval',
    true, 'event', NULL, '{}'::jsonb, '["in_app"]'::jsonb, 'client_members', NULL,
    '{}'::jsonb),
  ('recurring_billing', 'Recurring billing generation', 'finance', 'Generate draft invoices from active schedules',
    true, 'schedule', 24, '{}'::jsonb, '["in_app"]'::jsonb, 'permission_holders', 'finance.invoices.manage',
    '{}'::jsonb)
ON CONFLICT (code) DO NOTHING;
