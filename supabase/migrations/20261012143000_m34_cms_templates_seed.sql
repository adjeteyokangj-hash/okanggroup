-- M34: Seed reusable website templates (no client identities or secrets).
-- Remote already has m33a–m33d schema/RPCs/publish jobs.

INSERT INTO public.cms_templates (code, name, category, description, body_json, is_system)
VALUES
(
  'corporate-home',
  'Corporate website',
  'corporate',
  'Professional company home page',
  '{
    "version": 1,
    "brand": {"siteName": "Website", "primaryColor": "#0a2540", "accentColor": "#2b7de9", "backgroundColor": "#f5f7fb"},
    "sections": [
      {"id": "t1", "type": "hero", "heading": "Trusted business partners", "body": "Delivering clarity and results for organisations that lead.", "buttonLabel": "Talk to us", "buttonHref": "#contact"},
      {"id": "t2", "type": "services", "heading": "What we do", "body": "Strategy\nDelivery\nSupport"},
      {"id": "t3", "type": "cta", "heading": "Ready to begin?", "body": "Speak with our team.", "buttonLabel": "Contact", "buttonHref": "#contact"},
      {"id": "t4", "type": "footer", "heading": "Footer", "body": "© Your organisation"}
    ]
  }'::jsonb,
  true
),
(
  'professional-services',
  'Professional services',
  'services',
  'Consultancies and advisory firms',
  '{
    "version": 1,
    "brand": {"siteName": "Website", "primaryColor": "#12304a", "accentColor": "#e67e22", "backgroundColor": "#f8f6f2"},
    "sections": [
      {"id": "p1", "type": "hero", "heading": "Expert advice, practical outcomes", "body": "Specialist support for growing organisations.", "buttonLabel": "Book a consultation", "buttonHref": "#contact"},
      {"id": "p2", "type": "team", "heading": "Our specialists", "body": "Partner profiles go here."},
      {"id": "p3", "type": "testimonials", "heading": "Client feedback", "body": "“Clear, reliable and professional.” — Client"},
      {"id": "p4", "type": "form", "heading": "Request a call", "body": "Name, email, message", "buttonLabel": "Send", "buttonHref": "#"}
    ]
  }'::jsonb,
  true
),
(
  'church-home',
  'Church website',
  'church',
  'Welcome, ministries and gatherings',
  '{
    "version": 1,
    "brand": {"siteName": "Website", "primaryColor": "#2c3e50", "accentColor": "#c9a227", "backgroundColor": "#faf8f4"},
    "sections": [
      {"id": "c1", "type": "hero", "heading": "You are welcome here", "body": "Join us for worship, community and service.", "buttonLabel": "Plan your visit", "buttonHref": "#visit"},
      {"id": "c2", "type": "services", "heading": "Ministries", "body": "Children\nYouth\nOutreach"},
      {"id": "c3", "type": "faq", "heading": "Visiting for the first time?", "body": "Q: What should I wear?\nA: Come as you are."},
      {"id": "c4", "type": "footer", "heading": "Find us", "body": "Service times · Directions · Contact"}
    ]
  }'::jsonb,
  true
),
(
  'education-home',
  'Educational institution',
  'education',
  'Schools and training centres',
  '{
    "version": 1,
    "brand": {"siteName": "Website", "primaryColor": "#1b4f72", "accentColor": "#27ae60", "backgroundColor": "#f4f9fc"},
    "sections": [
      {"id": "e1", "type": "hero", "heading": "Learn with confidence", "body": "Programmes designed for tomorrow’s leaders.", "buttonLabel": "Explore courses", "buttonHref": "#courses"},
      {"id": "e2", "type": "cards", "heading": "Study pathways", "body": "Foundation\nDiploma\nProfessional"},
      {"id": "e3", "type": "banner", "heading": "Admissions open", "body": "Apply for the next intake."}
    ]
  }'::jsonb,
  true
),
(
  'restaurant-home',
  'Restaurant',
  'hospitality',
  'Menus and reservations preview',
  '{
    "version": 1,
    "brand": {"siteName": "Website", "primaryColor": "#3d1f14", "accentColor": "#d35400", "backgroundColor": "#fff8f2"},
    "sections": [
      {"id": "r1", "type": "hero", "heading": "Seasonal flavours", "body": "Fresh ingredients, warm hospitality.", "buttonLabel": "Reserve a table", "buttonHref": "#book"},
      {"id": "r2", "type": "gallery", "heading": "From the kitchen", "body": "Feature dishes and atmosphere.", "imageAlt": "Restaurant"},
      {"id": "r3", "type": "pricing", "heading": "Sample menu", "body": "Starter · Main · Dessert"}
    ]
  }'::jsonb,
  true
),
(
  'property-home',
  'Property website',
  'property',
  'Listings and enquiry focus',
  '{
    "version": 1,
    "brand": {"siteName": "Website", "primaryColor": "#1a3a4a", "accentColor": "#16a085", "backgroundColor": "#f3f7f8"},
    "sections": [
      {"id": "pr1", "type": "hero", "heading": "Find your next place", "body": "Homes and commercial spaces carefully selected.", "buttonLabel": "View listings", "buttonHref": "#listings"},
      {"id": "pr2", "type": "cards", "heading": "Featured properties", "body": "City centre loft\nFamily home\nOffice suite"},
      {"id": "pr3", "type": "form", "heading": "Request a viewing", "body": "Name, phone, preferred date", "buttonLabel": "Send enquiry", "buttonHref": "#"}
    ]
  }'::jsonb,
  true
),
(
  'portfolio-home',
  'Portfolio',
  'portfolio',
  'Creative and professional showcase',
  '{
    "version": 1,
    "brand": {"siteName": "Website", "primaryColor": "#111827", "accentColor": "#f59e0b", "backgroundColor": "#f9fafb"},
    "sections": [
      {"id": "po1", "type": "hero", "heading": "Selected work", "body": "Projects that show craft and clarity.", "buttonLabel": "View work", "buttonHref": "#work"},
      {"id": "po2", "type": "gallery", "heading": "Projects", "body": "Case studies and images.", "imageAlt": "Portfolio"},
      {"id": "po3", "type": "cta", "heading": "Start a project", "body": "Tell us about your brief.", "buttonLabel": "Get in touch", "buttonHref": "#contact"}
    ]
  }'::jsonb,
  true
),
(
  'landing-page',
  'Landing page',
  'landing',
  'Focused conversion page',
  '{
    "version": 1,
    "brand": {"siteName": "Website", "primaryColor": "#0f172a", "accentColor": "#38bdf8", "backgroundColor": "#f8fafc"},
    "sections": [
      {"id": "l1", "type": "hero", "heading": "One clear offer", "body": "Explain the value in a single sentence.", "buttonLabel": "Get started", "buttonHref": "#signup"},
      {"id": "l2", "type": "faq", "heading": "Common questions", "body": "Q: How does it work?\nA: A short answer here."},
      {"id": "l3", "type": "form", "heading": "Join the list", "body": "Email address", "buttonLabel": "Subscribe", "buttonHref": "#"}
    ]
  }'::jsonb,
  true
)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  category = EXCLUDED.category,
  description = EXCLUDED.description,
  body_json = EXCLUDED.body_json,
  updated_at = now();

