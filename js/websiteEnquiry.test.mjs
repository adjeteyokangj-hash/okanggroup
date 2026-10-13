/**
 * Website enquiry RPC regression (m64).
 * Uses publishable anon key only. Does not modify Auth settings.
 *
 * Env:
 *   VITE_SUPABASE_URL / SUPABASE_URL
 *   VITE_SUPABASE_ANON_KEY / SUPABASE_ANON_KEY
 */

const url = (
  process.env.VITE_SUPABASE_URL ||
  process.env.SUPABASE_URL ||
  'https://prbgsnxpwyepdggdysnt.supabase.co'
).replace(/\/$/, '');
const key =
  process.env.VITE_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  '';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function rpc(name, body) {
  const res = await fetch(`${url}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { ok: res.ok, status: res.status, data };
}

assert(key, 'Missing anon/publishable key for websiteEnquiry.test.mjs');

const stamp = Date.now();
const email = `website-uat-${stamp}@example.com`;

const good = await rpc('submit_website_enquiry', {
  p_organisation_name: `Website UAT Org ${stamp}`,
  p_contact_name: 'Website UAT Contact',
  p_contact_email: email,
  p_contact_phone: '+447400000000',
  p_summary: 'Automated website enquiry regression — safe to mark lost.',
  p_enquiry_type: 'new_website',
});

assert(good.ok, `submit_website_enquiry failed: ${JSON.stringify(good.data)}`);
assert(good.data?.ok === true, 'expected ok:true');
assert(
  typeof good.data?.enquiry_number === 'string' &&
    good.data.enquiry_number.startsWith('OKG-ENQ-'),
  'expected enquiry_number',
);

const bad = await rpc('submit_website_enquiry', {
  p_organisation_name: '',
  p_contact_name: 'x',
  p_contact_email: 'not-an-email',
  p_summary: '',
  p_enquiry_type: 'other',
});
assert(!bad.ok, 'validation should reject empty/invalid payload');

console.log(
  JSON.stringify(
    {
      pass: true,
      enquiry_number: good.data.enquiry_number,
      validation_rejected: true,
    },
    null,
    2,
  ),
);
