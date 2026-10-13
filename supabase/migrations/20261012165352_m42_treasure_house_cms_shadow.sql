-- M42: Treasure House CMS shadow copy (development)
-- Recreates website CMS administration structure inside OkangGroup.
-- Synthetic data only. No production church records/credentials.
-- Does NOT connect to live Treasure House. Production HOLD.
-- Source inventory: treasure-house-app/app/(portal)/admin/website + lib/website-cms

-- Fixed IDs for reproducible UAT
-- Client:  c8a1b2d3-e4f5-4678-9abc-111111111101
-- Instance: c8a1b2d3-e4f5-4678-9abc-111111111102

INSERT INTO public.clients (
  id, client_code, legal_name, trading_name, status, primary_email, notes_internal
) VALUES (
  'c8a1b2d3-e4f5-4678-9abc-111111111101',
  'TH-SHADOW-DEV',
  'Treasure House Bible Church International',
  'Treasure House (CMS Shadow — Development)',
  'active',
  'th-shadow-dev@okangroup.test',
  'SHADOW CMS ONLY — synthetic website content. No membership/pastoral/finance data. Not connected to production.'
)
ON CONFLICT (id) DO UPDATE SET
  trading_name = EXCLUDED.trading_name,
  notes_internal = EXCLUDED.notes_internal,
  updated_at = now();

