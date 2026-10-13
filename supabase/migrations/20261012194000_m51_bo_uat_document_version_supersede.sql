-- M51: When a newer document version is uploaded, supersede prior pending approvals so dashboards stay accurate.

ALTER TABLE public.project_documents
  DROP CONSTRAINT IF EXISTS project_documents_approval_status_check;
ALTER TABLE public.project_documents
  DROP CONSTRAINT IF EXISTS project_documents_approval_status_chk;

ALTER TABLE public.project_documents
  ADD CONSTRAINT project_documents_approval_status_chk
  CHECK (approval_status IN ('none', 'pending', 'approved', 'rejected', 'superseded'));

CREATE OR REPLACE FUNCTION private.supersede_prior_document_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public, pg_temp
AS $$
BEGIN
  IF NEW.version_of IS NOT NULL AND NEW.deleted_at IS NULL THEN
    UPDATE public.project_documents
    SET approval_status = 'superseded'
    WHERE id = NEW.version_of
      AND deleted_at IS NULL
      AND approval_status = 'pending';

    -- Also supersede sibling pending docs older in the same version chain
    UPDATE public.project_documents d
    SET approval_status = 'superseded'
    WHERE d.deleted_at IS NULL
      AND d.approval_status = 'pending'
      AND d.id <> NEW.id
      AND (
        d.id = NEW.version_of
        OR d.version_of = NEW.version_of
        OR (
          NEW.version_of IS NOT NULL
          AND d.version_of = (
            SELECT p.version_of FROM public.project_documents p WHERE p.id = NEW.version_of
          )
          AND d.version_no < NEW.version_no
        )
      );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_project_documents_supersede_prior ON public.project_documents;
CREATE TRIGGER trg_project_documents_supersede_prior
  AFTER INSERT ON public.project_documents
  FOR EACH ROW
  EXECUTE FUNCTION private.supersede_prior_document_version();

-- Backfill: any pending doc that already has a newer non-deleted version
UPDATE public.project_documents older
SET approval_status = 'superseded'
FROM public.project_documents newer
WHERE newer.version_of = older.id
  AND newer.deleted_at IS NULL
  AND older.deleted_at IS NULL
  AND older.approval_status = 'pending';
