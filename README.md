# OkangGroup

Official standalone company website for [okanggroup.com](https://okanggroup.com).

OkangGroup is a digital product and software group that builds practical websites, apps, systems, and platforms.

## Ownership / deployment structure

```text
OKANGGROUP
├── GitHub: adjeteyokangj-hash/okanggroup
├── Vercel: adjeteyokangj-hashs-projects / okanggroup
├── Cloudflare zone: okanggroup.com → Vercel DNS
└── Public: https://okanggroup.com + https://www.okanggroup.com
```

Treasure House (`treasure-house-bci` / `thbci.org`) stays separate.

## Live URLs

- Production alias: https://okanggroup-two.vercel.app
- Custom domains (after Cloudflare DNS): https://okanggroup.com · https://www.okanggroup.com
- Source: https://github.com/adjeteyokangj-hash/okanggroup

## Local development

```bash
npm install
npm run dev
```

## Production build

```bash
npm run build
```

Static output is written to `dist/`.

## Cloudflare DNS (points to Vercel)

In Cloudflare → `okanggroup.com` → DNS (proxy **DNS only** / grey cloud):

| Type | Name | Content |
|------|------|---------|
| CNAME | `@` | `8cb847e22ffcb799.vercel-dns-016.com` |
| CNAME | `www` | `8cb847e22ffcb799.vercel-dns-016.com` |

Fallback if CNAME flattening is unavailable for apex:

| Type | Name | Content |
|------|------|---------|
| A | `@` | `216.150.1.1` |
| A | `@` | `216.150.16.1` |
| CNAME | `www` | `8cb847e22ffcb799.vercel-dns-016.com` |

Then run:

```bash
vercel domains verify okanggroup.com --scope adjeteyokangj-hashs-projects
vercel domains verify www.okanggroup.com --scope adjeteyokangj-hashs-projects
```

## Notes

- This site is OkangGroup-branded only. It is not a Noble Express page.
- Client projects are labelled clearly as client-owned work.
- Contact phone/WhatsApp: 07404 865949 (+44 7404 865949). Official email pending (`@okanggroup.com`).
