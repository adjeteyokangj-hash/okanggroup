/**
 * OkangGroup Business Operations E2E UAT (synthetic data).
 * Runs against linked Supabase via MCP-compatible SQL through service role
 * when SUPABASE_SERVICE_ROLE_KEY + VITE_SUPABASE_URL (or SUPABASE_URL) are set.
 *
 * Usage: node scripts/bo-ops-e2e-uat.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m || process.env[m[1]]) continue;
    process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
}

loadEnvFile(resolve('admin/.env'));
loadEnvFile(resolve('.env'));

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error('Missing SUPABASE_URL/VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(2);
}

const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

const OWNER = 'a7bce15a-566a-43df-aa93-4f23da8bb35f';
const DANIEL = '928646aa-759b-42b5-a346-19aa71ead822';
const CLIENT_A_USER = 'c1111111-1111-4111-8111-111111111111';
const CLIENT_B_USER = 'c2222222-2222-4222-8222-222222222222';
const CLIENT_A = 'dedbd3bd-1a58-4162-b090-3e7d9f52a46e'; // OKG-CL-000002
const CLIENT_B = '84585db1-d1f1-48e4-b8ba-ab48be9ac28b'; // UAT-OTHER-ISO

const results = [];
function record(id, pass, detail) {
  results.push({ id, result: pass ? 'PASS' : 'FAIL', detail });
  console.log(`${pass ? 'PASS' : 'FAIL'} ${id}: ${detail}`);
}

async function rpcAs(userId, fn, args = {}) {
  // Service role cannot impersonate JWT easily via supabase-js RPC auth.uid().
  // Use SQL wrapper through REST rpc only when JWT is user session.
  // For service-role UAT we call SQL via postgres functions with explicit actor where needed,
  // and use a dedicated SQL UAT harness for RLS.
  return admin.rpc(fn, args);
}

async function main() {
  // --- Happy path data (service role bypasses RLS; validates schema/workflows) ---
  const tag = `BO-UAT-${Date.now()}`;

  const { data: enq, error: enqErr } = await admin
    .from('business_enquiries')
    .insert({
      organisation_name: `${tag} Synthetic Ltd`,
      contact_name: 'Ada Synthetic',
      contact_email: `ada.${Date.now()}@uat.okangroup.test`,
      contact_phone: '+233000000000',
      summary: 'Website + CMS management enquiry',
      source: 'direct',
      enquiry_type: 'new_website',
      status: 'qualified',
      created_by: OWNER,
    })
    .select('id, enquiry_number, status')
    .single();
  record('UAT-01-enquiry-create', !enqErr && !!enq, enqErr?.message ?? enq?.enquiry_number);

  // Convert via SQL as owner (SECURITY DEFINER uses auth.uid())
  const { data: convertRows, error: convErr } = await admin.rpc('uat_bo_run_as', {
    p_user_id: OWNER,
    p_sql: `SELECT public.convert_enquiry_to_client('${enq.id}'::uuid) AS client_id`,
  }).maybeSingle?.() ?? { data: null, error: { message: 'uat_bo_run_as missing' } };

  // If harness missing, create client manually and mark convert as blocked for now
  let clientId = convertRows?.client_id ?? null;
  if (convErr || !clientId) {
    const { data: client, error: cErr } = await admin
      .from('clients')
      .insert({
        legal_name: `${tag} Synthetic Ltd`,
        primary_email: `ops.${Date.now()}@uat.okangroup.test`,
        status: 'prospect',
        notes_internal: `Converted manually for UAT after convert RPC auth harness: ${enq?.enquiry_number}`,
        account_manager_profile_id: DANIEL,
        created_by: OWNER,
      })
      .select('id, client_code')
      .single();
    clientId = client?.id;
    record(
      'UAT-02-enquiry-convert',
      false,
      `convert RPC needs auth.uid harness (${convErr?.message ?? 'no harness'}); synthetic client created ${client?.client_code ?? cErr?.message}`,
    );
    if (enq?.id && clientId) {
      await admin
        .from('business_enquiries')
        .update({
          status: 'converted',
          converted_client_id: clientId,
          converted_at: new Date().toISOString(),
        })
        .eq('id', enq.id);
      await admin.from('client_contacts').insert({
        client_id: clientId,
        full_name: 'Ada Synthetic',
        email: `ada.${Date.now()}@uat.okangroup.test`,
        is_primary: true,
      });
      await admin.from('client_activities').insert({
        client_id: clientId,
        activity_type: 'enquiry_converted',
        body: `UAT linked enquiry ${enq.enquiry_number}`,
        created_by: OWNER,
      });
    }
  } else {
    record('UAT-02-enquiry-convert', true, `client ${clientId}`);
  }

  if (!clientId) {
    console.error('Cannot continue without client');
    process.exit(1);
  }

  const { data: tax } = await admin.from('tax_profiles').select('id, code').eq('code', 'GB_STD').maybeSingle();
  const { data: rate } = await admin
    .from('tax_profile_rates')
    .select('rate')
    .eq('tax_profile_id', tax.id)
    .order('effective_from', { ascending: false })
    .limit(1)
    .maybeSingle();

  const subtotal = 1000;
  const taxRate = Number(rate?.rate ?? 0.2);
  const taxTotal = Number((subtotal * taxRate).toFixed(2));
  const total = Number((subtotal + taxTotal).toFixed(2));

  const { data: quote, error: qErr } = await admin
    .from('quotations')
    .insert({
      client_id: clientId,
      status: 'accepted',
      currency_code: 'GBP',
      subtotal,
      tax_total: taxTotal,
      total,
      tax_profile_id: tax?.id ?? null,
      lines_json: [
        {
          description: 'Website build',
          quantity: 1,
          unit_amount: subtotal,
          line_total: subtotal,
          tax_rate: taxRate,
          tax_amount: taxTotal,
        },
      ],
      created_by: OWNER,
    })
    .select('id, quote_number, total, tax_total, currency_code')
    .single();
  record(
    'UAT-03-quotation',
    !qErr && quote?.total === total && quote?.tax_total === taxTotal && quote?.currency_code === 'GBP',
    qErr?.message ?? `${quote?.quote_number} total=${quote?.total} tax=${quote?.tax_total}`,
  );

  const { data: contract, error: ctErr } = await admin
    .from('contracts')
    .insert({
      client_id: clientId,
      quotation_id: quote.id,
      title: `${tag} Service Agreement`,
      status: 'active',
      currency_code: 'GBP',
      value_amount: total,
      effective_on: new Date().toISOString().slice(0, 10),
      created_by: OWNER,
    })
    .select('id, contract_number, status')
    .single();
  record('UAT-04-contract', !ctErr && contract?.status === 'active', ctErr?.message ?? contract?.contract_number);

  const { data: project, error: pErr } = await admin
    .from('projects')
    .insert({
      client_id: clientId,
      name: `${tag} Website Delivery`,
      category: 'website',
      stage: 'development',
      status: 'open',
      budget_amount: 1200,
      budget_currency: 'GBP',
      contract_id: contract.id,
      summary: 'UAT project',
      handover_checklist_json: [],
      created_by: OWNER,
    })
    .select('id, code, budget_amount, contract_id')
    .single();
  record(
    'UAT-05-project',
    !pErr && project?.contract_id === contract.id && Number(project?.budget_amount) === 1200,
    pErr?.message ?? `${project?.code} budget=${project?.budget_amount}`,
  );

  const { data: task, error: tErr } = await admin
    .from('tasks')
    .insert({
      client_id: clientId,
      project_id: project.id,
      title: `${tag} Build homepage`,
      status: 'assigned',
      priority: 'normal',
      created_by: OWNER,
    })
    .select('id')
    .single();
  if (!tErr && task) {
    await admin.from('task_assignments').insert({
      task_id: task.id,
      assignee_profile_id: DANIEL,
      status: 'active',
      assignment_type: 'manual',
    });
  }
  record('UAT-06-task-assign', !tErr && !!task, tErr?.message ?? task?.id);

  const { data: deliv, error: dErr } = await admin
    .from('project_deliverables')
    .insert({
      client_id: clientId,
      project_id: project.id,
      name: 'Homepage package',
      deliverable_type: 'design',
      status: 'ready_for_review',
      created_by: OWNER,
    })
    .select('id, status')
    .single();
  record('UAT-07-deliverable', !dErr && !!deliv, dErr?.message ?? deliv?.id);

  const { data: doc, error: docErr } = await admin
    .from('project_documents')
    .insert({
      client_id: clientId,
      project_id: project.id,
      title: `${tag} Spec v1`,
      doc_type: 'specification',
      file_name: 'spec-v1.pdf',
      mime_type: 'application/pdf',
      byte_size: 1024,
      storage_path: `${clientId}/${project.id}/uat-spec-v1-${Date.now()}.pdf`,
      uploaded_by: OWNER,
      visibility: 'client_visible',
      approval_status: 'pending',
      version_no: 1,
    })
    .select('id, version_no, approval_status, visibility')
    .single();
  record(
    'UAT-08-document-share',
    !docErr && doc?.visibility === 'client_visible' && doc?.approval_status === 'pending',
    docErr?.message ?? doc?.id,
  );

  const { data: docV2, error: doc2Err } = await admin
    .from('project_documents')
    .insert({
      client_id: clientId,
      project_id: project.id,
      title: `${tag} Spec v2`,
      doc_type: 'specification',
      file_name: 'spec-v2.pdf',
      mime_type: 'application/pdf',
      byte_size: 2048,
      storage_path: `${clientId}/${project.id}/uat-spec-v2-${Date.now()}.pdf`,
      uploaded_by: OWNER,
      visibility: 'client_visible',
      approval_status: 'pending',
      version_of: doc?.id ?? null,
      version_no: 2,
    })
    .select('id, version_no, version_of')
    .single();
  record(
    'UAT-09-document-version',
    !doc2Err && docV2?.version_no === 2 && docV2?.version_of === doc?.id,
    doc2Err?.message ?? `v2=${docV2?.id} of=${docV2?.version_of}`,
  );

  const { data: inv, error: invErr } = await admin
    .from('invoices')
    .insert({
      client_id: clientId,
      project_id: project.id,
      contract_id: contract.id,
      quotation_id: quote.id,
      status: 'draft',
      currency_code: 'GBP',
      subtotal,
      tax_total: taxTotal,
      total,
      amount_outstanding: total,
      tax_snapshot_json: {
        tax_profile_code: 'GB_STD',
        rate: taxRate,
        taxable_base: subtotal,
        tax_amount: taxTotal,
      },
      created_by: OWNER,
    })
    .select('id, invoice_number, total, tax_total, tax_snapshot_json')
    .single();
  if (!invErr && inv) {
    await admin.from('invoice_lines').insert({
      client_id: clientId,
      invoice_id: inv.id,
      description: 'Website build',
      quantity: 1,
      unit_amount: subtotal,
      line_total: subtotal,
      tax_rate: taxRate,
      tax_amount: taxTotal,
    });
  }
  record(
    'UAT-10-invoice-draft',
    !invErr &&
      Number(inv?.total) === total &&
      Number(inv?.tax_total) === taxTotal &&
      inv?.tax_snapshot_json?.rate === taxRate,
    invErr?.message ?? `${inv?.invoice_number} total=${inv?.total}`,
  );

  // Expense against project
  const { data: exp, error: expErr } = await admin
    .from('expenses')
    .insert({
      category: 'hosting',
      amount: 50,
      currency_code: 'GBP',
      client_id: clientId,
      project_id: project.id,
      vendor_name: 'UAT Host',
      created_by: OWNER,
    })
    .select('id, amount')
    .single();
  record('UAT-11-expense', !expErr && Number(exp?.amount) === 50, expErr?.message ?? exp?.id);

  // Dashboard reconciliation figures
  const { data: dashInv } = await admin
    .from('invoices')
    .select('total, amount_paid, amount_outstanding, status')
    .eq('id', inv.id)
    .maybeSingle();
  const { data: dashExp } = await admin
    .from('expenses')
    .select('amount')
    .eq('project_id', project.id)
    .eq('status', 'recorded');
  const expSum = (dashExp ?? []).reduce((s, r) => s + Number(r.amount), 0);
  record(
    'UAT-12-dashboard-source-reconcile',
    Number(dashInv?.total) === total && expSum === 50,
    `invoice.total=${dashInv?.total} expenses=${expSum}`,
  );

  // Attempt overpayment after issue — will use SQL harness later; here record expected defect if RPC allows
  console.log('\n--- Writing SQL harness results to supabase/.temp/bo-uat-state.json ---');
  const state = {
    tag,
    clientId,
    enquiryId: enq?.id,
    quoteId: quote?.id,
    contractId: contract?.id,
    projectId: project?.id,
    taskId: task?.id,
    deliverableId: deliv?.id,
    docId: doc?.id,
    docV2Id: docV2?.id,
    invoiceId: inv?.id,
    expenseId: exp?.id,
    subtotal,
    taxTotal,
    total,
    taxRate,
    actors: { OWNER, DANIEL, CLIENT_A_USER, CLIENT_B_USER, CLIENT_A, CLIENT_B },
    results,
  };
  const { writeFileSync, mkdirSync } = await import('node:fs');
  mkdirSync('supabase/.temp', { recursive: true });
  writeFileSync('supabase/.temp/bo-uat-state.json', JSON.stringify(state, null, 2));
  console.log(JSON.stringify({ summary: results }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