INSERT INTO public.cms_instances (
  id, client_id, slug, display_name, cms_kind, cms_config_type, management_mode, status, notes, brand_json
) VALUES (
  'c8a1b2d3-e4f5-4678-9abc-111111111102',
  'c8a1b2d3-e4f5-4678-9abc-111111111101',
  'treasure-house-shadow',
  'Treasure House Website CMS (Shadow)',
  'church_website',
  'custom',
  'okanggroup_managed',
  'active',
  'Shadow copy of TH website CMS admin. Staging connection deferred. C3-01 still required for live/staging Pilot 2.',
  '{"primary":"#0b1f3a","accent":"#c9a227","label":"Treasure House Shadow"}'::jsonb
)
ON CONFLICT (id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  notes = EXCLUDED.notes,
  brand_json = EXCLUDED.brand_json,
  updated_at = now();

INSERT INTO public.cms_connections (
  cms_instance_id, client_id, adapter_code, auth_method, status, notes, capability_json, integration_mode
) VALUES (
  'c8a1b2d3-e4f5-4678-9abc-111111111102',
  'c8a1b2d3-e4f5-4678-9abc-111111111101',
  'manual_only',
  'manual',
  'configured',
  'Shadow CMS is platform-hosted. External staging gateway deferred until isolated TH staging is authorised.',
  '{"edit":true,"preview":true,"draft":true,"submit":true,"publish":true,"rollback":true,"media":true,"external_live":false,"shadow":true}'::jsonb,
  'platform'
)
ON CONFLICT (cms_instance_id) DO UPDATE SET
  adapter_code = EXCLUDED.adapter_code,
  notes = EXCLUDED.notes,
  capability_json = EXCLUDED.capability_json,
  integration_mode = EXCLUDED.integration_mode,
  updated_at = now();

-- Registry modules (website CMS only — sensitive church ops excluded)
INSERT INTO public.cms_modules (
  cms_instance_id, client_id, module_code, module_name, description, sort_order, hosted_in, is_sensitive, status
) VALUES
  ('c8a1b2d3-e4f5-4678-9abc-111111111102','c8a1b2d3-e4f5-4678-9abc-111111111101','dashboard','CMS Dashboard','Website management overview',0,'platform_content',false,'active'),
  ('c8a1b2d3-e4f5-4678-9abc-111111111102','c8a1b2d3-e4f5-4678-9abc-111111111101','homepage','Homepage','Welcome, sections, Our Church, device layouts',10,'platform_content',false,'active'),
  ('c8a1b2d3-e4f5-4678-9abc-111111111102','c8a1b2d3-e4f5-4678-9abc-111111111101','quick_cards','Quick Cards','Homepage quick card names, icons, destinations',20,'platform_content',false,'active'),
  ('c8a1b2d3-e4f5-4678-9abc-111111111102','c8a1b2d3-e4f5-4678-9abc-111111111101','live_stream','Live Stream','Public live stream settings',30,'platform_content',false,'active'),
  ('c8a1b2d3-e4f5-4678-9abc-111111111102','c8a1b2d3-e4f5-4678-9abc-111111111101','mobile_designer','Mobile Designer','Per-device homepage layout overrides',40,'platform_content',false,'active'),
  ('c8a1b2d3-e4f5-4678-9abc-111111111102','c8a1b2d3-e4f5-4678-9abc-111111111101','hero','HERO Manager','Hero designs, panels, scheduling',50,'platform_content',false,'active'),
  ('c8a1b2d3-e4f5-4678-9abc-111111111102','c8a1b2d3-e4f5-4678-9abc-111111111101','collage','Collage Studio','Animated collage compositions',60,'platform_content',false,'active'),
  ('c8a1b2d3-e4f5-4678-9abc-111111111102','c8a1b2d3-e4f5-4678-9abc-111111111101','media','Media Library','Images/videos with categories (OkangGroup media bucket)',70,'platform_content',false,'active'),
  ('c8a1b2d3-e4f5-4678-9abc-111111111102','c8a1b2d3-e4f5-4678-9abc-111111111101','leadership','Leadership','Public leadership profiles + photos',80,'platform_content',false,'active'),
  ('c8a1b2d3-e4f5-4678-9abc-111111111102','c8a1b2d3-e4f5-4678-9abc-111111111101','ministries','Ministries','Ministry pages, featured images, galleries',90,'platform_content',false,'active'),
  ('c8a1b2d3-e4f5-4678-9abc-111111111102','c8a1b2d3-e4f5-4678-9abc-111111111101','sermons','Sermons','Public sermon catalogue (synthetic)',100,'platform_content',false,'active'),
  ('c8a1b2d3-e4f5-4678-9abc-111111111102','c8a1b2d3-e4f5-4678-9abc-111111111101','events','Events & Programmes','Public events/programmes schedule',110,'platform_content',false,'active'),
  ('c8a1b2d3-e4f5-4678-9abc-111111111102','c8a1b2d3-e4f5-4678-9abc-111111111101','pages','Website Pages','About, Ministries, Sermons, Events, Contact page copy',120,'platform_content',false,'active'),
  ('c8a1b2d3-e4f5-4678-9abc-111111111102','c8a1b2d3-e4f5-4678-9abc-111111111101','navigation','Navigation','Public menu links',130,'platform_content',false,'active'),
  ('c8a1b2d3-e4f5-4678-9abc-111111111102','c8a1b2d3-e4f5-4678-9abc-111111111101','settings','CMS Settings','Client-specific website settings',140,'platform_content',false,'active'),
  ('c8a1b2d3-e4f5-4678-9abc-111111111102','c8a1b2d3-e4f5-4678-9abc-111111111101','history','History & Rollback','Document revisions via OkangGroup workflow',150,'platform_content',false,'active')
ON CONFLICT (cms_instance_id, module_code) DO UPDATE SET
  module_name = EXCLUDED.module_name,
  description = EXCLUDED.description,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();

-- Explicitly register sensitive modules as NOT connected / withheld
INSERT INTO public.cms_modules (
  cms_instance_id, client_id, module_code, module_name, description, sort_order, hosted_in, is_sensitive, status
) VALUES
  ('c8a1b2d3-e4f5-4678-9abc-111111111102','c8a1b2d3-e4f5-4678-9abc-111111111101','membership','Membership (EXCLUDED)','Withheld — not part of website CMS shadow',900,'external_cms',true,'disabled'),
  ('c8a1b2d3-e4f5-4678-9abc-111111111102','c8a1b2d3-e4f5-4678-9abc-111111111101','pastoral','Pastoral (EXCLUDED)','Withheld — sensitive',910,'external_cms',true,'disabled'),
  ('c8a1b2d3-e4f5-4678-9abc-111111111102','c8a1b2d3-e4f5-4678-9abc-111111111101','prayer_requests','Prayer Requests (EXCLUDED)','Withheld — sensitive',920,'external_cms',true,'disabled'),
  ('c8a1b2d3-e4f5-4678-9abc-111111111102','c8a1b2d3-e4f5-4678-9abc-111111111101','giving','Giving / Finance (EXCLUDED)','Withheld — sensitive',930,'external_cms',true,'disabled')
ON CONFLICT (cms_instance_id, module_code) DO UPDATE SET
  status = 'disabled',
  is_sensitive = true,
  updated_at = now();

-- Custom module field definitions (shadow admin capabilities)
DELETE FROM public.cms_custom_records
WHERE cms_instance_id = 'c8a1b2d3-e4f5-4678-9abc-111111111102';
DELETE FROM public.cms_custom_module_defs
WHERE cms_instance_id = 'c8a1b2d3-e4f5-4678-9abc-111111111102';

INSERT INTO public.cms_custom_module_defs (
  cms_instance_id, client_id, module_code, module_name, description, fields_json, requires_approval, sort_order, status
) VALUES
(
  'c8a1b2d3-e4f5-4678-9abc-111111111102','c8a1b2d3-e4f5-4678-9abc-111111111101',
  'ministries','Ministries',
  'Shadow of website_ministries + gallery items',
  '[
    {"key":"slug","label":"Slug","type":"text","required":true},
    {"key":"summary","label":"Summary","type":"textarea","required":true},
    {"key":"body","label":"Body","type":"textarea","required":false},
    {"key":"image_url","label":"Featured image URL","type":"image","required":false},
    {"key":"image_alt","label":"Image alt","type":"text","required":false},
    {"key":"object_position","label":"Object position","type":"text","required":false,"placeholder":"center center"},
    {"key":"sort_order","label":"Sort order","type":"text","required":false},
    {"key":"gallery_notes","label":"Gallery notes (synthetic)","type":"textarea","required":false}
  ]'::jsonb, true, 10, 'active'
),
(
  'c8a1b2d3-e4f5-4678-9abc-111111111102','c8a1b2d3-e4f5-4678-9abc-111111111101',
  'leadership','Leadership',
  'Shadow of website_leaders',
  '[
    {"key":"slug","label":"Slug","type":"text","required":true},
    {"key":"role_title","label":"Role title","type":"text","required":true},
    {"key":"summary","label":"Summary","type":"textarea","required":false},
    {"key":"bio","label":"Bio","type":"textarea","required":false},
    {"key":"photo_url","label":"Photo URL","type":"image","required":false},
    {"key":"sort_order","label":"Sort order","type":"text","required":false}
  ]'::jsonb, true, 20, 'active'
),
(
  'c8a1b2d3-e4f5-4678-9abc-111111111102','c8a1b2d3-e4f5-4678-9abc-111111111101',
  'sermons','Sermons',
  'Public sermon catalogue (TH public /sermons; admin often via pages + media)',
  '[
    {"key":"speaker","label":"Speaker","type":"text","required":true},
    {"key":"date","label":"Date","type":"date","required":true},
    {"key":"series","label":"Series","type":"text","required":false},
    {"key":"summary","label":"Summary","type":"textarea","required":false},
    {"key":"media_url","label":"Media URL","type":"text","required":false},
    {"key":"thumbnail_url","label":"Thumbnail","type":"image","required":false}
  ]'::jsonb, true, 30, 'active'
),
(
  'c8a1b2d3-e4f5-4678-9abc-111111111102','c8a1b2d3-e4f5-4678-9abc-111111111101',
  'events','Events & Programmes',
  'Public events/programmes (TH calendar/events surface)',
  '[
    {"key":"starts_at","label":"Starts","type":"text","required":true,"placeholder":"2026-11-06T18:00:00Z"},
    {"key":"ends_at","label":"Ends","type":"text","required":false},
    {"key":"location","label":"Location","type":"text","required":false},
    {"key":"summary","label":"Summary","type":"textarea","required":true},
    {"key":"image_url","label":"Image","type":"image","required":false},
    {"key":"programme_type","label":"Type","type":"text","required":false,"placeholder":"event|programme"}
  ]'::jsonb, true, 40, 'active'
),
(
  'c8a1b2d3-e4f5-4678-9abc-111111111102','c8a1b2d3-e4f5-4678-9abc-111111111101',
  'hero','HERO Designs',
  'Shadow of website hero designs (panels simplified as JSON text)',
  '[
    {"key":"title","label":"Design title","type":"text","required":true},
    {"key":"is_active","label":"Active design","type":"text","required":false,"placeholder":"true|false"},
    {"key":"cta_label","label":"CTA label","type":"text","required":false},
    {"key":"cta_href","label":"CTA href","type":"text","required":false},
    {"key":"panels_json","label":"Panels JSON","type":"textarea","required":false,"help":"Synthetic panel list — not live TH media IDs"}
  ]'::jsonb, true, 50, 'active'
),
(
  'c8a1b2d3-e4f5-4678-9abc-111111111102','c8a1b2d3-e4f5-4678-9abc-111111111101',
  'collage','Collage Studio',
  'Shadow of collage compositions',
  '[
    {"key":"title","label":"Title","type":"text","required":true},
    {"key":"style","label":"Style","type":"text","required":false,"placeholder":"elegant_fade|moving_collage|photo_mosaic"},
    {"key":"mode","label":"Mode","type":"text","required":false,"placeholder":"animated|static"},
    {"key":"notes","label":"Notes","type":"textarea","required":false}
  ]'::jsonb, true, 60, 'active'
),
(
  'c8a1b2d3-e4f5-4678-9abc-111111111102','c8a1b2d3-e4f5-4678-9abc-111111111101',
  'quick_cards','Quick Cards',
  'Homepage quick cards',
  '[
    {"key":"href","label":"Href","type":"text","required":true},
    {"key":"label","label":"Label","type":"text","required":true},
    {"key":"detail","label":"Detail","type":"text","required":false},
    {"key":"icon","label":"Icon","type":"text","required":false},
    {"key":"visible","label":"Visible","type":"text","required":false,"placeholder":"true|false"},
    {"key":"audience","label":"Audience","type":"text","required":false,"placeholder":"everyone"},
    {"key":"sort_order","label":"Sort order","type":"text","required":false}
  ]'::jsonb, true, 70, 'active'
),
(
  'c8a1b2d3-e4f5-4678-9abc-111111111102','c8a1b2d3-e4f5-4678-9abc-111111111101',
  'pages','Website Pages',
  'Simple page documents (about, ministries index, sermons, events, contact)',
  '[
    {"key":"slug","label":"Page slug","type":"text","required":true},
    {"key":"heading","label":"Heading","type":"text","required":true},
    {"key":"body","label":"Body","type":"textarea","required":true},
    {"key":"seo_title","label":"SEO title","type":"text","required":false}
  ]'::jsonb, true, 80, 'active'
),
(
  'c8a1b2d3-e4f5-4678-9abc-111111111102','c8a1b2d3-e4f5-4678-9abc-111111111101',
  'navigation','Navigation',
  'Public menu links',
  '[
    {"key":"href","label":"Href","type":"text","required":true},
    {"key":"label","label":"Label","type":"text","required":true},
    {"key":"sort_order","label":"Sort order","type":"text","required":false},
    {"key":"visible","label":"Visible","type":"text","required":false,"placeholder":"true|false"}
  ]'::jsonb, true, 90, 'active'
),
(
  'c8a1b2d3-e4f5-4678-9abc-111111111102','c8a1b2d3-e4f5-4678-9abc-111111111101',
  'settings','CMS Settings',
  'Website settings document (non-sensitive)',
  '[
    {"key":"site_title","label":"Site title","type":"text","required":true},
    {"key":"tagline","label":"Tagline","type":"text","required":false},
    {"key":"contact_email","label":"Public contact email","type":"text","required":false},
    {"key":"address_line","label":"Address","type":"text","required":false},
    {"key":"maps_url","label":"Maps URL","type":"text","required":false}
  ]'::jsonb, true, 100, 'active'
),
(
  'c8a1b2d3-e4f5-4678-9abc-111111111102','c8a1b2d3-e4f5-4678-9abc-111111111101',
  'live_stream','Live Stream',
  'Public live stream configuration',
  '[
    {"key":"provider","label":"Provider","type":"text","required":false,"placeholder":"youtube"},
    {"key":"stream_url","label":"Stream URL","type":"text","required":false},
    {"key":"enabled","label":"Enabled","type":"text","required":false,"placeholder":"true|false"},
    {"key":"title","label":"Title","type":"text","required":false}
  ]'::jsonb, true, 110, 'active'
),
(
  'c8a1b2d3-e4f5-4678-9abc-111111111102','c8a1b2d3-e4f5-4678-9abc-111111111101',
  'homepage','Homepage Document',
  'Homepage v3 document fields (shadow; HERO panels managed separately)',
  '[
    {"key":"welcome_long","label":"Welcome","type":"textarea","required":true},
    {"key":"intro_heading","label":"Intro heading","type":"text","required":false},
    {"key":"ministries_heading","label":"Ministries heading","type":"text","required":false},
    {"key":"sermons_heading","label":"Sermons heading","type":"text","required":false},
    {"key":"events_heading","label":"Events heading","type":"text","required":false},
    {"key":"sections_json","label":"Section flags JSON","type":"textarea","required":false}
  ]'::jsonb, true, 5, 'active'
);

