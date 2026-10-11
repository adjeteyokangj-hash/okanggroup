const header = document.querySelector(".site-header");
const nav = document.querySelector("#primary-nav");
const menuToggle = document.querySelector(".menu-toggle");
const navLinks = [...document.querySelectorAll("#primary-nav a")];
const sections = [...document.querySelectorAll("main section[id]")];
const copyrightYear = document.querySelector("#copyright-year");

if (copyrightYear) {
  copyrightYear.textContent = String(new Date().getFullYear());
}

function setHeaderState() {
  if (!header) return;
  header.classList.toggle("is-scrolled", window.scrollY > 12);
}

function closeMenu() {
  if (!nav || !menuToggle) return;
  nav.classList.remove("is-open");
  menuToggle.setAttribute("aria-expanded", "false");
  menuToggle.setAttribute("aria-label", "Open menu");
}

function toggleMenu() {
  if (!nav || !menuToggle) return;
  const open = !nav.classList.contains("is-open");
  nav.classList.toggle("is-open", open);
  menuToggle.setAttribute("aria-expanded", String(open));
  menuToggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
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
    const href = link.getAttribute("href");
    link.classList.toggle("is-active", href === `#${current}`);
  }
}

menuToggle?.addEventListener("click", toggleMenu);

navLinks.forEach((link) => {
  link.addEventListener("click", closeMenu);
});

window.addEventListener("resize", () => {
  if (window.innerWidth > 900) closeMenu();
});

window.addEventListener("scroll", () => {
  setHeaderState();
  updateActiveNav();
}, { passive: true });

setHeaderState();
updateActiveNav();

const revealItems = document.querySelectorAll(".reveal");

if ("IntersectionObserver" in window) {
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      }
    },
    { threshold: 0.14, rootMargin: "0px 0px -8% 0px" }
  );

  revealItems.forEach((item) => observer.observe(item));
} else {
  revealItems.forEach((item) => item.classList.add("is-visible"));
}
