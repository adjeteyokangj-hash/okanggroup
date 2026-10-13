import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';

/**
 * Completes staff onboarding after invite password setup.
 * Applies invitation grants only via accept_staff_invitation (not user_metadata).
 */
export function ActivatePage() {
  const { session, profile, loading, refreshProfile, mfaRequired, signOut } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (
      !session ||
      !profile ||
      (profile.account_status !== 'invited' && profile.account_status !== 'pending_setup') ||
      busy ||
      done
    ) {
      return;
    }
    setBusy(true);
    void (async () => {
      const { data, error: err } = await supabase.rpc('accept_staff_invitation');
      if (err) {
        setError(err.message);
        setBusy(false);
        return;
      }
      if (data && (data as { ok?: boolean }).ok === false) {
        setError('Activation failed.');
        setBusy(false);
        return;
      }
      setDone(true);
      await refreshProfile();
      setBusy(false);
    })();
  }, [session?.user?.id, profile?.account_status]);

  if (loading) return <div className="center">Loading…</div>;
  if (!session) return <Navigate to="/login" replace />;
  if (profile?.account_status === 'active') {
    if (mfaRequired) return <Navigate to="/mfa" replace />;
    return <Navigate to="/" replace />;
  }

  return (
    <div className="auth-layout">
      <div className="auth-card">
        <h1>Activate account</h1>
        <p>Applying your OkangGroup staff invitation…</p>
        {busy ? <p>Activating…</p> : null}
        {error ? (
          <>
            <div className="error">{error}</div>
            <p className="muted-sm">
              If this invitation failed or was revoked, no access was granted. Contact an
              administrator.
            </p>
            <button type="button" className="secondary" onClick={() => void signOut()}>
              Sign out
            </button>
          </>
        ) : null}
        <p>
          <Link to="/login">Back to sign in</Link>
        </p>
      </div>
    </div>
  );
}
