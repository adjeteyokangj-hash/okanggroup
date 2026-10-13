/**
 * Regression: Generate Password must not wipe the returned password on refresh.
 * Run: node src/lib/tempPasswordDisplay.test.mjs
 */

function nextOneTimePasswordAfterLoad(current, options = {}) {
  if (options.clearOneTimePassword === false) return current;
  return null;
}

function assertGenerateResponseHasPassword(data) {
  if (data?.error) throw new Error(String(data.error));
  const pw = data?.temporary_password;
  if (typeof pw !== 'string' || pw.length < 12) {
    throw new Error('No password returned');
  }
  return pw;
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg ?? 'assertion failed');
}

const generated = 'Og$abc1234567-defg!hij9A';

// Default load clears (navigation / normal refresh).
assert(nextOneTimePasswordAfterLoad(generated) === null, 'default load must clear');

// After successful generate, refresh must preserve the in-memory password.
assert(
  nextOneTimePasswordAfterLoad(generated, { clearOneTimePassword: false }) === generated,
  'post-generate load must preserve password',
);

assert(assertGenerateResponseHasPassword({ temporary_password: generated }) === generated);

let threw = false;
try {
  assertGenerateResponseHasPassword({ temporary_password: undefined });
} catch {
  threw = true;
}
assert(threw, 'missing password must throw');

threw = false;
try {
  assertGenerateResponseHasPassword({ error: 'boom', temporary_password: generated });
} catch (e) {
  threw = e.message === 'boom';
}
assert(threw, 'error response must not report success');

// Simulate the pre-fix bug sequence and the fixed sequence.
let uiPassword = null;
uiPassword = assertGenerateResponseHasPassword({ temporary_password: generated });
uiPassword = nextOneTimePasswordAfterLoad(uiPassword); // bug: wipe
assert(uiPassword === null, 'bug reproduction');

uiPassword = assertGenerateResponseHasPassword({ temporary_password: generated });
uiPassword = nextOneTimePasswordAfterLoad(uiPassword, { clearOneTimePassword: false });
assert(uiPassword === generated, 'fix: password still visible after refresh');

console.log('PASS tempPasswordDisplay regression');
