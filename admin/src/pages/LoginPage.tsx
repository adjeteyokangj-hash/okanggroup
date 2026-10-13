import { FormEvent, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';

const RECOVERY_REDIRECT = `${window.location.origin}/admin/reset-password`;

export function LoginPage() {
  const { session, loading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!loading && session) return <Navigate to="/" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    if (err) setError(err.message);
    setBusy(false);
  }

  async function onForgotPassword() {
    if (!email.trim()) {
      setError('Enter your email first, then choose Forgot password.');
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: RECOVERY_REDIRECT,
    });
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    setMessage(
      `If an account exists, a reset email was sent. Open the link only when admin is running at ${RECOVERY_REDIRECT}.`,
    );
  }

  return (
    <div className="auth-layout">
      <form className="auth-card" onSubmit={onSubmit}>
        <h1>OkangGroup</h1>
        <p>Sign in to the operations platform</p>
        <label>
          Email
          <input
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        <label>
          Password
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        {error ? <div className="error">{error}</div> : null}
        {message ? <div className="ok">{message}</div> : null}
        <button type="submit" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
        <button type="button" className="linkish" disabled={busy} onClick={() => void onForgotPassword()}>
          Forgot password
        </button>
      </form>
    </div>
  );
}
