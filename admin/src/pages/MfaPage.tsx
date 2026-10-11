import { FormEvent, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';

export function MfaPage() {
  const { session, mfaRequired, refreshProfile, loading } = useAuth();
  const [factorId, setFactorId] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [qr, setQr] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [enrolling, setEnrolling] = useState(false);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.auth.mfa.listFactors();
      const totp = data?.totp?.[0];
      if (totp) {
        setFactorId(totp.id);
        return;
      }
      setEnrolling(true);
      const { data: enrolled, error: enrollErr } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: 'OkangGroup Admin',
      });
      if (enrollErr) {
        setError(enrollErr.message);
        return;
      }
      setFactorId(enrolled.id);
      setQr(enrolled.totp.qr_code);
    })();
  }, []);

  if (loading) return <div className="center">Loading…</div>;
  if (!session) return <Navigate to="/login" replace />;
  if (!mfaRequired) return <Navigate to="/" replace />;

  async function onVerify(e: FormEvent) {
    e.preventDefault();
    if (!factorId) return;
    setError(null);
    const { data: challenge, error: challengeErr } = await supabase.auth.mfa.challenge({
      factorId,
    });
    if (challengeErr) {
      setError(challengeErr.message);
      return;
    }
    const { error: verifyErr } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challenge.id,
      code,
    });
    if (verifyErr) {
      setError(verifyErr.message);
      return;
    }
    await refreshProfile();
  }

  return (
    <div className="auth-layout">
      <form className="auth-card" onSubmit={onVerify}>
        <h1>Multi-factor authentication</h1>
        <p>
          Privileged accounts must complete MFA before using protected functions.
          {enrolling ? ' Scan the QR code with your authenticator app, then enter a code.' : ' Enter a code from your authenticator app.'}
        </p>
        {qr ? <img className="qr" src={qr} alt="TOTP QR code" /> : null}
        <label>
          Authentication code
          <input
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            required
          />
        </label>
        {error ? <div className="error">{error}</div> : null}
        <button type="submit">Verify and continue</button>
      </form>
    </div>
  );
}
