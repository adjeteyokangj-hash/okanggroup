import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import {
  assertNeverRemovesVerified,
  clearEnrollmentMemory,
  factorStillPresent,
  getEnrollInFlight,
  helpfulMfaError,
  mfaFriendlyName,
  planExplicitRestart,
  planMfaEnrollment,
  recallEnrollment,
  rememberEnrollment,
  setEnrollInFlight,
  type EnrollmentSecrets,
  type FactorLike,
} from '../lib/mfaEnrollment';

type NameCtx = {
  isOwner: boolean;
  isPlatformAdmin: boolean;
  employmentType: string | null;
};

async function loadNameContext(userId: string): Promise<NameCtx> {
  const [{ data: profile }, { data: grantRows }] = await Promise.all([
    supabase
      .from('profiles')
      .select('employment_type')
      .eq('id', userId)
      .maybeSingle(),
    supabase
      .from('role_grants')
      .select('status, roles!inner(code), access_scopes!inner(scope_type)')
      .eq('profile_id', userId)
      .eq('status', 'active'),
  ]);

  let isOwner = false;
  let isPlatformAdmin = false;
  for (const g of grantRows ?? []) {
    const role = Array.isArray(g.roles) ? g.roles[0] : g.roles;
    const scope = Array.isArray(g.access_scopes) ? g.access_scopes[0] : g.access_scopes;
    if (scope?.scope_type !== 'platform') continue;
    if (role?.code === 'owner') isOwner = true;
    if (role?.code === 'platform_admin') isPlatformAdmin = true;
  }

  return {
    isOwner,
    isPlatformAdmin,
    employmentType: (profile as { employment_type?: string | null } | null)?.employment_type ?? null,
  };
}

async function listAllFactors(): Promise<FactorLike[]> {
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) throw error;
  return (data?.all ?? []) as FactorLike[];
}

async function enrollFresh(userId: string, label: string): Promise<EnrollmentSecrets> {
  const existing = getEnrollInFlight(userId);
  if (existing) return existing;

  const promise = (async () => {
    const { data: enrolled, error: enrollErr } = await supabase.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: label,
    });
    if (enrollErr) throw enrollErr;
    const qr = enrolled?.totp?.qr_code;
    const secret = enrolled?.totp?.secret;
    if (!enrolled?.id || !qr || !secret) {
      throw new Error('Authenticator enrolment did not return a QR code and setup key.');
    }
    const secrets: EnrollmentSecrets = {
      factorId: enrolled.id,
      qr,
      secret,
      friendlyName: label,
    };
    rememberEnrollment(userId, secrets);
    return secrets;
  })();

  setEnrollInFlight(userId, promise);
  return promise;
}

