# Online Giving Setup

> **Status: preview only.** The Giving page is built and reachable at `/giving/`, but it is kept out
> of the main navigation and **takes no payments**. It currently renders an interactive _mock_ of
> the checkout so the parish council can review the donor experience before committing to a
> provider. Follow [Publishing the page](#publishing-the-page) to launch it for real — but read
> [Known gaps](#known-gaps) first, because the monthly tithe flow shown in the mock is not something
> Stripe Payment Links can do today.

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

A **provider bar** at the top of the page switches between Stripe, Square, Donorbox, and Zelle. It
changes both the specification panel and the donor experience below it, so the fee figures, the
payment step, and the receipt all update to match the provider being considered. The selection is
reflected in the URL (`/giving/?provider=square`), which makes it linkable in a council email.

What is real:

- The card field on the **Stripe** panel is a genuine **Stripe.js v3 card Element**, served from
  `js.stripe.com` and rendered inside Stripe's own iframe, so card numbers never touch this site.
- Card validation (number, expiry, CVC, postal code) is Stripe's, not ours.
- Amount selection, fund switching, monthly-vs-one-time rules, and the per-provider fee gross-up are
  real logic, computed from the rates in `src/_data/giving.json`.

What is **not** real:

- **No payment is taken and no card is ever submitted.** The script deliberately never calls
  `stripe.createPaymentMethod()`; on submit it waits and then renders a mock receipt.
- The Square and Donorbox panels are **static representations**, not live embeds. Both would need
  credentials tied to a real account, and a live Donorbox iframe in a public preview would let a
  reviewer accidentally donate real money to someone else's campaign.
- The `demo.publishableKey` in `giving.json` is Stripe's sample **test** key from their public
  documentation, not a parish key. Publishable keys are designed to be public and cannot move money.

To test the flow, use Stripe's test card `4242 4242 4242 4242` with any future expiry and any CVC.

To hide the mock, set `demo.enabled` to `false` in `src/_data/giving.json`. Provider rates,
specifications, and caveats all live in the `providers` array in the same file.

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

## Known gaps

> **Cursory analysis, September 2026.** Verified against vendor documentation, not against a live
> account. Re-check before the parish commits money or signs up — payment providers change pricing
> and features frequently.

### Donor-chosen amount + monthly is not supported by Stripe Payment Links

This is the significant one for tithing. Stripe's pay-what-you-want pricing
([docs](https://docs.stripe.com/payments/checkout/pay-what-you-want)) states plainly that such
prices **"don't support recurring payments."** The Dashboard enforces it too: you must pick
_One-off_ before _Customer chooses price_ becomes available.

So a Payment Link can offer an open amount, or a monthly amount, but not both at once. It cannot do
"give 608 dollars and 33 cents every month," which is exactly what a parishioner tithing a
proportion of income needs. The mock at `/giving/` currently offers that unsupported combination on
Tithes & Offerings, so the flow it shows is not yet buildable with Payment Links alone.

Three ways around it, cheapest-to-build first:

1. **Fixed monthly tiers.** Create recurring prices at $50 / $100 / $250 / $500. No code. Poor fit
   for proportional giving, and awkward to change when income changes.
2. **Unit price with adjustable quantity.** Create a one-dollar-per-month recurring price and enable
   _Let customers adjust quantity_. A donor giving 608 dollars a month sets the quantity to 608. No
   code, arbitrary amounts, one-dollar granularity. Raise the quantity maximum, which defaults
   to 99. The checkout reads as "608 × $1.00/month", so the page needs a line explaining that.
3. **Serverless function.** A small endpoint creates a Subscription with an inline price. Full
   control, but it needs the Stripe **secret** key, which must live in the host's environment
   variables and never in this repository.

### Smaller gaps

- **Fund designation is by link, not by field.** One Payment Link per fund is what gives us clean
  per-fund reporting. A donor splitting a gift across funds has to check out twice.
- **`_redirects` does not work on GitHub Pages.** It is a Netlify feature. The preview deploy has no
  working legacy Squarespace redirects; that only matters at real cutover.
- **No donor record in this repo.** Everything — receipts, year-end statements, recurring status —
  lives in the provider's dashboard. That is deliberate, but it means the treasurer works in two
  places unless we later add a church-management system.

## Provider comparison: Stripe, Square, Donorbox, and Zelle

Same cursory-analysis caveat as above. The interactive version of this table is on the
[Giving page](../src/giving.njk) itself — the provider bar there switches both the specifications
and the mock donor experience, so the council can see how each option actually feels and what each
one costs on a real gift amount.

|                                 | **Stripe**                         | **Square**                                                           | **Donorbox**                                | **Zelle**                                               |
| ------------------------------- | ---------------------------------- | -------------------------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------- |
| Donor picks amount, one-time    | Yes                                | Yes                                                                  | Yes                                         | Yes                                                     |
| **Donor picks amount, monthly** | **No** (see above)                 | **Yes** — donation links take a _Frequency_ of one-time or recurring | **Yes** — this is the product               | Donor-scheduled only; parish cannot set up or manage it |
| Card fee                        | 2.9% + $0.30, 2.2% for non-profits | 2.9% + $0.30 online                                                  | **2.95% platform fee _plus_ Stripe's 2.2%** | n/a                                                     |
| Bank-transfer fee               | ACH 0.8%, capped at $5.00          | ACH available; rate unverified                                       | 2.95% on top of ACH                         | **$0**                                                  |
| In-person giving                | Terminal hardware                  | Strong — same account covers the bookstore and candle desk           | No                                          | Awkward                                                 |
| Fits our static site            | Hosted link or redirect            | Hosted link or redirect                                              | Embedded iframe                             | No integration at all                                   |
| Per-fund tracking               | One link per fund                  | One link per fund                                                    | Campaigns and designations                  | Memo line, reconciled by hand                           |
| Automatic receipts              | Yes                                | Yes                                                                  | Yes, with tax-receipt templates             | **No**                                                  |
| Donor self-service              | Customer Portal, no code           | Yes                                                                  | Donor accounts included                     | Bank app                                                |
| Reversible                      | Chargebacks apply                  | Chargebacks apply                                                    | Chargebacks apply                           | **Irreversible**                                        |

### What a $100 monthly tithe actually nets the parish

| Rail                | Parish receives |
| ------------------- | --------------- |
| Zelle               | $100.00         |
| Stripe ACH          | ~$99.20         |
| Stripe card         | ~$97.50         |
| Square card         | ~$96.80         |
| Donorbox (on cards) | ~$94.55         |

Over a year, one such tithe is about $65 through Donorbox versus about $30 through Stripe card and
about $10 through Stripe ACH. Multiply by the number of pledging households before deciding.

### Reading of the four

**Square** is the strongest single answer on features. It closes the exact gap Stripe has: a
donation payment link takes a _Frequency_ of one-time **or recurring** while still letting the donor
enter their own amount
([Square docs](https://squareup.com/help/us/en/article/7184-set-up-donation-goals-with-square-checkout-links)),
so proportional monthly tithing works with no code and no workaround. Two caveats: donation links
are capped at **$5,000** per transaction, which a large building gift could exceed, and Square's
non-profit rate appears to apply to Invoices rather than to all online donations — confirm both with
Square before switching. Square is also the better fit if the parish ever wants one system covering
the bookstore, candle desk, and online giving.

**Stripe** remains the better _engineering_ platform — cleaner APIs, the cheapest ACH by a wide
margin, and a no-code Customer Portal. That ACH rate matters on a large regular tithe: roughly five
dollars a month on a 600-dollar gift, against about seventeen on a card. Its weakness is precisely
the recurring custom amount, and the quantity workaround above is serviceable but slightly odd for
donors.

**Zelle** is not a competitor to either — it cannot be integrated into a website at all. There is no
form, no dashboard, no receipt, and no donor record; the parish publishes an email address and the
donor pushes money from their own banking app. But it is genuinely **free**, and that is worth real
money on large gifts: a $5,000 building donation costs about $145 in card fees and $0 by Zelle.
Payments are also irreversible, which removes chargeback risk but equally removes any recourse for a
donor who makes a mistake.

**Donorbox** is a different kind of option: it is not a payment processor but a donation platform
that sits on top of one. It solves the recurring-custom-amount problem outright and needs nothing
but an `<iframe>`, so it works on a static site with no server and no secret key. The cost is a
**2.95% platform fee charged on top of** whatever Stripe or PayPal takes underneath. The Pro plan
drops that to 1.75% for $150 a month, which only pays for itself above roughly **$12,500 a month**
in donations — far beyond this parish. Treat Donorbox as buying convenience, not processing.

> **Where this came from.** The repository
> [`jeffch19/paal-nonprofit-website`](https://github.com/jeffch19/paal-nonprofit-website) looks at
> first glance like a static Jekyll site doing recurring Stripe payments without a backend. It is
> not: `index.html` embeds `<iframe src="https://donorbox.org/embed/…">`, and Donorbox holds the
> Stripe credentials on its own servers. It is the rented backend, which confirms rather than
> contradicts the analysis above — a static site still cannot charge a card by itself.

**Suggested shape:** pick one card/ACH rail for convenience and recurring gifts, and publish Zelle
alongside it for large one-off gifts where the fee saving is material. That is a page-copy decision,
not a code decision, and costs nothing to offer both.

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

| Fund                      | Type                       | Notes                                       |
| ------------------------- | -------------------------- | ------------------------------------------- |
| Tithes & Offerings        | One-time **and** recurring | Needs **two** links — see the caution below |
| Building & Beautification | One-time                   |                                             |
| Charity Fund              | One-time                   |                                             |
| Candles & Commemorations  | One-time                   |                                             |

> **Caution — this is the [known gap](#known-gaps).** _Customers choose what to pay_ is only
> available on **one-off** prices. The recurring tithe link therefore cannot also let the donor name
> their amount. Build it as either fixed monthly tiers or a $1.00/month price with adjustable
> quantity, and read the workarounds above before creating it.

Recommended settings for each link:

- **Pricing:** for the one-time links, choose _Customers choose what to pay_ and set a
  preset/suggested amount. For the recurring link, see the caution above.
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
