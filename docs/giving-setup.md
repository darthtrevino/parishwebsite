# Online Giving Setup

> **Status: preview only.** The Giving page is built and reachable at `/giving/`, but it is kept out
> of the main navigation and **takes no payments**. It currently renders an interactive _mock_ of
> the checkout so the parish council can review the donor experience before committing to a
> provider. Follow [Publishing the page](#publishing-the-page) to launch it for real.

The Giving page is driven entirely by `src/_data/giving.json`, which supports three states:

| `configured` | `demo.enabled` | What the page shows                                 |
| ------------ | -------------- | --------------------------------------------------- |
| `true`       | ignored        | Real Stripe Payment Link buttons, one per fund      |
| `false`      | `true`         | The interactive mock checkout (**current setting**) |
| `false`      | `false`        | Fund descriptions and an administrator notice       |

## The mock checkout

The mock lives in `src/scripts/giving.ts` and is compiled to `_site/assets/js/giving.js` by
`npm run build:scripts` (wired into `task build`). It exists to answer design questions — how many
funds, what suggested amounts, whether to offer fee coverage — without setting up billing first.

What is real:

- The card field is a genuine **Stripe.js v3 card Element**, served from `js.stripe.com` and
  rendered inside Stripe's own iframe, so card numbers never touch this site.
- Card validation (number, expiry, CVC, postal code) is Stripe's, not ours.
- Amount selection, fund switching, monthly-vs-one-time rules, and the fee gross-up are real logic.

What is **not** real:

- **No payment is taken and no card is ever submitted.** The script deliberately never calls
  `stripe.createPaymentMethod()`; on submit it waits and then renders a mock receipt.
- The `demo.publishableKey` in `giving.json` is Stripe's sample **test** key from their public
  documentation, not a parish key. Publishable keys are designed to be public and cannot move money.

To test the flow, use Stripe's test card `4242 4242 4242 4242` with any future expiry and any CVC.

To hide the mock, set `demo.enabled` to `false` in `src/_data/giving.json`.

### Why a static site cannot take real payments on its own

Elements can collect and tokenize a card in the browser, but _charging_ it requires creating a
PaymentIntent server-side with the parish's **secret** key. A static site has no server, which is
exactly why the recommendation below is Payment Links: Stripe hosts the part that needs the secret.

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

1. **Turn off the mock.** In `src/_data/giving.json`, set `demo.enabled` to `false` and `configured`
   to `true`. The page then renders the real Payment Link buttons instead.
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

Then run `task build` and confirm `_site/giving/index.html` shows the live buttons rather than the
preview notice.
