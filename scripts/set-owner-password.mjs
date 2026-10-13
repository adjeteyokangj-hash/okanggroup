/**
 * One-off: set password for the existing OkangGroup Owner Auth user.
 *
 * Guards:
 * - Host must be prbgsnxpwyepdggdysnt.supabase.co
 * - Updates only auth user id a7bce15a-566a-43df-aa93-4f23da8bb35f
 * - Email must be okanggroup@gmail.com
 * - Does not create users, change roles, or touch other projects
 * - Never logs password or service-role key
 *
 * Secure local run (PowerShell) — secrets entered interactively, not in chat:
 *   cd C:\Users\edwar\Documents\Projects\OKANGGROUP
 *   node scripts/set-owner-password.mjs
 *
 * Optional: set SUPABASE_SERVICE_ROLE_KEY in the process environment beforehand
 * without typing it on the command line (see OWNER_SETUP.md).
 */

import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const EXPECTED_HOST = 'prbgsnxpwyepdggdysnt.supabase.co';
const EXPECTED_EMAIL = 'okanggroup@gmail.com';
const EXPECTED_USER_ID = 'a7bce15a-566a-43df-aa93-4f23da8bb35f';

const url = `https://${EXPECTED_HOST}`;

function assertNoSecretsInMessage(text) {
  // Never echo request/response bodies that may contain credentials.
  return String(text).replace(/eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g, '[redacted-jwt]');
}

async function promptHidden(rl, label) {
  // Node has no portable hidden prompt; avoid argv/history by reading a line here.
  // Prefer pasting into this prompt rather than `$env:... = "..."` on the CLI.
  output.write(`${label} `);
  const value = await rl.question('');
  return value.trim();
}

const rl = readline.createInterface({ input, output });

try {
  let serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
  if (!serviceKey) {
    serviceKey = await promptHidden(
      rl,
      'Paste service_role key (Project Settings → API), then Enter:',
    );
  }

  const password = await promptHidden(
    rl,
    'Enter new Owner password (min 10 chars), then Enter:',
  );
  const confirm = await promptHidden(rl, 'Confirm password, then Enter:');

  if (!serviceKey) {
    console.error('Aborted: service_role key required.');
    process.exit(1);
  }
  if (!password || password.length < 10) {
    console.error('Aborted: password must be at least 10 characters.');
    process.exit(1);
  }
  if (password !== confirm) {
    console.error('Aborted: passwords do not match.');
    process.exit(1);
  }

  const headers = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
  };

  const getRes = await fetch(`${url}/auth/v1/admin/users/${EXPECTED_USER_ID}`, { headers });
  if (!getRes.ok) {
    console.error(
      'Failed to load Owner user:',
      getRes.status,
      assertNoSecretsInMessage(await getRes.text()),
    );
    process.exit(1);
  }

  const user = await getRes.json();
  const email = (user.email ?? '').toLowerCase();
  if (user.id !== EXPECTED_USER_ID || email !== EXPECTED_EMAIL) {
    console.error('Aborted: Auth user does not match expected Owner identity.');
    process.exit(2);
  }

  const upd = await fetch(`${url}/auth/v1/admin/users/${EXPECTED_USER_ID}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ password, email_confirm: true }),
  });

  if (!upd.ok) {
    console.error(
      'Password update failed:',
      upd.status,
      assertNoSecretsInMessage(await upd.text()),
    );
    process.exit(1);
  }

  console.log('Password updated for okanggroup@gmail.com (Owner).');
  console.log('No roles or other projects were modified.');
  console.log('Next: sign in at http://localhost:5174/admin/login and complete MFA.');
} finally {
  rl.close();
  // Drop local refs; env cleanup is the caller's responsibility if they pre-set the key.
}
