# Saint Elizabeth Orthodox Church

The website for [Saint Elizabeth Orthodox Church](https://stelizabethorthodox.org), a parish of the
Orthodox Church in America in Poulsbo, Washington.

Built with [Eleventy](https://www.11ty.dev/). The output is plain static HTML with no JavaScript
framework, no database, and no monthly hosting bill.

## Quick start

```bash
npm install
npm start        # http://localhost:8080, reloads as you edit
```

Other commands:

```bash
npm run build      # build to ./_site
npm run typecheck  # type-check the Eleventy config
npm run clean      # remove ./_site
```

Requires Node.js 22.6 or newer.

## Documentation

- **[docs/content-guide.md](docs/content-guide.md)** — how to edit pages, post news, and update the
  calendar. Start here if you are not a developer.
- **[docs/giving-setup.md](docs/giving-setup.md)** — how to switch on online tithing with Stripe.
- **[docs/deployment.md](docs/deployment.md)** — how to deploy and how to cut over from Squarespace.

## Layout

```
src/
  _data/           site.json, navigation.json, feasts.json, giving.json
  _includes/       layouts and partials
  assets/          css and images (copied to /assets)
  static/          robots.txt and _redirects (copied to the site root)
  who-we-are/      Our Faith, Parish, Saint, Stories, Clergy, Location
  what-we-do/      Worship, Charity, Evangelization
  come-and-see/    Visiting, Learning, Becoming Orthodox
  resources/       Bookstore, Lending Library, Chant, Streaming, Dates
  news/            one Markdown file per post
  index.njk        homepage
  giving.njk       giving page
eleventy.config.ts
```

Content lives in Markdown; structured data (service times, feast dates, giving funds) lives in JSON
under `src/_data/` so it can be edited without touching templates.

## Conventions

- All logic is TypeScript. `npm run typecheck` must pass.
- **No secrets in this repository.** Online giving uses Stripe Payment Links, which are public URLs.
  A Stripe secret key must never be committed; see `docs/giving-setup.md`.
- Old Squarespace URLs are preserved as 301 redirects in `src/static/_redirects`. Add an entry there
  whenever a page moves.
