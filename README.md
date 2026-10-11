# OkangGroup

Official standalone company website for [okanggroup.com](https://okanggroup.com).

OkangGroup is a digital product and software group that builds practical websites, apps, systems, and platforms.

## Live URLs

- Production (Vercel): https://okanggroup.vercel.app
- Custom domain: https://okanggroup.com (after Cloudflare DNS is pointed at GitHub Pages)
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

## Deploy notes

GitHub Pages serves the custom domain from the `gh-pages` branch. After building locally:

1. Publish the contents of `dist/` (including `CNAME`) to the `gh-pages` branch.
2. In Cloudflare DNS for `okanggroup.com`, add:

| Type | Name | Content | Proxy |
|------|------|---------|-------|
| A | `@` | `185.199.108.153` | DNS only |
| A | `@` | `185.199.109.153` | DNS only |
| A | `@` | `185.199.110.153` | DNS only |
| A | `@` | `185.199.111.153` | DNS only |
| CNAME | `www` | `adjeteyokangj-hash.github.io` | DNS only |

3. In the GitHub repo → Settings → Pages, confirm the custom domain is `okanggroup.com` and enable HTTPS once DNS has verified.

## Notes

- This site is OkangGroup-branded only. It is not a Noble Express page.
- Client projects are labelled clearly as client-owned work.
- Contact details are intentionally omitted until official OkangGroup channels are confirmed.
