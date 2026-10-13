import cmsBundle from '../content/cms/current.json';

const SUPABASE_URL = (
  import.meta.env.VITE_SUPABASE_URL || 'https://prbgsnxpwyepdggdysnt.supabase.co'
).replace(/\/$/, '');
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
const CLIENT_PORTAL_URL = import.meta.env.VITE_CLIENT_PORTAL_URL || '/admin/login';

const header = document.querySelector('.site-header');
const nav = document.querySelector('#primary-nav');
const menuToggle = document.querySelector('.menu-toggle');
const navLinks = [...document.querySelectorAll('#primary-nav a')];
const sections = [...document.querySelectorAll('main section[id]')];
const copyrightYear = document.querySelector('#copyright-year');
const enquiryForm = document.querySelector('#enquiry-form');
const enquiryStatus = document.querySelector('#enquiry-status');
const enquirySubmit = document.querySelector('#enquiry-submit');

if (copyrightYear) {
  copyrightYear.textContent = String(new Date().getFullYear());
}

document.querySelectorAll('a[href="/admin/login"]').forEach((link) => {
  if (CLIENT_PORTAL_URL && CLIENT_PORTAL_URL !== '/admin/login') {
    link.setAttribute('href', CLIENT_PORTAL_URL);
  }
});

function applyCmsBundle(bundle) {
  if (!bundle || !Array.isArray(bundle.pages) || bundle.pages.length === 0) return;

  for (const page of bundle.pages) {
    const slug = String(page.slug || '').replace(/^\//, '');
    if (!slug) continue;
    const root = document.querySelector(`[data-cms-page="${slug}"]`);
    if (!root) continue;

    const fields = page.content || page.fields || {};
    const sections = Array.isArray(page.sections) ? page.sections : [];

    for (const [key, value] of Object.entries(fields)) {
      if (typeof value !== 'string' || !value.trim()) continue;
      const el = root.querySelector(`[data-cms-field="${key}"]`);
      if (el) el.textContent = value;
    }

    for (const section of sections) {
      const key = section.section_key || section.key;
      const content = section.content_json || section.content || {};
      if (!key) continue;
      for (const [field, value] of Object.entries(content)) {
        if (typeof value !== 'string' || !value.trim()) continue;
        const el = root.querySelector(`[data-cms-field="${field}"]`);
        if (el) el.textContent = value;
      }
    }

    if (page.seo?.title && slug === 'home') {
      document.title = page.seo.title;
    }
    if (page.seo?.description && slug === 'home') {
      const meta = document.querySelector('meta[name="description"]');
      if (meta) meta.setAttribute('content', page.seo.description);
    }
  }
}

applyCmsBundle(cmsBundle);

function setHeaderState() {
  if (!header) return;
  header.classList.toggle('is-scrolled', window.scrollY > 12);
}

function closeMenu() {
  if (!nav || !menuToggle) return;
  nav.classList.remove('is-open');
  menuToggle.setAttribute('aria-expanded', 'false');
  menuToggle.setAttribute('aria-label', 'Open menu');
}

function toggleMenu() {
  if (!nav || !menuToggle) return;
  const open = !nav.classList.contains('is-open');
  nav.classList.toggle('is-open', open);
  menuToggle.setAttribute('aria-expanded', String(open));
  menuToggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
}

function updateActiveNav() {
  const offset = window.scrollY + 120;
  let current = sections[0]?.id;

  for (const section of sections) {
    if (section.offsetTop <= offset) {
      current = section.id;
    }
  }

  for (const link of navLinks) {
    const href = link.getAttribute('href');
    if (!href?.startsWith('#')) {
      link.classList.remove('is-active');
      continue;
    }
    link.classList.toggle('is-active', href === `#${current}`);
  }
}

menuToggle?.addEventListener('click', toggleMenu);

navLinks.forEach((link) => {
  link.addEventListener('click', () => {
    if (link.getAttribute('href')?.startsWith('#')) closeMenu();
  });
});

window.addEventListener('resize', () => {
  if (window.innerWidth > 900) closeMenu();
});

window.addEventListener(
  'scroll',
  () => {
    setHeaderState();
    updateActiveNav();
  },
  { passive: true },
);

setHeaderState();
updateActiveNav();

const revealItems = document.querySelectorAll('.reveal');

if ('IntersectionObserver' in window) {
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      }
    },
    { threshold: 0.14, rootMargin: '0px 0px -8% 0px' },
  );

  revealItems.forEach((item) => observer.observe(item));
} else {
  revealItems.forEach((item) => item.classList.add('is-visible'));
}

function setEnquiryStatus(message, kind) {
  if (!enquiryStatus) return;
  enquiryStatus.textContent = message;
  enquiryStatus.classList.remove('is-success', 'is-error');
  if (kind) enquiryStatus.classList.add(kind);
}

async function submitWebsiteEnquiry(payload) {
  if (!SUPABASE_ANON_KEY) {
    throw new Error(
      'Enquiry form is not configured yet (missing publishable API key). Please call or WhatsApp OkangGroup.',
    );
  }

  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/submit_website_enquiry`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify({
      p_organisation_name: payload.organisation_name,
      p_contact_name: payload.contact_name,
      p_contact_email: payload.contact_email,
      p_contact_phone: payload.contact_phone || null,
      p_summary: payload.summary,
      p_enquiry_type: payload.enquiry_type,
    }),
  });

  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }

  if (!res.ok) {
    const msg =
      data?.message ||
      data?.error_description ||
      data?.hint ||
      (typeof data === 'string' ? data : null) ||
      text ||
      `Request failed (${res.status})`;
    throw new Error(msg);
  }

  return data;
}

enquiryForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  if (!(form instanceof HTMLFormElement)) return;

  const data = new FormData(form);
  const payload = {
    organisation_name: String(data.get('organisation_name') || '').trim(),
    contact_name: String(data.get('contact_name') || '').trim(),
    contact_email: String(data.get('contact_email') || '').trim(),
    contact_phone: String(data.get('contact_phone') || '').trim(),
    summary: String(data.get('summary') || '').trim(),
    enquiry_type: String(data.get('enquiry_type') || 'other').trim(),
  };

  if (
    !payload.organisation_name ||
    !payload.contact_name ||
    !payload.contact_email ||
    !payload.summary
  ) {
    setEnquiryStatus('Please complete all required fields.', 'is-error');
    return;
  }

  enquirySubmit?.setAttribute('disabled', 'true');
  setEnquiryStatus('Sending enquiry…', null);

  try {
    const result = await submitWebsiteEnquiry(payload);
    const number = result?.enquiry_number ? ` Reference: ${result.enquiry_number}.` : '';
    setEnquiryStatus(
      `Thank you. Your enquiry has been received.${number} Our team will follow up.`,
      'is-success',
    );
    form.reset();
  } catch (err) {
    setEnquiryStatus(
      err instanceof Error ? err.message : 'Unable to send enquiry. Please try again or call us.',
      'is-error',
    );
  } finally {
    enquirySubmit?.removeAttribute('disabled');
  }
});