-- Ensure Test Client hybrid has at least one custom module definition for demos
INSERT INTO public.cms_custom_module_defs (
  cms_instance_id, client_id, module_code, module_name, description, fields_json, sort_order, status
)
SELECT
  i.id,
  i.client_id,
  'sermons',
  'Sermons',
  'Custom module example (church-style content — not a page editor)',
  '[
    {"key":"speaker","label":"Speaker","type":"text","required":true},
    {"key":"date","label":"Date","type":"date","required":true},
    {"key":"summary","label":"Summary","type":"textarea","required":false},
    {"key":"series","label":"Series","type":"text","required":false}
  ]'::jsonb,
  10,
  'active'
FROM public.cms_instances i
WHERE i.id = 'f5dfa20e-3c7a-4b89-b77d-ac53339a1edf'
ON CONFLICT (cms_instance_id, module_code) DO NOTHING;

INSERT INTO public.cms_custom_module_defs (
  cms_instance_id, client_id, module_code, module_name, description, fields_json, sort_order, status
)
SELECT
  i.id,
  i.client_id,
  'announcements',
  'Announcements',
  'Operational announcements module',
  '[
    {"key":"priority","label":"Priority","type":"text","required":false},
    {"key":"body","label":"Body","type":"textarea","required":true},
    {"key":"expires","label":"Expires","type":"date","required":false}
  ]'::jsonb,
  20,
  'active'
FROM public.cms_instances i
WHERE i.id = 'f5dfa20e-3c7a-4b89-b77d-ac53339a1edf'
ON CONFLICT (cms_instance_id, module_code) DO NOTHING;
