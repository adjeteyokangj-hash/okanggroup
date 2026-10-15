/**
 * Local Owner CMS journey against isolated OkangGroup + OpsWatch.
 * Credentials come from env (never printed): LOCAL_OWNER_PASSWORD, OPSWATCH_CMS_API_KEY.
 * Does not touch production.
 */
import { spawnSync } from 'node:child_process';

const OWNER_EMAIL = 'owner-local@okangroup.test';
const password = (process.env.LOCAL_OWNER_PASSWORD ?? '').trim();
const cmsKey =
  (process.env.OPSWATCH_CMS_API_KEY ?? '').trim() ||
  'opswatch-cms-dev-key-not-for-production';
const opswatchApi = (process.env.OPSWATCH_API_URL || 'http://127.0.0.1:4000/api').replace(/\/$/, '');
// Edge runtime is inside Docker — it must call the host API via host.docker.internal.
const opswatchApiFromGateway = (
  process.env.OPSWATCH_API_URL_FROM_GATEWAY ||
  'http://host.docker.internal:4000/api'
).replace(/\/$/, '');
const opswatchWeb = (process.env.OPSWATCH_WEB_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const credRef = 'dev/opswatch-marketing-cms';

const results = [];
const record = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${detail ? ` — ${detail}` : ''}`);
};

function statusEnv() {
  const r = spawnSync('npx', ['supabase', 'status', '-o', 'env'], {
    encoding: 'utf8',
    shell: true,
  });
  const text = `${r.stdout}\n${r.stderr}`;
  return {
    apiUrl: /API_URL="?([^"\r\n]+)"?/.exec(text)?.[1] || 'http://127.0.0.1:54421',
    anon: /ANON_KEY="?([^"\r\n]+)"?/.exec(text)?.[1],
    service: /SERVICE_ROLE_KEY="?([^"\r\n]+)"?/.exec(text)?.[1],
  };
}

async function main() {
  if (!password) {
    console.error('Set LOCAL_OWNER_PASSWORD for owner-local@okangroup.test');
    process.exit(1);
  }
  const { apiUrl, anon } = statusEnv();
  if (!anon) {
    console.error('Could not read local ANON_KEY');
    process.exit(1);
  }
  if (!/127\.0\.0\.1|localhost/.test(apiUrl)) {
    console.error('REFUSED non-local API_URL');
    process.exit(2);
  }

  // 1 Owner login
  const loginRes = await fetch(`${apiUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: anon, Authorization: `Bearer ${anon}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: OWNER_EMAIL, password }),
  });
  const login = await loginRes.json().catch(() => ({}));
  const accessToken = login.access_token;
  record('Owner login', Boolean(accessToken), accessToken ? '' : JSON.stringify(login));
  if (!accessToken) {
    printTable();
    process.exit(1);
  }

  const authHeaders = {
    apikey: anon,
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  };

  // Locate OpsWatch instance
  const instRes = await fetch(
    `${apiUrl}/rest/v1/cms_instances?product_code=eq.opswatch&select=id,display_name,ownership_kind,public_site_url`,
    { headers: { ...authHeaders, Prefer: 'return=representation' } },
  );
  const instances = await instRes.json();
  const inst = Array.isArray(instances) ? instances[0] : null;
  record('OpsWatch registered', Boolean(inst?.id), inst?.ownership_kind ?? '');
  if (!inst?.id) {
    printTable();
    process.exit(1);
  }

  // Treasure House unchanged
  const thRes = await fetch(
    `${apiUrl}/rest/v1/cms_instances?id=eq.c8a1b2d3-e4f5-4678-9abc-111111111102&select=ownership_kind,product_code,client_id`,
    { headers: authHeaders },
  );
  const th = (await thRes.json())?.[0];
  record(
    'Existing CMS regression',
    th?.ownership_kind === 'client_website' && th?.product_code == null,
    th ? `ownership=${th.ownership_kind}` : 'missing',
  );

  // Store vault credential (value never logged)
  const store = await fetch(`${apiUrl}/rest/v1/rpc/store_cms_credential`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      p_credential_ref: credRef,
      p_secret: cmsKey,
      p_description: 'Local OpsWatch marketing CMS key',
    }),
  });
  const storeJson = await store.json().catch(() => ({}));
  record('Vault credential stored', store.ok || storeJson?.ok === true, store.ok ? '' : JSON.stringify(storeJson));

  // Configure connection
  const cfg = await fetch(`${apiUrl}/rest/v1/rpc/configure_cms_connection`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      p_instance_id: inst.id,
      p_adapter_code: 'opswatch_marketing',
      p_base_url: `${opswatchApiFromGateway}/cms`,
      p_credential_ref: credRef,
      p_notes: 'Local Owner journey',
      p_integration_mode: 'external',
    }),
  });
  const cfgJson = await cfg.json().catch(() => ({}));
  record('OpsWatch connection', cfg.ok || cfgJson?.ok === true, cfgJson?.adapter ?? '');

  // Ensure public_site_url
  await fetch(`${apiUrl}/rest/v1/cms_instances?id=eq.${inst.id}`, {
    method: 'PATCH',
    headers: { ...authHeaders, Prefer: 'return=minimal' },
    body: JSON.stringify({ public_site_url: opswatchWeb }),
  });

  async function gateway(action, extra = {}) {
    const res = await fetch(`${apiUrl}/functions/v1/cms-integration-gateway`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        action,
        instance_id: inst.id,
        idempotency_key: `${action}-${inst.id}-${Date.now()}-${Math.random()}`,
        ...extra,
      }),
    });
    const json = await res.json().catch(() => ({}));
    return { ok: res.ok && json?.ok !== false, status: res.status, json };
  }

  const health = await gateway('health');
  record(
    'Gateway health',
    health.ok || health.json?.upstream?.ok === true || health.json?.upstream?.adapter === 'opswatch_marketing',
    `status=${health.status}`,
  );

  const marker = `Owner-UI-${Date.now()}`;
  const moduleCode = 'opswatch.page.home';

  const beforePub = await fetch(`${opswatchApi}/cms/v1/published`);
  const beforeJson = await beforePub.json();
  const beforeTitle = beforeJson?.modules?.[moduleCode]?.hero?.title;

  // Preserve full module shape (sections etc.) — only change the homepage heading.
  const existing = await gateway('get_content', { module_code: moduleCode });
  const existingState = existing.json?.upstream ?? existing.json ?? {};
  const base =
    (existingState.draft && typeof existingState.draft === 'object' ? existingState.draft : null) ||
    (existingState.published && typeof existingState.published === 'object'
      ? existingState.published
      : null) ||
    beforeJson?.modules?.[moduleCode] ||
    {};
  const nextContent = {
    ...base,
    cmsKey: moduleCode,
    hero: {
      ...((base.hero && typeof base.hero === 'object' ? base.hero : {}) || {}),
      title: marker,
    },
  };

  const put = await gateway('put_content', {
    module_code: moduleCode,
    content: nextContent,
  });
  record('Homepage editing', put.ok, put.ok ? '' : JSON.stringify(put.json).slice(0, 200));

  const midPub = await fetch(`${opswatchApi}/cms/v1/published`);
  const midJson = await midPub.json();
  const midTitle = midJson?.modules?.[moduleCode]?.hero?.title;
  record('Draft isolation', midTitle !== marker, `public title still="${midTitle ?? beforeTitle}"`);

  const preview = await gateway('preview_token', { module_code: moduleCode });
  const previewToken = preview.json?.upstream?.token || preview.json?.token;
  record(
    'Preview',
    Boolean(previewToken),
    previewToken ? 'token issued' : JSON.stringify(preview.json).slice(0, 180),
  );

  if (previewToken) {
    const draftView = await fetch(
      `${opswatchApi}/cms/v1/preview?token=${encodeURIComponent(previewToken)}`,
    );
    const draftJson = await draftView.json();
    const previewTitle = draftJson?.modules?.[moduleCode]?.hero?.title;
    record('Preview shows draft', previewTitle === marker, `preview title="${previewTitle}"`);
  }

  const publish = await gateway('publish', { module_code: moduleCode });
  record('Publishing', publish.ok, publish.ok ? '' : JSON.stringify(publish.json).slice(0, 200));

  const afterPub = await fetch(`${opswatchApi}/cms/v1/published`);
  const afterJson = await afterPub.json();
  const afterTitle = afterJson?.modules?.[moduleCode]?.hero?.title;
  record('Public website update', afterTitle === marker, `published title="${afterTitle}"`);

  // Poll homepage HTML until published marker appears (Next may still be compiling).
  let htmlOk = false;
  let htmlDetail = 'marker not in HTML yet';
  for (let attempt = 0; attempt < 12; attempt++) {
    try {
      const home = await fetch(`${opswatchWeb}/?cmsCheck=${Date.now()}`, {
        redirect: 'follow',
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' },
      });
      const html = await home.text();
      if (home.ok && html.includes(marker)) {
        htmlOk = true;
        htmlDetail = `marker present (attempt ${attempt + 1})`;
        break;
      }
      htmlDetail = home.ok ? 'marker not in HTML yet' : `HTTP ${home.status}`;
    } catch (e) {
      htmlDetail = e instanceof Error ? e.message : 'fetch failed';
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  record('Public homepage HTML', htmlOk, htmlDetail);

  const rollback = await gateway('rollback', { module_code: moduleCode });
  record('Rollback', rollback.ok, rollback.ok ? '' : JSON.stringify(rollback.json).slice(0, 200));

  const rbPub = await fetch(`${opswatchApi}/cms/v1/published`);
  const rbJson = await rbPub.json();
  const rbTitle = rbJson?.modules?.[moduleCode]?.hero?.title;
  record('Rollback restored prior', rbTitle !== marker, `title now="${rbTitle}"`);

  // Confirm public HTML no longer shows the rolled-back marker.
  let rbHtmlOk = false;
  let rbHtmlDetail = 'marker still in HTML';
  for (let attempt = 0; attempt < 12; attempt++) {
    try {
      const home = await fetch(`${opswatchWeb}/?cmsRollback=${Date.now()}`, {
        redirect: 'follow',
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' },
      });
      const html = await home.text();
      if (home.ok && !html.includes(marker)) {
        rbHtmlOk = true;
        rbHtmlDetail = `marker cleared (attempt ${attempt + 1})`;
        break;
      }
      rbHtmlDetail = home.ok ? 'marker still in HTML' : `HTTP ${home.status}`;
    } catch (e) {
      rbHtmlDetail = e instanceof Error ? e.message : 'fetch failed';
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  record('Rollback public HTML', rbHtmlOk, rbHtmlDetail);

  // Security: unauthorised cannot put
  const bad = await fetch(`${apiUrl}/functions/v1/cms-integration-gateway`, {
    method: 'POST',
    headers: {
      apikey: anon,
      Authorization: `Bearer ${anon}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action: 'put_content', instance_id: inst.id, module_code: moduleCode, content: {} }),
  });
  record('Security unauthorised edit denied', bad.status === 401 || bad.status === 403, `status=${bad.status}`);

  // Capabilities deny customer/billing
  const caps = await fetch(`${opswatchApi}/cms/v1/capabilities`, {
    headers: { 'X-Api-Key': cmsKey },
  });
  const capsJson = await caps.json();
  record(
    'Security CMS scope',
    capsJson?.capabilities?.customer_data === false &&
      capsJson?.capabilities?.billing_records === false &&
      capsJson?.capabilities?.pricing_amounts === false,
    '',
  );

  // Audit rows
  const audit = await fetch(
    `${apiUrl}/rest/v1/cms_integration_operations?cms_instance_id=eq.${inst.id}&order=created_at.desc&limit=5&select=operation,status`,
    { headers: authHeaders },
  );
  const auditRows = await audit.json();
  record('Publishing audited', Array.isArray(auditRows) && auditRows.length > 0, `rows=${auditRows?.length ?? 0}`);

  printTable();
  if (results.some((r) => !r.ok)) process.exitCode = 1;
}

function printTable() {
  console.log('\n| Requirement | Result | Detail |');
  console.log('| --- | --- | --- |');
  for (const r of results) {
    console.log(`| ${r.name} | ${r.ok ? 'PASS' : 'FAIL'} | ${r.detail.replace(/\|/g, '/')} |`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