-- Synthetic records (no live church PII)
INSERT INTO public.cms_custom_records (
  cms_instance_id, client_id, module_def_id, title, data_json, status, created_by
)
SELECT
  d.cms_instance_id, d.client_id, d.id, v.title, v.data_json, 'draft',
  'a7bce15a-566a-43df-aa93-4f23da8bb35f'
FROM public.cms_custom_module_defs d
JOIN (
  VALUES
    ('ministries', 'Worship & Creative Arts (synthetic)', '{"slug":"worship","summary":"Synthetic worship ministry for shadow CMS UAT.","body":"Test body only.","image_alt":"Synthetic","object_position":"center center","sort_order":"10"}'::jsonb),
    ('ministries', 'Youth & Young Adults (synthetic)', '{"slug":"youth","summary":"Synthetic youth ministry.","body":"Test body only.","sort_order":"20"}'::jsonb),
    ('leadership', 'Lead Pastor (synthetic)', '{"slug":"lead-pastor","role_title":"Lead Pastor","summary":"Synthetic leadership profile for UAT.","bio":"Not a real person record.","sort_order":"10"}'::jsonb),
    ('sermons', 'Identity in Christ (synthetic)', '{"speaker":"Synthetic Speaker","date":"2026-10-01","series":"UAT Series","summary":"Synthetic sermon row."}'::jsonb),
    ('events', 'Glory Feast UAT (synthetic)', '{"starts_at":"2026-11-06T18:00:00Z","ends_at":"2026-11-08T21:00:00Z","location":"Synthetic venue","summary":"Synthetic programme for shadow CMS.","programme_type":"programme"}'::jsonb),
    ('hero', 'Default HERO (synthetic)', '{"title":"Shadow HERO A","is_active":"true","cta_label":"Plan a Visit","cta_href":"/contact","panels_json":"[]"}'::jsonb),
    ('collage', 'Welcome Collage (synthetic)', '{"title":"Shadow Collage","style":"elegant_fade","mode":"animated","notes":"Synthetic only"}'::jsonb),
    ('quick_cards', 'Sermons card', '{"href":"/sermons","label":"Sermons","detail":"Watch recent messages","icon":"sermons","visible":"true","audience":"everyone","sort_order":"10"}'::jsonb),
    ('quick_cards', 'Events card', '{"href":"/events","label":"Events","detail":"View upcoming programmes","icon":"events","visible":"true","audience":"everyone","sort_order":"20"}'::jsonb),
    ('pages', 'About page', '{"slug":"about","heading":"About Us","body":"Synthetic about page for Treasure House shadow CMS.","seo_title":"About | Shadow"}'::jsonb),
    ('pages', 'Contact page', '{"slug":"contact","heading":"Contact","body":"Synthetic contact copy.","seo_title":"Contact | Shadow"}'::jsonb),
    ('navigation', 'Home link', '{"href":"/","label":"Home","sort_order":"1","visible":"true"}'::jsonb),
    ('navigation', 'Ministries link', '{"href":"/ministries","label":"Ministries","sort_order":"2","visible":"true"}'::jsonb),
    ('settings', 'Site settings', '{"site_title":"Treasure House (Shadow)","tagline":"Development shadow CMS","contact_email":"shadow-uat@okangroup.test","address_line":"Synthetic address"}'::jsonb),
    ('live_stream', 'Sunday Live (synthetic)', '{"provider":"youtube","stream_url":"https://example.invalid/live","enabled":"false","title":"Synthetic stream"}'::jsonb),
    ('homepage', 'Homepage document', '{"welcome_long":"Synthetic welcome for OkangGroup shadow CMS UAT.","intro_heading":"Welcome","ministries_heading":"Ministries","sermons_heading":"Sermons","events_heading":"Events","sections_json":"{\"show_quick_cards\":true,\"show_ministries\":true,\"show_sermons\":true,\"show_events\":true}"}'::jsonb)
) AS v(module_code, title, data_json)
  ON v.module_code = d.module_code
WHERE d.cms_instance_id = 'c8a1b2d3-e4f5-4678-9abc-111111111102';

-- Owner full grant on shadow instance
INSERT INTO public.cms_instance_grants (
  cms_instance_id, client_id, profile_id,
  can_view, can_edit, can_submit, can_publish, can_upload_media, can_review, can_manage_content
)
SELECT
  'c8a1b2d3-e4f5-4678-9abc-111111111102',
  'c8a1b2d3-e4f5-4678-9abc-111111111101',
  'a7bce15a-566a-43df-aa93-4f23da8bb35f',
  true, true, true, true, true, true, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.cms_instance_grants g
  WHERE g.cms_instance_id = 'c8a1b2d3-e4f5-4678-9abc-111111111102'
    AND g.profile_id = 'a7bce15a-566a-43df-aa93-4f23da8bb35f'
    AND g.revoked_at IS NULL
);
