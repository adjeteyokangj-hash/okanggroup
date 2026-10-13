import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

/**
 * Callback target for Supabase password recovery.
 * Must match Auth → URL Configuration redirect allow-list:
 *   http://localhost:5174/admin/reset-password
 */
export function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const hash = window.location.hash.toLowerCase();
    if (hash.includes('error=')) {
      const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
      setError(params.get('error_description') ?? params.get('error_code') ?? 'Recovery link invalid.');
      return;
    }

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setReady(true);
        setError(null);
      }
    });

    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });

    return () => {
      sub.subscription.unsubscribe();
    };
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (password.length < 10) {
      setError('Use a password of at least 10 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.updateUser({ password });
    if (err) {
      setBusy(false);
      setError(err.message);
      return;
    }

    // Staff invite path: apply intended grants only after password is set.
    const { error: acceptErr } = await supabase.rpc('accept_staff_invitation');
    setBusy(false);
    if (acceptErr && !/No pending staff invitation/i.test(acceptErr.message)) {
      setError(
        `Password saved, but activation failed: ${acceptErr.message}. Sign in and open Activate, or contact an admin.`,
      );
      return;
    }

    setMessage(
      acceptErr
        ? 'Password updated. Redirecting to sign in…'
        : 'Password set and staff access activated. Redirecting…',
    );
    await supabase.auth.signOut();
    setTimeout(() => navigate('/login', { replace: true }), 800);
  }

  return (
    <div className="auth-layout">
      <form className="auth-card" onSubmit={onSubmit}>
        <h1>Set new password</h1>
        <p>OkangGroup admin recovery. This page is not the public website.</p>
        {!ready && !error ? <p>Waiting for a valid recovery session…</p> : null}
        {ready ? (
          <>
            <label>
              New password
              <input
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={10}
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
                minLength={10}
              />
            </label>
            <button type="submit" disabled={busy}>
              {busy ? 'Saving…' : 'Update password'}
            </button>
          </>
        ) : null}
        {error ? <div className="error">{error}</div> : null}
        {message ? <div className="ok">{message}</div> : null}
        <p>
          <Link to="/login">Back to sign in</Link>
        </p>
      </form>
    </div>
  );
}
