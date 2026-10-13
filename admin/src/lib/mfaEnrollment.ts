/**
 * MFA enrolment helpers — display labels only (not permission grants).
 * Never auto-remove verified factors. Unverified factors stay stable across reloads;
 * only an explicit Restart may remove incomplete enrolments.
 */

export type FactorLike = {
  id: string;
  status: string;
  factor_type?: string;
  friendly_name?: string | null;
};

export type MfaNameContext = {
  isOwner: boolean;
  isPlatformAdmin: boolean;
  employmentType: string | null | undefined;
};

/** In-memory only (tab lifetime). Never localStorage / sessionStorage / logs. */
export type EnrollmentSecrets = {
  factorId: string;
  qr: string;
  secret: string;
  friendlyName: string;
};

const enrollmentMemory = new Map<string, EnrollmentSecrets>();
const enrollInFlight = new Map<string, Promise<EnrollmentSecrets>>();

export function mfaFriendlyName(ctx: MfaNameContext): string {
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

export function classifyTotpFactors(all: FactorLike[]) {
  const totp = all.filter((f) => (f.factor_type ?? 'totp') === 'totp');
  return {
    verified: totp.filter((f) => f.status === 'verified'),
    unverified: totp.filter((f) => f.status === 'unverified'),
  };
}

export type EnrollmentPlan =
  | { action: 'challenge'; factorId: string }
  | { action: 'resume'; factorId: string }
  | { action: 'enroll' };

/**
 * Automatic page-load plan — never deletes factors.
 * - Verified → challenge
 * - Unverified → resume same factor (QR/secret from memory if available)
 * - None → enroll once
 */
export function planMfaEnrollment(all: FactorLike[]): EnrollmentPlan {
  const { verified, unverified } = classifyTotpFactors(all);
  if (verified.length > 0) {
    return { action: 'challenge', factorId: verified[0].id };
  }
  if (unverified.length > 0) {
    return { action: 'resume', factorId: unverified[0].id };
  }
  return { action: 'enroll' };
}

/** Explicit Restart only — remove incomplete factors for this user. */
export function planExplicitRestart(all: FactorLike[]): {
  removeFactorIds: string[];
} {
  const { verified, unverified } = classifyTotpFactors(all);
  if (verified.length > 0) {
    throw new Error('A verified authenticator already exists. Restart is not available.');
  }
  return { removeFactorIds: unverified.map((f) => f.id) };
}

export function assertNeverRemovesVerified(
  removeFactorIds: string[],
  all: FactorLike[],
): void {
  const verifiedIds = new Set(classifyTotpFactors(all).verified.map((f) => f.id));
  for (const id of removeFactorIds) {
    if (verifiedIds.has(id)) {
      throw new Error('Refusing to remove a verified MFA factor');
    }
  }
}

export function rememberEnrollment(userId: string, secrets: EnrollmentSecrets): void {
  enrollmentMemory.set(userId, secrets);
}

export function recallEnrollment(
  userId: string,
  factorId?: string | null,
): EnrollmentSecrets | null {
  const cached = enrollmentMemory.get(userId) ?? null;
  if (!cached) return null;
  if (factorId && cached.factorId !== factorId) return null;
  return cached;
}

export function clearEnrollmentMemory(userId: string): void {
  enrollmentMemory.delete(userId);
  enrollInFlight.delete(userId);
}

export function getEnrollInFlight(userId: string): Promise<EnrollmentSecrets> | undefined {
  return enrollInFlight.get(userId);
}

export function setEnrollInFlight(
  userId: string,
  promise: Promise<EnrollmentSecrets>,
): void {
  enrollInFlight.set(userId, promise);
  void promise.finally(() => {
    if (enrollInFlight.get(userId) === promise) {
      enrollInFlight.delete(userId);
    }
  });
}

export function factorStillPresent(all: FactorLike[], factorId: string): boolean {
  return all.some((f) => f.id === factorId);
}

export function helpfulMfaError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('factor not found') || m.includes('factor does not exist')) {
    return 'This authenticator setup is no longer valid (it may have been restarted). Use Restart MFA Setup to get a new QR code and setup key, then add it to your authenticator app again.';
  }
  if (m.includes('already exists') && m.includes('friendly name')) {
    return 'An authenticator setup with this label already exists. Use Restart MFA Setup if enrolment was interrupted, or enter the code from the authenticator entry you already added.';
  }
  if (m.includes('invalid') && (m.includes('code') || m.includes('totp'))) {
    return 'That code was not accepted. Confirm you added the current OkangGroup entry (not an older QR), wait for a fresh code, then try again.';
  }
  return message;
}