export function MfaPage() {
  const { session, mfaRequired, mfaEnrolled, refreshProfile, loading } = useAuth();
  const [factorId, setFactorId] = useState<string | null>(null);
  const [friendlyLabel, setFriendlyLabel] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [qr, setQr] = useState<string | null>(null);
  const [setupKey, setSetupKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [enrolling, setEnrolling] = useState(false);
  const [busy, setBusy] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);
  const prepareGen = useRef(0);

  const applySecrets = useCallback((secrets: EnrollmentSecrets) => {
    setFactorId(secrets.factorId);
    setQr(secrets.qr);
    setSetupKey(secrets.secret);
    setFriendlyLabel(secrets.friendlyName);
    setEnrolling(true);
  }, []);

  const prepareEnrollment = useCallback(async () => {
    if (!session?.user?.id) return;
    const gen = ++prepareGen.current;
    setBusy(true);
    setError(null);

    try {
      const userId = session.user.id;
      const nameCtx = await loadNameContext(userId);
      const label = mfaFriendlyName(nameCtx);
      if (gen !== prepareGen.current) return;
      setFriendlyLabel(label);

      const all = await listAllFactors();
      if (gen !== prepareGen.current) return;
      const plan = planMfaEnrollment(all);

      if (plan.action === 'challenge') {
        clearEnrollmentMemory(userId);
        setFactorId(plan.factorId);
        setEnrolling(false);
        setQr(null);
        setSetupKey(null);
        setInfo(null);
        return;
      }

      if (plan.action === 'resume') {
        const cached = recallEnrollment(userId, plan.factorId);
        setFactorId(plan.factorId);
        setEnrolling(true);
        if (cached) {
          applySecrets(cached);
          setInfo(null);
        } else {
          // Factor is stable; QR/secret only exist at enroll time. Do not recreate.
          setQr(null);
          setSetupKey(null);
          setInfo(
            'Your authenticator setup is still in progress. If you already added OkangGroup to your app, enter a code below. If you need the QR code or setup key again, use Restart MFA Setup.',
          );
        }
        return;
      }

      // Fresh enroll (no existing factors). Deduped against Strict Mode remounts.
      const secrets = await enrollFresh(userId, label);
      if (gen !== prepareGen.current) return;
      applySecrets(secrets);
      setInfo(null);
    } catch (err) {
      if (gen !== prepareGen.current) return;
      setError(helpfulMfaError(err instanceof Error ? err.message : String(err)));
    } finally {
      if (gen === prepareGen.current) setBusy(false);
    }
  }, [session?.user?.id, applySecrets]);

  useEffect(() => {
    void prepareEnrollment();
  }, [prepareEnrollment]);

  async function restartSetup() {
    if (!session?.user?.id || restarting || verifying) return;
    setRestarting(true);
    setError(null);
    setInfo(null);
    setCode('');
    setCopiedKey(false);
    try {
      const userId = session.user.id;
      const all = await listAllFactors();
      const { removeFactorIds } = planExplicitRestart(all);
      assertNeverRemovesVerified(removeFactorIds, all);
      for (const id of removeFactorIds) {
        const { error: unenrollErr } = await supabase.auth.mfa.unenroll({ factorId: id });
        if (unenrollErr) throw unenrollErr;
      }
      clearEnrollmentMemory(userId);

      const nameCtx = await loadNameContext(userId);
      const label = mfaFriendlyName(nameCtx);
      const secrets = await enrollFresh(userId, label);
      applySecrets(secrets);
      setInfo(
        'Previous incomplete setup was cleared. Scan the new QR code or enter the new setup key, then verify.',
      );
    } catch (err) {
      setError(helpfulMfaError(err instanceof Error ? err.message : String(err)));
    } finally {
      setRestarting(false);
    }
  }

  async function onVerify(e: FormEvent) {
    e.preventDefault();
    if (!factorId || verifying || restarting || busy) return;
    setVerifying(true);
    setError(null);
    try {
      const all = await listAllFactors();
      if (!factorStillPresent(all, factorId)) {
        throw new Error('Factor not found');
      }

      const { data: challenge, error: challengeErr } = await supabase.auth.mfa.challenge({
        factorId,
      });
      if (challengeErr) throw challengeErr;
      const { error: verifyErr } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challenge.id,
        code: code.trim(),
      });
      if (verifyErr) throw verifyErr;

      if (session?.user?.id) {
        clearEnrollmentMemory(session.user.id);
        await supabase
          .from('profiles')
          .update({ mfa_enforced_at: new Date().toISOString() })
          .eq('id', session.user.id);
      }
      await refreshProfile();
    } catch (err) {
      setError(helpfulMfaError(err instanceof Error ? err.message : String(err)));
    } finally {
      setVerifying(false);
    }
  }

  async function copySetupKey() {
    if (!setupKey) return;
    try {
      await navigator.clipboard.writeText(setupKey);
      setCopiedKey(true);
    } catch {
      setError('Could not copy the setup key — select it and copy manually.');
    }
  }

  if (loading || busy) return <div className="center">Loading…</div>;
  if (!session) return <Navigate to="/login" replace />;
  if (!mfaRequired) return <Navigate to="/" replace />;

  const showRestart = enrolling && !mfaEnrolled;

  return (
    <div className="auth-layout">
      <form className="auth-card mfa-card" onSubmit={(e) => void onVerify(e)}>
        <h1>Multi-factor authentication</h1>
        <p>
          {enrolling
            ? 'Register OkangGroup in your authenticator app, then enter a six-digit code to finish.'
            : 'Enter a code from your authenticator app to continue.'}
        </p>
        {friendlyLabel ? (
          <p className="muted-sm">
            Authenticator label: <strong>{friendlyLabel}</strong>
          </p>
        ) : null}
        {info ? <div className="ok">{info}</div> : null}

        {enrolling && (qr || setupKey) ? (
          <div className="mfa-setup">
            {qr ? (
              <div className="mfa-setup-option">
                <h2>Option A — Scan QR code</h2>
                <p className="muted-sm">Use Microsoft Authenticator or Google Authenticator.</p>
                <img className="qr" src={qr} alt="TOTP QR code for OkangGroup enrolment" />
              </div>
            ) : null}
            {setupKey ? (
              <div className="mfa-setup-option">
                <h2>Option B — Enter setup key manually</h2>
                <p className="muted-sm">
                  Same authenticator factor as the QR code. Choose “enter a setup key” in your app.
                </p>
                <label>
                  Setup key
                  <input type="text" readOnly value={setupKey} aria-label="MFA setup key" />
                </label>
                <button type="button" className="secondary" onClick={() => void copySetupKey()}>
                  {copiedKey ? 'Copied' : 'Copy setup key'}
                </button>
              </div>
            ) : null}
          </div>
        ) : null}

        <label>
          Authentication code
          <input
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            required
            disabled={verifying || restarting || !factorId}
          />
        </label>
        {error ? <div className="error">{error}</div> : null}
        <button type="submit" disabled={verifying || restarting || !factorId}>
          {verifying ? 'Verifying…' : 'Verify and continue'}
        </button>
        {showRestart ? (
          <button
            type="button"
            className="secondary"
            disabled={verifying || restarting}
            onClick={() => void restartSetup()}
          >
            {restarting ? 'Restarting…' : 'Restart MFA Setup'}
          </button>
        ) : null}
      </form>
    </div>
  );
}
