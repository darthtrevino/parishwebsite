# Fonts and images

## Where they came from

The visual design of this site is modelled on the parish's previous Squarespace site. The
photographs are the parish's own, downloaded from the Squarespace CDN at full resolution and
re-encoded for the web.

## Fonts: why we are not using the originals

The Squarespace site used two typefaces:

| Role                        | Original           | What we use here |
| --------------------------- | ------------------ | ---------------- |
| Headings and body copy      | Adobe Garamond Pro | EB Garamond      |
| Navigation and small labels | Proxima Nova       | Montserrat       |

Both originals are **commercial Adobe Fonts (Typekit) families**. They were served to the old site
through Squarespace's own Adobe Fonts subscription, not through a licence the parish owns. That
means:

- The fonts stop rendering as soon as the Squarespace account is cancelled.
- Self-hosting the font files would violate the Adobe Fonts licence.

So we self-host the closest open-licence (SIL OFL) substitutes instead. EB Garamond descends from
the same Claude Garamond originals as Adobe Garamond Pro, and Montserrat is a widely used stand-in
for Proxima Nova, especially at the uppercase, letter-spaced sizes this design uses for navigation.

The font files live in `src/assets/fonts/` and are declared in `src/assets/css/fonts.css`.

## Restoring the original fonts later

If the parish buys its own Adobe Fonts plan, no CSS changes are needed. The font stacks in
`src/assets/css/style.css` already list the original family names first:

```css
--serif: "adobe-garamond-pro", "EB Garamond", "Adobe Garamond Pro", Garamond, Georgia, serif;
--sans: "proxima-nova", "Montserrat", -apple-system, ...;
```

Add the Adobe Fonts kit `<script>` (or stylesheet `<link>`) to `src/_includes/layouts/base.njk` and
the browser will prefer the originals automatically, falling back to the self-hosted families if the
kit fails to load.

## Adding or replacing images

Optimised photographs live in `src/assets/img/photos/`. Keep them under about 2000px wide and
re-encode before committing — the originals downloaded from Squarespace totalled 24 MB and were
reduced to under 4 MB with no visible loss:

```js
// one-off, using the sharp that ships with @11ty/eleventy-img
sharp(input).resize({ width: 2000, withoutEnlargement: true }).jpeg({ quality: 82, mozjpeg: true });
```

Use JPEG for photographs and PNG only where transparency is required (icons, logos, the favicon).

## Wiring an image into a page

Every page shows a full-width banner behind its title. Set it in front matter:

```yaml
---
banner: /assets/img/photos/banner-our-saint.jpg
title: Our Saint
---
```

Section landing pages take their banner from `src/_data/navigation.json`, and each content folder
has a default in its directory data file (for example `src/who-we-are/who-we-are.json`). A page with
no `banner` falls back to the church interior photograph.

For images inside the page body, use `class="portrait"` to float a portrait alongside the text, or a
`<figure>` with a `<figcaption>` for a captioned image.
