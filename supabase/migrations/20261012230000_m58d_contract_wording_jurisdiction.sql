-- m58d: Independent vs quotation-linked agreement wording + governing jurisdiction defaults.
-- Preserves contract numbers, financial totals, statuses, snapshots and version history rows.
-- Soft-updates only bodies that still match the legacy quotation-implying template defaults.

UPDATE public.contract_templates
SET
  body_json = jsonb_build_object(
    'scope_of_work',
    'OkangGroup will design, build and deliver the agreed digital solution described in the schedule of services in this agreement, to a professional standard consistent with the agreed scope and schedule of services.',
    'governing_jurisdiction',
    'england_wales',
    'deliverables',
    jsonb_build_array(
      jsonb_build_object('title', 'Agreed solution delivery', 'description', 'Implementation of the accepted scope'),
      jsonb_build_object('title', 'Handover pack', 'description', 'Credentials, documentation and release notes as applicable')
    ),
    'milestones',
    jsonb_build_array(
      jsonb_build_object('title', 'Discovery / kick-off', 'due_offset_days', 7, 'description', 'Requirements confirmed'),
      jsonb_build_object('title', 'Build & review', 'due_offset_days', 30, 'description', 'Development and client review cycles'),
      jsonb_build_object('title', 'Launch / handover', 'due_offset_days', 45, 'description', 'Go-live or formal handover')
    ),
    'payment_schedule',
    jsonb_build_array(
      jsonb_build_object('label', 'Deposit', 'percent', 40, 'trigger', 'on_acceptance', 'description', 'Payable on contract acceptance'),
      jsonb_build_object('label', 'Progress', 'percent', 40, 'trigger', 'milestone', 'description', 'Payable at mid-project milestone'),
      jsonb_build_object('label', 'Final balance', 'percent', 20, 'trigger', 'on_completion', 'description', 'Payable on completion / go-live')
    ),
    'okang_responsibilities',
    'OkangGroup will provide competent personnel, communicate progress, protect confidential information, and deliver the agreed outputs within the contracted scope and currency.',
    'client_responsibilities',
    'The Client will provide timely feedback, content, access credentials and decisions required for delivery, and pay invoices according to the payment schedule.',
    'terms_and_conditions',
    E'1. Scope is limited to the services and amounts stated in this agreement and its schedule of services.\n2. Changes outside scope require a written amendment agreed by both parties.\n3. Intellectual property in deliverables transfers to the Client upon full payment, unless otherwise agreed.\n4. Either party may terminate for material breach if not remedied within 14 days of written notice.\n5. Liability is limited to the contract value paid in the preceding 12 months, excluding fraud or wilful misconduct.\n6. This agreement is governed by the laws of England and Wales.'
  ),
  updated_at = now()
WHERE code = 'okang_service_agreement';

-- Independent contracts still on the legacy quotation-implying defaults → independent wording.
-- Jurisdiction defaults from currency (GHS → Ghana; otherwise England and Wales).
UPDATE public.contracts c
SET
  body_json =
    c.body_json
    || jsonb_build_object(
      'scope_of_work',
      'OkangGroup will design, build and deliver the agreed digital solution described in the schedule of services in this agreement, to a professional standard consistent with the agreed scope and schedule of services.',
      'terms_and_conditions',
      CASE
        WHEN upper(c.currency_code) = 'GHS' THEN
          E'1. Scope is limited to the services and amounts stated in this agreement and its schedule of services.\n2. Changes outside scope require a written amendment agreed by both parties.\n3. Intellectual property in deliverables transfers to the Client upon full payment, unless otherwise agreed.\n4. Either party may terminate for material breach if not remedied within 14 days of written notice.\n5. Liability is limited to the contract value paid in the preceding 12 months, excluding fraud or wilful misconduct.\n6. This agreement is governed by the laws of Ghana.'
        ELSE
          E'1. Scope is limited to the services and amounts stated in this agreement and its schedule of services.\n2. Changes outside scope require a written amendment agreed by both parties.\n3. Intellectual property in deliverables transfers to the Client upon full payment, unless otherwise agreed.\n4. Either party may terminate for material breach if not remedied within 14 days of written notice.\n5. Liability is limited to the contract value paid in the preceding 12 months, excluding fraud or wilful misconduct.\n6. This agreement is governed by the laws of England and Wales.'
      END,
      'governing_jurisdiction',
      CASE WHEN upper(c.currency_code) = 'GHS' THEN 'ghana' ELSE 'england_wales' END
    ),
  updated_at = now()
