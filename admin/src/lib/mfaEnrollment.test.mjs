/**
 * Regression: stable MFA enrolment (no auto-delete on reload).
 * Run: node src/lib/mfaEnrollment.test.mjs
 */

function mfaFriendlyName(ctx) {
  if (ctx.isOwner) return 'OkangGroup Owner';
  if (ctx.isPlatformAdmin) return 'OkangGroup Admin';
  switch (ctx.employmentType) {
    case 'contractor':
      return 'OkangGroup Contractor';
    case 'freelancer':
      return 'OkangGroup Freelancer';
    default:
      return 'OkangGroup Staff';
  }
}

function classifyTotpFactors(all) {
  const totp = all.filter((f) => (f.factor_type ?? 'totp') === 'totp');
  return {
    verified: totp.filter((f) => f.status === 'verified'),
    unverified: totp.filter((f) => f.status === 'unverified'),
  };
}

function planMfaEnrollment(all) {
  const { verified, unverified } = classifyTotpFactors(all);
  if (verified.length > 0) return { action: 'challenge', factorId: verified[0].id };
  if (unverified.length > 0) return { action: 'resume', factorId: unverified[0].id };
  return { action: 'enroll' };
}

function planExplicitRestart(all) {
  const { verified, unverified } = classifyTotpFactors(all);
  if (verified.length > 0) {
    throw new Error('A verified authenticator already exists. Restart is not available.');
  }
  return { removeFactorIds: unverified.map((f) => f.id) };
}

function assertNeverRemovesVerified(removeFactorIds, all) {
  const verifiedIds = new Set(classifyTotpFactors(all).verified.map((f) => f.id));
  for (const id of removeFactorIds) {
    if (verifiedIds.has(id)) throw new Error('Refusing to remove a verified MFA factor');
  }
}

function factorStillPresent(all, factorId) {
  return all.some((f) => f.id === factorId);
}

function helpfulMfaError(message) {
  const m = message.toLowerCase();
  if (m.includes('factor not found')) {
    return 'This authenticator setup is no longer valid';
  }
  return message;
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg ?? 'assertion failed');
}

assert(mfaFriendlyName({ isOwner: false, isPlatformAdmin: false, employmentType: 'employee' }) === 'OkangGroup Staff');

// Reload with unverified factor must RESUME — not auto-restart/delete
const interrupted = [
  { id: 'u1', status: 'unverified', factor_type: 'totp', friendly_name: 'OkangGroup Staff' },
];
const resume = planMfaEnrollment(interrupted);
assert(resume.action === 'resume', 'reload must resume');
assert(resume.factorId === 'u1');

// Second reload still same factor
assert(planMfaEnrollment(interrupted).factorId === 'u1');

// Explicit restart only
const restart = planExplicitRestart(interrupted);
assert(restart.removeFactorIds[0] === 'u1');
assertNeverRemovesVerified(restart.removeFactorIds, interrupted);

// Verified → challenge; restart blocked
const verified = [
  { id: 'v1', status: 'verified', factor_type: 'totp', friendly_name: 'OkangGroup Owner' },
];
assert(planMfaEnrollment(verified).action === 'challenge');
let blocked = false;
try {
  planExplicitRestart(verified);
} catch {
  blocked = true;
}
assert(blocked, 'must not restart when verified exists');

assertNeverRemovesVerified(['u1'], [
  ...verified,
  { id: 'u1', status: 'unverified', factor_type: 'totp' },
]);
let refused = false;
try {
  assertNeverRemovesVerified(['v1'], verified);
} catch {
  refused = true;
}
assert(refused);

// Factor not found after delete
assert(factorStillPresent(interrupted, 'u1'));
assert(!factorStillPresent([], 'u1'));
assert(helpfulMfaError('Factor not found').includes('no longer valid'));

// Fresh user
assert(planMfaEnrollment([]).action === 'enroll');

console.log('PASS mfaEnrollment regression');
