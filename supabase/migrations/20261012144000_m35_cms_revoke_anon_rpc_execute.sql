-- M35: CMS RPCs must not be executable by anon/PUBLIC.
REVOKE ALL ON FUNCTION public.test_cms_connection(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cms_management_summary() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.restore_client_cms_document(uuid, int) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.duplicate_client_cms_document(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.archive_client_cms_document(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.save_client_cms_document(uuid, uuid, text, text, jsonb, uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.submit_client_cms_document(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.decide_client_cms_document(uuid, boolean, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.test_cms_connection(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cms_management_summary() TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_client_cms_document(uuid, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.duplicate_client_cms_document(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.archive_client_cms_document(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_client_cms_document(uuid, uuid, text, text, jsonb, uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_client_cms_document(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decide_client_cms_document(uuid, boolean, text) TO authenticated;
