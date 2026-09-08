# Online Giving Setup

> **Status: the Giving page is not published.** The page is written and ready, but it is excluded
> from the build via `.eleventyignore` until the parish decides to launch online giving. Follow
> [Publishing the page](#publishing-the-page) at the end of this document to switch it on.

The Giving page is driven entirely by `src/_data/giving.json`. Until that file is filled in, the
page shows the fund descriptions with "Coming soon" buttons and a notice for administrators.

We use **Stripe Payment Links**. This approach was chosen deliberately:

- Payment Links are ordinary public URLs. **No API keys of any kind live in this repository.**
- Stripe hosts the checkout page, so card data never touches our site and PCI scope stays minimal.
- Recurring (monthly) giving, Apple Pay, Google Pay, ACH bank debit, and receipt emails are all
  handled by Stripe with no code.

> **Never commit a Stripe secret key** (`sk_live_…`, `sk_test_…`, or a restricted key). Payment Link
> URLs and publishable keys (`pk_…`) are safe to commit; secret keys are not.

## 1. Create the Stripe account

1. Create a Stripe account at <https://dashboard.stripe.com/register> using a parish email address,
   not a personal one.
2. Register as a **non-profit organization** and supply the parish EIN. Stripe offers discounted
   non-profit processing rates on request — ask support once the account is verified.
3. Connect the parish bank account under **Settings → Business → Bank accounts and currencies**.
4. Turn on **Settings → Payments → Payment methods**: cards, Apple Pay, Google Pay, and **ACH Direct
   Debit**. ACH costs far less than cards for large gifts and is worth promoting for regular tithes.

## 2. Create one Payment Link per fund

For each fund in `src/_data/giving.json`, go to **Product catalogue → Payment links → New**:

| Fund                      | Type               | Notes                                                |
| ------------------------- | ------------------ | ---------------------------------------------------- |
| Tithes & Offerings        | Recurring, monthly | Also create a one-time link if you want both options |
| Building & Beautification | One-time           |                                                      |
| Charity Fund              | One-time           |                                                      |
| Candles & Commemorations  | One-time           |                                                      |

Recommended settings for each link:

- **Pricing:** choose _Customers choose what to pay_, and set a preset/suggested amount.
- **After payment:** redirect to `https://stelizabethorthodox.org/giving/?thanks=1`.
- **Options → Collect customer name and address:** on. This is needed for year-end statements.
- **Options → Custom field:** add an optional text field labelled _Memo / intention_ so donors can
  note a commemoration or a specific need.
- **Options → Let customers cover the fees:** on. Most donors opt in, which recovers ~3% of gifts.

## 3. Wire the links into the site

Copy each Payment Link URL (they look like `https://buy.stripe.com/xxxxxxxx`) into the matching
`url` field, then flip `configured` to `true`:

```json
{
  "provider": "stripe",
  "configured": true,
  "funds": [
    {
      "id": "tithe",
      "title": "Tithes & Offerings",
      "url": "https://buy.stripe.com/aEUcQb0Xy1234567890"
    }
  ]
}
```

Commit and push. The deploy will publish the live buttons.

## 4. Reconciliation and statements

- **Fund tracking.** Each Payment Link is a distinct Stripe product, so the Stripe dashboard reports
  giving by fund without any extra work.
- **Payouts.** Stripe deposits to the parish bank account on a rolling schedule. The treasurer
  should reconcile the Stripe payout report against the bank statement monthly.
- **Year-end statements.** Export **Payments → Export** filtered by calendar year, grouped by
  customer email. Stripe does not issue contribution statements; the treasurer produces those.
- **Fees.** Standard Stripe pricing is 2.9% + $0.30 per card transaction and 0.8% (capped at $5.00)
  for ACH. Non-profit rates are lower once approved.

## Alternative and future options

- **Stripe Customer Portal.** If donors ask to manage their own recurring gifts, enable the portal
  at **Settings → Billing → Customer portal** and link to it from the Giving page. Still no server
  code.
- **Embedded checkout.** Keeping donors on our own domain requires a small serverless function that
  holds a secret key. If we go this route, the key belongs in the host's environment variables
  (Netlify/Cloudflare secrets), never in Git. Only take this step if the redirect to Stripe proves
  to be a real obstacle.
- **Tithe.ly / Givelify / Subsplash.** Church-specific platforms with pledge tracking and giving
  statements built in. They cost more per transaction but reduce treasurer workload. Worth
  revisiting if bookkeeping becomes burdensome.

## Cost comparison with Squarespace

Squarespace Business/Commerce plans run roughly $276–$420 per year, and Squarespace adds its own
transaction fee on commerce plans below the top tier. This site's hosting on Netlify or Cloudflare
Pages is **free** at parish traffic levels; the only remaining cost is domain renewal (~$20/year)
and Stripe's per-transaction processing, which any provider charges.

## Publishing the page

The Giving page is deliberately unpublished. When the parish is ready to launch, do all four steps:

1. **Include the page in the build.** Delete the `src/giving.njk` line from `.eleventyignore`.
2. **Add it to the menu.** Add this entry back to `src/_data/navigation.json`, after Resources:
   ```json
   { "title": "Giving", "url": "/giving/" }
   ```
3. **Restore the redirect.** In `src/static/_redirects`, point the old Squarespace store URL at the
   new page again:
   ```
   /store  /giving/  301
   ```
   (It currently points at `/what-we-do/charity/`.)
4. **Re-add the in-page links.** The footer (`src/_includes/partials/footer.njk`), the 404 page
   (`src/404.njk`), and the Charity page (`src/what-we-do/charity.md`) all had "Give online" links
   removed. Add them back where they help.

Then run `task build` and confirm `_site/giving/index.html` exists.
