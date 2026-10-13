-- Treasure House STAGING — isolated storage bucket
-- Apply ONLY on the separate staging Supabase project.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'website-media-staging',
  'website-media-staging',
  true,
  8388608,
  ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Note: RLS policies for storage should be tightened by the Owner/operator
-- for the staging project. Do not reuse production bucket policies blindly.
