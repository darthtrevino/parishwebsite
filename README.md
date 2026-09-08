# Saint Elizabeth Orthodox Church

The website for [Saint Elizabeth Orthodox Church](https://stelizabethorthodox.org), a parish of the
Orthodox Church in America in Poulsbo, Washington.

Built with [Eleventy](https://www.11ty.dev/). The output is plain static HTML with no JavaScript
framework, no database, and no monthly hosting bill.

## Quick start

```bash
task install
task serve      # http://localhost:8080, reloads as you edit
```

Other tasks:

```bash
task            # list every task
task lint       # formatting + TypeScript checks
task build      # build to ./_site
task format     # rewrite files to match the formatting rules
task check      # lint, then build (the full gate CI runs)
task clean      # remove ./_site
```

These wrap npm scripts, so `npm start`, `npm run build`, `npm run lint`, and friends work too if you
would rather not install [go-task](https://taskfile.dev).

Requires Node.js 22.6 or newer.

## Documentation

- **[docs/content-guide.md](docs/content-guide.md)** — how to edit pages, post news, and update the
  calendar. Start here if you are not a developer.
- **[docs/calendar-setup.md](docs/calendar-setup.md)** — how to connect the parish Google Calendar.
- **[docs/giving-setup.md](docs/giving-setup.md)** — how to switch on online tithing with Stripe.
- **[docs/deployment.md](docs/deployment.md)** — how to deploy and how to cut over from Squarespace.

## Layout

```
src/
  _data/           site.json, navigation.json, giving.json, calendar.ts
  _includes/       layouts and partials
  assets/          css and images (copied to /assets)
  static/          robots.txt and _redirects (copied to the site root)
  who-we-are/      Our Faith, Parish, Saint, Stories, Clergy, Location
  what-we-do/      Worship, Charity, Evangelization
  come-and-see/    Visiting, Learning, Becoming Orthodox
  resources/       Bookstore, Lending Library, Chant, Streaming, Dates
  news/            one Markdown file per post
  index.njk        homepage
  giving.njk       giving page (unpublished, see .eleventyignore)
eleventy.config.ts
```

Content lives in Markdown; structured data (service times, giving funds) lives in JSON under
`src/_data/`, so it can be edited without touching templates. The events calendar is fetched from
the parish Google Calendar at build time by `src/_data/calendar.ts`.

## Conventions

- All logic is TypeScript. `task lint` must pass.
- **No secrets in this repository.** Online giving uses Stripe Payment Links, which are public URLs.
  A Stripe secret key must never be committed; see `docs/giving-setup.md`.
- Old Squarespace URLs are preserved as 301 redirects in `src/static/_redirects`. Add an entry there
  whenever a page moves.
