-- M8: Company CMS (OkangGroup website content) + RLS

CREATE TABLE public.cms_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  page_type text NOT NULL DEFAULT 'custom',
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'in_review', 'scheduled', 'published', 'archived')),
  published_at timestamptz,
  published_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL
);

CREATE TABLE public.cms_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id uuid NOT NULL REFERENCES public.cms_pages (id) ON DELETE CASCADE,
  section_key text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  content_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (page_id, section_key)
);

CREATE TABLE public.cms_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  snapshot_json jsonb NOT NULL,
  revision_no int NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  UNIQUE (entity_type, entity_id, revision_no)
);

CREATE TABLE public.cms_navigation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id uuid REFERENCES public.cms_navigation (id) ON DELETE SET NULL,
  label text NOT NULL,
  href text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.cms_seo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id uuid NOT NULL UNIQUE REFERENCES public.cms_pages (id) ON DELETE CASCADE,
  title text,
  description text,
  og_image_path text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.cms_media_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  storage_path text NOT NULL,
  file_name text NOT NULL,
  mime_type text,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL
);

CREATE TABLE public.contact_enquiries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email extensions.citext NOT NULL,
  message text NOT NULL,
  status text NOT NULL DEFAULT 'new',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.cms_publish_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id uuid REFERENCES public.cms_pages (id) ON DELETE SET NULL,
  publish_kind text NOT NULL DEFAULT 'site_bundle',
  artefact_path text,
  previous_artefact_path text,
  status text NOT NULL CHECK (status IN ('pending', 'succeeded', 'failed', 'rolled_back')),
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL
);

CREATE TRIGGER cms_pages_set_updated_at BEFORE UPDATE ON public.cms_pages
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.cms_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cms_pages FORCE ROW LEVEL SECURITY;
ALTER TABLE public.cms_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cms_sections FORCE ROW LEVEL SECURITY;
ALTER TABLE public.cms_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cms_revisions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.cms_navigation ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cms_navigation FORCE ROW LEVEL SECURITY;
ALTER TABLE public.cms_seo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cms_seo FORCE ROW LEVEL SECURITY;
ALTER TABLE public.cms_media_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cms_media_assets FORCE ROW LEVEL SECURITY;
ALTER TABLE public.contact_enquiries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_enquiries FORCE ROW LEVEL SECURITY;
ALTER TABLE public.cms_publish_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cms_publish_events FORCE ROW LEVEL SECURITY;

CREATE POLICY cms_pages_select ON public.cms_pages FOR SELECT TO authenticated
  USING (private.has_permission('company_cms.read') OR private.has_permission('company_cms.edit'));
CREATE POLICY cms_pages_edit ON public.cms_pages FOR ALL TO authenticated
  USING (private.has_permission('company_cms.edit') OR private.has_permission('company_cms.publish'))
  WITH CHECK (private.has_permission('company_cms.edit') OR private.has_permission('company_cms.publish'));

CREATE POLICY cms_sections_all ON public.cms_sections FOR ALL TO authenticated
  USING (private.has_permission('company_cms.read'))
  WITH CHECK (private.has_permission('company_cms.edit'));

CREATE POLICY cms_revisions_all ON public.cms_revisions FOR ALL TO authenticated
  USING (private.has_permission('company_cms.read'))
  WITH CHECK (private.has_permission('company_cms.edit') OR private.has_permission('company_cms.publish'));

CREATE POLICY cms_navigation_all ON public.cms_navigation FOR ALL TO authenticated
  USING (private.has_permission('company_cms.read'))
  WITH CHECK (private.has_permission('company_cms.edit'));

CREATE POLICY cms_seo_all ON public.cms_seo FOR ALL TO authenticated
  USING (private.has_permission('company_cms.read'))
  WITH CHECK (private.has_permission('company_cms.edit'));

CREATE POLICY cms_media_all ON public.cms_media_assets FOR ALL TO authenticated
  USING (private.has_permission('company_cms.read'))
  WITH CHECK (private.has_permission('company_cms.edit'));

CREATE POLICY contact_enquiries_staff ON public.contact_enquiries FOR SELECT TO authenticated
  USING (private.has_permission('company_cms.read'));
CREATE POLICY contact_enquiries_anon_insert ON public.contact_enquiries FOR INSERT TO anon
  WITH CHECK (true);

CREATE POLICY cms_publish_events_all ON public.cms_publish_events FOR ALL TO authenticated
  USING (private.has_permission('company_cms.publish') OR private.has_permission('company_cms.read'))
  WITH CHECK (private.has_permission('company_cms.publish'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cms_pages, public.cms_sections, public.cms_revisions,
  public.cms_navigation, public.cms_seo, public.cms_media_assets, public.cms_publish_events TO authenticated;
GRANT SELECT ON public.contact_enquiries TO authenticated;
GRANT INSERT ON public.contact_enquiries TO anon, authenticated;
