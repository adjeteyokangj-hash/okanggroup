import { FormEvent, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';

async function completeForcedChange(newPassword: string) {
  const { data, error } = await supabase.functions.invoke('invite-staff', {
    body: { action: 'complete_forced_password_change', new_password: newPassword },
  });
  if (error) {
    const ctx = (error as { context?: Response }).context;
    let detail = error.message;
    if (ctx) {
      try {
        const j = await ctx.json();
        detail = j.error ?? detail;
      } catch {
        /* keep */
      }
    }
    throw new Error(detail);
  }
  if (data?.error) throw new Error(data.error as string);
  return data;
}

export function ForceChangePasswordPage() {
  const { session, loading, profile, mustChangePassword, refreshProfile, mfaRequired } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (loading) return <div className="center">Loading…</div>;
  if (!session) return <Navigate to="/login" replace />;
  if (profile && !mustChangePassword) {
    if (mfaRequired) return <Navigate to="/mfa" replace />;
    return <Navigate to="/" replace />;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (password.length < 12) {
      setError('Use at least 12 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await completeForcedChange(password);
      await refreshProfile();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-layout">
      <form className="auth-card" onSubmit={(e) => void onSubmit(e)}>
        <h1>Change temporary password</h1>
        <p>
          Your Owner issued a temporary password. Choose a new password before using OkangGroup.
          This step is required by the server, not only this screen.
        </p>
        <label>
          New password
          <input
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={12}
          />
        </label>
        <label>
          Confirm password
          <input
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            minLength={12}
          />
        </label>
        {error ? <div className="error">{error}</div> : null}
        <button type="submit" disabled={busy}>
          {busy ? 'Saving…' : 'Save new password'}
        </button>
      </form>
    </div>
  );
}