WHERE c.quotation_id IS NULL
  AND coalesce(c.quotation_snapshot_json, 'null'::jsonb) = 'null'::jsonb
  AND c.body_json->>'scope_of_work' =
    'OkangGroup will design, build and deliver the agreed digital solution described in the schedule of services, to a professional standard consistent with the accepted quotation.'
  AND c.body_json->>'terms_and_conditions' =
    E'1. Scope is limited to the services and amounts stated in this agreement and any attached quotation snapshot.\n2. Changes outside scope require a written amendment or revised quotation.\n3. Intellectual property in deliverables transfers to the Client upon full payment, unless otherwise agreed.\n4. Either party may terminate for material breach if not remedied within 14 days of written notice.\n5. Liability is limited to the contract value paid in the preceding 12 months, excluding fraud or wilful misconduct.\n6. This agreement is governed by the laws of England and Wales unless a different jurisdiction is agreed in writing.';

-- Quotation-linked contracts on the legacy T&Cs: keep quotation scope references,
-- refresh jurisdiction clause + stamp governing_jurisdiction from currency.
UPDATE public.contracts c
SET
  body_json =
    c.body_json
    || jsonb_build_object(
      'terms_and_conditions',
      CASE
        WHEN upper(c.currency_code) = 'GHS' THEN
          E'1. Scope is limited to the services and amounts stated in this agreement and any attached quotation snapshot.\n2. Changes outside scope require a written amendment or revised quotation.\n3. Intellectual property in deliverables transfers to the Client upon full payment, unless otherwise agreed.\n4. Either party may terminate for material breach if not remedied within 14 days of written notice.\n5. Liability is limited to the contract value paid in the preceding 12 months, excluding fraud or wilful misconduct.\n6. This agreement is governed by the laws of Ghana.'
        ELSE
          E'1. Scope is limited to the services and amounts stated in this agreement and any attached quotation snapshot.\n2. Changes outside scope require a written amendment or revised quotation.\n3. Intellectual property in deliverables transfers to the Client upon full payment, unless otherwise agreed.\n4. Either party may terminate for material breach if not remedied within 14 days of written notice.\n5. Liability is limited to the contract value paid in the preceding 12 months, excluding fraud or wilful misconduct.\n6. This agreement is governed by the laws of England and Wales.'
      END,
      'governing_jurisdiction',
      CASE WHEN upper(c.currency_code) = 'GHS' THEN 'ghana' ELSE 'england_wales' END
    ),
  updated_at = now()
WHERE (
    c.quotation_id IS NOT NULL
    OR (
      c.quotation_snapshot_json IS NOT NULL
      AND c.quotation_snapshot_json <> 'null'::jsonb
    )
  )
  AND c.body_json->>'terms_and_conditions' =
    E'1. Scope is limited to the services and amounts stated in this agreement and any attached quotation snapshot.\n2. Changes outside scope require a written amendment or revised quotation.\n3. Intellectual property in deliverables transfers to the Client upon full payment, unless otherwise agreed.\n4. Either party may terminate for material breach if not remedied within 14 days of written notice.\n5. Liability is limited to the contract value paid in the preceding 12 months, excluding fraud or wilful misconduct.\n6. This agreement is governed by the laws of England and Wales unless a different jurisdiction is agreed in writing.';

-- Stamp jurisdiction on any remaining rows that still lack the field (custom wording untouched).
UPDATE public.contracts c
SET
  body_json =
    c.body_json
    || jsonb_build_object(
      'governing_jurisdiction',
      CASE WHEN upper(c.currency_code) = 'GHS' THEN 'ghana' ELSE 'england_wales' END
    ),
  updated_at = now()
WHERE coalesce(c.body_json->>'governing_jurisdiction', '') = ''
  AND c.body_json IS NOT NULL
  AND c.body_json <> '{}'::jsonb;
