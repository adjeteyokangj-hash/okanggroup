import { useAuth } from '../lib/auth';

export function RequirePermission({
  code,
  children,
  fallback = <div className="center">You do not have permission for this area.</div>,
}: {
  code: string | string[];
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  const { can, loading } = useAuth();
  if (loading) return <div className="center">Loading…</div>;
  const codes = Array.isArray(code) ? code : [code];
  if (!codes.some((c) => can(c))) return <>{fallback}</>;
  return <>{children}</>;
}
