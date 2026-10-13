import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

/**
 * Mirrors public.handle_new_user authorisation rules (m63).
 * user_metadata must not authorise; app_metadata / invitation may.
 */
function classifySignup(input) {
  const pending = Boolean(input.pendingInvitation);
  const appProvisioned = input.appMetadata?.staff_provisioned === true
    || input.appMetadata?.staff_provisioned === 'true';
  const appKind = input.appMetadata?.account_kind || null;
  const authorized =
    pending ||
    appProvisioned ||
    ['staff', 'client_user', 'system'].includes(appKind);

  if (!authorized) {
    return { account_kind: 'staff', account_status: 'suspended', authorized: false };
  }

  const kind = ['staff', 'client_user', 'system'].includes(appKind)
    ? appKind
    : ['staff', 'client_user', 'system'].includes(input.userMetadata?.account_kind)
      ? input.userMetadata.account_kind
      : 'staff';

  const status =
    pending || appProvisioned
      ? 'pending_setup'
      : appKind === 'client_user'
        ? 'active'
        : 'pending_setup';

  return { account_kind: kind, account_status: status, authorized: true };
}

describe('signup quarantine (m63 rules)', () => {
  it('quarantines public sign-up with spoofed user_metadata staff flags', () => {
    const r = classifySignup({
      pendingInvitation: false,
      userMetadata: {
        account_kind: 'staff',
        staff_provisioned: true,
      },
      appMetadata: {},
    });
    assert.equal(r.authorized, false);
    assert.equal(r.account_status, 'suspended');
    assert.equal(r.account_kind, 'staff');
  });

  it('allows invite-staff style app_metadata provision', () => {
    const r = classifySignup({
      pendingInvitation: false,
      userMetadata: { account_kind: 'staff', staff_provisioned: true },
      appMetadata: { staff_provisioned: true },
    });
    assert.equal(r.authorized, true);
    assert.equal(r.account_status, 'pending_setup');
    assert.equal(r.account_kind, 'staff');
  });

  it('allows pending invitation without app_metadata', () => {
    const r = classifySignup({
      pendingInvitation: true,
      userMetadata: {},
      appMetadata: {},
    });
    assert.equal(r.authorized, true);
    assert.equal(r.account_status, 'pending_setup');
  });

  it('allows create-client-portal-user app_metadata account_kind', () => {
    const r = classifySignup({
      pendingInvitation: false,
      userMetadata: { account_kind: 'client_user' },
      appMetadata: { account_kind: 'client_user' },
    });
    assert.equal(r.authorized, true);
    assert.equal(r.account_kind, 'client_user');
    assert.equal(r.account_status, 'active');
  });

  it('ignores user_metadata account_kind alone', () => {
    const r = classifySignup({
      pendingInvitation: false,
      userMetadata: { account_kind: 'client_user' },
      appMetadata: {},
    });
    assert.equal(r.authorized, false);
    assert.equal(r.account_status, 'suspended');
  });
});
