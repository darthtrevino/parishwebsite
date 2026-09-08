# Deploying

The site is a folder of static HTML. Any static host will serve it. Two good free options are below.

## Option A — Netlify (recommended)

Netlify reads `netlify.toml` in this repository, so there is almost nothing to configure.

1. Sign in at <https://app.netlify.com> with the parish GitHub account.
2. **Add new site → Import an existing project** and choose this repository.
3. Netlify will pre-fill the build command (`npm run build`) and publish directory (`_site`) from
   `netlify.toml`. Accept and deploy.
4. Every push to `main` redeploys. Every pull request gets its own preview URL.

Redirects from the old Squarespace URLs are handled by `src/static/_redirects`, which Eleventy copies
to the root of the build output.

## Option B — Cloudflare Pages

1. Sign in at <https://dash.cloudflare.com> → **Workers & Pages → Create → Pages → Connect to Git**.
2. Build command: `npm run build`. Build output directory: `_site`.
3. Environment variable: `NODE_VERSION` = `22`.

Cloudflare Pages reads the same `_redirects` file format, so redirects work unchanged. Cloudflare
also gives us free DNS, which is convenient if we move the domain there.

## Cutting over from Squarespace

Do these in order, and do not cancel Squarespace until step 6 has been verified.

1. **Deploy first.** Get the new site live on its temporary host URL (e.g.
   `stelizabeth.netlify.app`) and review every page.
2. **Check the redirects.** Visit the temporary URL with old paths appended — `/our-parish`,
   `/worship-1`, `/upcoming-dates` — and confirm each lands on the new equivalent. See
   `src/static/_redirects`.
3. **Lower the DNS TTL.** In whichever service manages `stelizabethorthodox.org` DNS, set the TTL on
   the existing records to 300 seconds and wait a day. This makes the cutover fast and reversible.
4. **Unlock and transfer the domain if needed.** If the domain is registered *through* Squarespace,
   transfer it to a standalone registrar (Cloudflare Registrar and Porkbun are both at-cost) before
   cancelling the subscription, or you risk losing it. Transfers take 5–7 days — start early.
5. **Point DNS at the new host.** Add the CNAME/A records the host gives you, and add the custom
   domain in the host's dashboard so it issues a TLS certificate.
6. **Verify.** Confirm `https://stelizabethorthodox.org` and `https://www.stelizabethorthodox.org`
   both load the new site over HTTPS, that the certificate is valid, and that the old paths redirect.
7. **Submit the sitemap.** Add the site to [Google Search Console](https://search.google.com/search-console)
   and submit `https://stelizabethorthodox.org/sitemap.xml`.
8. **Cancel Squarespace** once everything above is confirmed, and only after exporting anything not
   yet migrated (images, audio recordings, past newsletters, the news archive).

## Content still to export from Squarespace

Before cancelling, download from the old site:

- All photographs and iconography images
- The liturgical chant audio recordings
- The parishioner video interviews (if not already on YouTube)
- The full news archive (Squarespace can export a WordPress-format XML file that can be converted to
  Markdown files under `src/news/`)
- Past newsletter PDFs and the newsletter mailing list

## Estimated running costs

| Item | Squarespace today | This site |
| --- | --- | --- |
| Hosting | ~$276–$420/year | $0 (Netlify or Cloudflare Pages free tier) |
| Domain | included or ~$20/year | ~$10–$20/year at an at-cost registrar |
| Payment processing | Stripe fee + Squarespace commerce fee | Stripe fee only |
| Email newsletter | Squarespace Campaigns add-on | Buttondown or Mailchimp free tier |
