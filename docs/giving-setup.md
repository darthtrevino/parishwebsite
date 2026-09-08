# Online Giving Setup

> **Status: preview only.** The Giving page is linked from the main navigation at `/giving/`, but it
> **takes no payments**. It currently renders an interactive _mock_ of the checkout so the parish
> council can review the donor experience before committing to a provider. Follow
> [Publishing the page](#publishing-the-page) to launch it for real — but read
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

A **provider bar** at the top of the page switches between Stripe, Square, PayPal, and Zelle. It
changes both the specification panel and the donor experience below it, so the fee figures, the
payment step, and the receipt all update to match the provider being considered. The selection is
reflected in the URL (`/giving/?provider=square`), which makes it linkable in a council email.

### The form changes shape per provider

The form is driven by the `capabilities` block on each provider in `src/_data/giving.json`, so it
only ever offers what that provider can actually do. The important case is `capabilities.recurring`:

| Value               | Provider       | Effect on the form                                                       |
| ------------------- | -------------- | ------------------------------------------------------------------------ |
| `"no"`              | Stripe         | The monthly option is **removed**, with a note explaining why            |
| `"yes"`             | Square, PayPal | Monthly is offered normally                                              |
| `"donor-scheduled"` | Zelle          | Monthly is offered but relabelled "Monthly (you set it up)", with a note |

Removing the option matters more than it sounds. Stripe Payment Links cannot combine a donor-chosen
amount with a monthly schedule, so offering a Monthly button on the Stripe panel would demonstrate a
flow the parish could not actually build. Fund-level limits still apply on top: a fund with
`recurring: false` disables monthly whatever the provider supports.

`capabilities.coverFees` likewise hides the fee-coverage checkbox for Zelle, which has no fee to
cover.

### Provider-native UI

Where a provider ships a client-side UI that works without a server, the page uses the real thing
rather than a drawing of one.

- **Stripe — real, live.** The page mounts Stripe's **Payment Element** in _deferred-intent mode_
  (`stripe.elements({ mode, amount, currency })`), which renders from a publishable key alone with
  no PaymentIntent and therefore no server. This is a genuine upgrade over the older card Element:
  it shows the **US bank account (ACH)** tab alongside Card, which is exactly the rail that makes a
  large regular tithe cheap. Validation is Stripe's own `elements.submit()`.
- **Square — wired, dormant.** Square's Web Payments SDK is integrated and will attach a real card
  field, but only once `square.applicationId` and `square.locationId` are set in `giving.json`.
  Those are per-account values from the Square Developer Console. Until then the panel shows a
  placeholder and says so. **Never commit a Square access token** — the application and location IDs
  are public client-side values, the access token is not.
- **PayPal — wired, dormant, and the only one that would ship as-is.** Setting
  `paypal.hostedButtonId` renders PayPal's real **Donate SDK** button, which opens a PayPal popup
  over the page to take the gift. A hosted button ID is a _public_ value — it is meant to appear in
  page source — so unlike Stripe and Square there is nothing secret and no server needed even in
  production. It is left empty on purpose, because a live button in a public preview would take real
  money into whichever account it names. Verified in Chromium: the SDK renders the button and makes
  exactly two network requests, both to `paypalobjects.com` (the SDK and the button image), and none
  to any payment API.
- **Zelle — no checkout, but a QR code.** Zelle has no embeddable widget and no payment link, so the
  panel shows the tag, handle, amount, and memo line with copy-to-clipboard buttons. If the parish
  publishes its bank-issued QR code (`zelle.qr`), it is shown too — that is the one thing on the
  panel a donor can act on directly from a phone. See
  [Zelle links and QR codes](#zelle-links-and-qr-codes).

What is real:

- The **Stripe** panel is a genuine Payment Element served from `js.stripe.com` and rendered inside
  Stripe's own iframe, so card and bank details never touch this site.
- Validation is Stripe's, not ours. Submitting with an incomplete card is refused by Stripe.
- Amount selection, fund switching, monthly-vs-one-time rules, and the per-provider fee gross-up are
  real logic, computed from the rates in `src/_data/giving.json`.

What is **not** real:

- **No payment is taken.** `elements.submit()` validates and collects, but it creates no
  PaymentIntent, and the script never confirms anything. Verified in a browser: zero requests to
  `payment_intents`, `payment_methods`, or any confirm endpoint. (Stripe.js does make a handful of
  its own setup requests to `api.stripe.com` to render the element — those carry no payment.)
  Square's `tokenize()` is likewise never called.
- The `demo.publishableKey` in `giving.json` is Stripe's sample **test** key from their public
  documentation, not a parish key. Publishable keys are designed to be public and cannot move money.

To test the flow, use Stripe's test card `4242 4242 4242 4242` with any future expiry and any CVC.

To hide the mock, set `demo.enabled` to `false` in `src/_data/giving.json`. Provider rates,
capabilities, specifications, and caveats all live in the `providers` array in the same file.

### Why a static site cannot take real payments on its own

Elements can collect and tokenize a card in the browser, but _charging_ it requires creating a
PaymentIntent server-side with the parish's **secret** key. A static site has no server, which is
exactly why the recommendation below is Payment Links: Stripe hosts the part that needs the secret.

We use **Stripe Payment Links**. This approach was chosen deliberately:

- Payment Links are ordinary public URLs. **No API keys of any kind live in this repository.**
- Stripe hosts the checkout page, so card data never touches our site and PCI scope stays minimal.
- Recurring (monthly) giving at a **fixed** amount, Apple Pay, Google Pay, ACH bank debit, and
  receipt emails are all handled by Stripe with no code. A donor-chosen _recurring_ amount is the
  one thing Payment Links cannot do — see [Known gaps](#known-gaps).

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
proportion of income needs.

The mock at `/giving/` reflects this: on the Stripe panel the monthly option is **removed** rather
than offered, with the reason shown inline. Switch to Square or PayPal and it reappears.

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

## Provider comparison: Stripe, Square, PayPal, and Zelle

Same cursory-analysis caveat as above. The interactive version of this table is on the
[Giving page](../src/giving.njk) itself — the provider bar there switches both the specifications
and the mock donor experience, so the council can see how each option actually feels and what each
one costs on a real gift amount.

|                                 | **Stripe**                         | **Square**                                                           | **PayPal**                                      | **Zelle**                                               |
| ------------------------------- | ---------------------------------- | -------------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------- |
| Donor picks amount, one-time    | Yes                                | Yes                                                                  | Yes                                             | Yes                                                     |
| **Donor picks amount, monthly** | **No** (see above)                 | **Yes** — donation links take a _Frequency_ of one-time or recurring | **Yes** — enabled when the button is created    | Donor-scheduled only; parish cannot set up or manage it |
| Card fee                        | 2.9% + $0.30, 2.2% for non-profits | 2.9% + $0.30 online                                                  | **1.99% + $0.49 confirmed charity**, else 2.89% | n/a                                                     |
| Bank-transfer fee               | ACH 0.8%, capped at $5.00          | ACH available; rate unverified                                       | Same rate if the donor funds from a linked bank | **$0**                                                  |
| **Server required**             | Yes, for recurring                 | Yes, to take payment                                                 | **No — the Donate SDK needs none**              | n/a                                                     |
| In-person giving                | Terminal hardware                  | Strong — same account covers the bookstore and candle desk           | Card readers exist but are a weaker fit         | Awkward                                                 |
| Fits our static site            | Hosted link or redirect            | Hosted link or redirect                                              | **Popup from a public button ID**               | No link or checkout; QR code and tag only               |
| Per-fund tracking               | One link per fund                  | One link per fund                                                    | `item_name` per button                          | Memo line, reconciled by hand                           |
| Automatic receipts              | Yes                                | Yes                                                                  | Yes                                             | **No**                                                  |
| Donor self-service              | Customer Portal, no code           | Yes                                                                  | Donors manage it in their own PayPal account    | Bank app                                                |
| Per-transaction cap             | None                               | **$5,000** on donation links                                         | $10,000 on most accounts                        | Donor's bank, often $1,000–$3,500/day                   |
| Reversible                      | Chargebacks apply                  | Chargebacks apply                                                    | Disputes and chargebacks apply                  | **Irreversible**                                        |

### What a $100 monthly tithe actually nets the parish

| Rail                      | Parish receives |
| ------------------------- | --------------- |
| Zelle                     | $100.00         |
| Stripe ACH                | ~$99.20         |
| **PayPal (charity rate)** | **~$97.52**     |
| Stripe card               | ~$97.50         |
| Square card               | ~$96.80         |
| PayPal (standard rate)    | ~$96.62         |

PayPal's charity rate and Stripe's card rate are within two cents of each other on
$100, so on cost
alone they tie. They diverge at the extremes: PayPal's larger $0.49 fixed fee makes
it worse on small gifts (the crossover against Stripe is around
$10) and its lower percentage makes it better on
large ones. Stripe ACH still beats both on any sizeable regular gift, but only with a server behind
it. Over a year, a $100
monthly tithe costs about $30 through PayPal or Stripe card, and about $10 through Stripe ACH.
Multiply by the number of pledging households before deciding.

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

**Zelle** is not a competitor to either — it has no checkout to embed. There is no form, no
dashboard, no receipt, and no donor record; the parish publishes a handle and the donor pushes money
from their own banking app. But it is genuinely **free**, and that is worth real money on large
gifts: a $5,000 building donation costs about $145 in card fees and $0 by Zelle. Payments are also
irreversible, which removes chargeback risk but equally removes any recourse for a donor who makes a
mistake.

#### Zelle links and QR codes

Two things are commonly assumed here, and only one is true.

- **Payment links: no.** Zelle has no hosted checkout and no payment URL, so nothing on the giving
  page can be a clickable "pay now" button the way a Stripe Payment Link can. The donor must start
  the payment inside their own banking app. The
  [standalone Zelle app shut down on 1 April 2025](https://www.zelle.com/), so there is no longer
  even an app of Zelle's own to deep-link into.
- **QR codes: yes.** A donor can scan a code and have the parish's details filled in for them; they
  still type the amount and memo. The catch is that **the QR code must come from the parish's bank
  app.** It encodes a Zelle directory token, so it cannot be generated from an email address — a QR
  code made with a generic generator will not work. Export the parish's code and set `zelle.qr` in
  `src/_data/giving.json` to a path under `src/assets/img/`.

There is also a third option worth knowing about: a **Zelle tag**, a business handle such as
`StElizabethOrthodox`, which is friendlier and far less error-prone than publishing an email address
([Zelle for business](https://www.zelle.com/business)). It requires a business or non-profit account
at a participating bank. Set `zelle.tag` and it is shown in place of the raw address.

All three are optional and independent. Anything left empty is hidden rather than filled with a
placeholder, so the page never invites a donor to send money to an address that does not exist.

**PayPal** is the surprise of the four, and the reason Donorbox was dropped. It closes the same
recurring-custom-amount gap Square does, but it is the only option here that needs **no server even
in production**. PayPal's [Donate SDK](https://developer.paypal.com/sdk/donate/) renders a real
button from a `hosted_button_id`, and that ID is a _public_ value by design — it is meant to sit in
page source — so there is no secret to protect and nothing to deploy. The donation happens in a
PayPal popup layered over the page, so card details never touch this site and PayPal handles
receipts, recurring schedules, and donor self-service. Verified in Chromium: rendering the button
made exactly two network requests, both to `paypalobjects.com`, and none to any payment API.

If the parish is granted PayPal **confirmed charity status** (PPCC, applied for at
[paypal.com/charities](https://www.paypal.com/charities)), the rate drops to **1.99% +
$0.49**,
confirmed on
[PayPal's own fee page](https://www.paypal.com/us/business/paypal-business-fees). Until then it is
2.89% + $0.49,
which is worse than Stripe — so the charity application is the thing that makes this option
attractive, and should be started early since it needs registration documents.

Two real drawbacks. Recurring must be switched on **when the button is created** on PayPal's site;
it is not an SDK parameter, so changing it later means making a new button. And donors without a
PayPal account can pay by card in the popup but face an extra step, which costs some completion rate
compared with a card field sitting directly on the page.

> **Why not Donorbox.** An earlier revision of this document compared Donorbox as a fourth option,
> on the strength of
> [`jeffch19/paal-nonprofit-website`](https://github.com/jeffch19/paal-nonprofit-website), which
> looks like a static site taking recurring Stripe payments but is really an
> `<iframe src="https://donorbox.org/embed/…">` with Donorbox as the rented backend. Donorbox does
> solve the problem, but it charges a **2.95% platform fee on top of** the underlying processor,
> netting about $94.55 on a $100 gift. PayPal solves the same problem, from a static site, for about
> $97.52 and no platform fee at all, so Donorbox was not competitive and has been removed.

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
