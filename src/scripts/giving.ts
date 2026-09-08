/**
 * Giving page — provider comparison and mock checkout.
 *
 * IMPORTANT: this is a prototype of the donor experience, not a working
 * payment form. It exists so the parish can compare Stripe, Square, PayPal,
 * and Zelle side by side and see how each one changes the flow and the fees.
 *
 * The form reshapes itself around what each provider can actually do, taken
 * from `capabilities` in src/_data/giving.json. The important case is the
 * monthly option: Stripe Payment Links cannot combine a donor-chosen amount
 * with a recurring schedule, so for Stripe the option is removed rather than
 * offered and then quietly broken.
 *
 * Where a provider ships a client-side UI that works without a server, we use
 * the real thing rather than a mock-up:
 *
 *   - Stripe    Payment Element in deferred-intent mode. It renders from a
 *               publishable key alone, with no PaymentIntent, so a static site
 *               can show the genuine article — including the US bank account
 *               (ACH) tab, which is the cheapest rail for a regular tithe.
 *   - Square    Web Payments SDK, loaded only when an application ID and
 *               location ID are configured. Those are per-account values.
 *   - PayPal    Donate SDK, loaded only when a hosted button ID is configured.
 *               Alone among the four it needs no server even in production:
 *               the donation happens in a PayPal popup, and a hosted button ID
 *               is a public value rather than a secret.
 *   - Zelle     Nothing embeddable exists, so we show the exact details to
 *               copy into a banking app.
 *
 * No provider is ever charged. Taking money requires a server-side call with a
 * secret key (Stripe's PaymentIntent, Square's CreatePayment), and a static
 * site has none. Stripe's `elements.submit()` runs real validation but creates
 * no intent; Square's card is attached but `tokenize()` is never called. PayPal
 * is the exception that proves the rule: its popup could take a real gift, so
 * the button stays dormant until the parish configures its own button ID.
 *
 * See docs/giving-setup.md for the routes to real payments.
 */

interface GivingFund {
  id: string;
  title: string;
  recurring: boolean;
  suggestedAmounts: number[];
}

interface ProviderFee {
  percent: number;
  fixed: number;
  label: string;
}

type RecurringSupport = "yes" | "no" | "donor-scheduled";

interface ProviderCapabilities {
  recurring: RecurringSupport;
  recurringNote: string;
  coverFees: boolean;
  ui: "stripe-payment-element" | "square-web-payments" | "paypal-donate-sdk" | "none";
  uiNote: string;
}

interface GivingProvider {
  id: string;
  name: string;
  checkout: "stripe" | "square" | "paypal" | "zelle";
  fee: ProviderFee;
  capabilities: ProviderCapabilities;
  square?: { environment: string; applicationId: string; locationId: string };
  paypal?: { environment: string; hostedButtonId: string; business: string };
}

interface GivingConfig {
  demo: boolean;
  publishableKey: string;
  defaultProvider: string;
  zelle: { tag: string; handle: string; qr: string };
  providers: GivingProvider[];
  funds: GivingFund[];
}

type Frequency = "once" | "monthly";

const MIN_CENTS = 100;
const MAX_CENTS = 5_000_000;
const SIMULATED_LATENCY_MS = 1400;
/** Stripe rejects an Elements amount below 50 cents, so previews start here. */
const PREVIEW_CENTS = 5000;

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const moneyWhole = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

function formatCents(cents: number): string {
  const formatter = cents % 100 === 0 ? moneyWhole : money;
  return formatter.format(cents / 100);
}

function must<T extends Element>(root: ParentNode, selector: string): T {
  const found = root.querySelector<T>(selector);
  if (!found) throw new Error(`Giving form is missing required element: ${selector}`);
  return found;
}

/**
 * Grosses the gift up so the parish nets the donor's intended amount after the
 * provider's fee, which is charged on the total rather than the base gift.
 */
function processingFee(cents: number, fee: ProviderFee): number {
  if (cents <= 0 || (fee.percent === 0 && fee.fixed === 0)) return 0;
  const total = Math.round((cents + fee.fixed) / (1 - fee.percent / 100));
  return total - cents;
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function loadScript(src: string): Promise<void> {
  const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
  if (existing) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.addEventListener("load", () => resolve());
    script.addEventListener("error", () => reject(new Error(`Could not load ${src}`)));
    document.head.append(script);
  });
}

function start(): void {
  const formEl = document.querySelector<HTMLFormElement>("#giving-form");
  if (!formEl) return;
  const form: HTMLFormElement = formEl;

  const configEl = document.querySelector<HTMLScriptElement>("#giving-config");
  if (!configEl?.textContent) return;
  const config = JSON.parse(configEl.textContent) as GivingConfig;
  if (config.funds.length === 0 || config.providers.length === 0) return;

  // Unhidden before the lookups below so that a failure in wiring still leaves
  // the donor with a visible form rather than an empty page.
  form.hidden = false;

  const amountOptions = must<HTMLDivElement>(document, "#amount-options");
  const customAmount = must<HTMLInputElement>(document, "#custom-amount");
  const coverFees = must<HTMLInputElement>(document, "#cover-fees");
  const coverFeesField = must<HTMLLabelElement>(document, "#cover-fees-field");
  const coverFeesLabel = must<HTMLSpanElement>(document, "#cover-fees-label");
  const coverFeesAmount = must<HTMLSpanElement>(document, "#cover-fees-amount");
  const donorName = must<HTMLInputElement>(document, "#donor-name");
  const donorEmail = must<HTMLInputElement>(document, "#donor-email");
  const cardErrors = must<HTMLParagraphElement>(document, "#card-errors");
  const formError = must<HTMLParagraphElement>(document, "#form-error");
  const summary = must<HTMLParagraphElement>(document, "#giving-summary");
  const submit = must<HTMLButtonElement>(document, "#giving-submit");
  const submitLabel = must<HTMLSpanElement>(document, "#giving-submit-label");
  const noSubmitNote = must<HTMLParagraphElement>(document, "#no-submit-note");
  const receipt = must<HTMLDivElement>(document, "#giving-receipt");
  const receiptBody = must<HTMLDivElement>(document, "#giving-receipt-body");
  const restart = must<HTMLButtonElement>(document, "#giving-restart");
  const frequencyFields = must<HTMLFieldSetElement>(document, "#frequency-fields");
  const monthlyField = must<HTMLLabelElement>(document, "#frequency-monthly-field");
  const monthlyLabel = must<HTMLSpanElement>(document, "#frequency-monthly-label");
  const monthlyRadio = must<HTMLInputElement>(document, "#frequency-monthly");
  const onceRadio = must<HTMLInputElement>(document, "#frequency-once");
  const monthlyNote = must<HTMLSpanElement>(document, "#monthly-note");
  const paymentLegend = must<HTMLLegendElement>(document, "#payment-legend");
  const providerNameInline = must<HTMLSpanElement>(document, "#provider-name-inline");
  const zelleTag = must<HTMLElement>(document, "#zelle-tag");
  const zelleHandle = must<HTMLElement>(document, "#zelle-handle");
  const zelleQr = must<HTMLElement>(document, "#zelle-qr");
  const zelleQrImage = must<HTMLImageElement>(document, "#zelle-qr-image");
  const zelleAmount = must<HTMLElement>(document, "#zelle-amount");
  const zelleMemo = must<HTMLElement>(document, "#zelle-memo");
  const zelleFrequencyNote = must<HTMLElement>(document, "#zelle-frequency-note");
  const squareMount = must<HTMLDivElement>(document, "#square-card");
  const squarePlaceholder = must<HTMLDivElement>(document, "#square-placeholder");
  const squareErrors = must<HTMLParagraphElement>(document, "#square-errors");
  const squareNote = must<HTMLParagraphElement>(document, "#square-note");
  const paypalMount = must<HTMLDivElement>(document, "#paypal-donate-button");
  const paypalPlaceholder = must<HTMLDivElement>(document, "#paypal-placeholder");
  const paypalErrors = must<HTMLParagraphElement>(document, "#paypal-errors");

  const tabs = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-provider-tab]"));
  const panels = Array.from(document.querySelectorAll<HTMLElement>("[data-provider-panel]"));
  const paymentSections = Array.from(document.querySelectorAll<HTMLElement>("[data-payment]"));

  let fund = config.funds[0]!;
  let provider =
    config.providers.find((candidate) => candidate.id === config.defaultProvider) ??
    config.providers[0]!;
  let frequency: Frequency = "once";
  let presetCents: number | null = null;
  let processing = false;

  function selectedCents(): number {
    if (presetCents !== null) return presetCents;
    const typed = Number.parseFloat(customAmount.value);
    if (!Number.isFinite(typed) || typed <= 0) return 0;
    return Math.round(typed * 100);
  }

  function feeCents(): number {
    return coverFees.checked ? processingFee(selectedCents(), provider.fee) : 0;
  }

  function chargedCents(): number {
    return selectedCents() + feeCents();
  }

  /** Whether a monthly gift can actually be arranged for this fund and provider. */
  function monthlyAvailable(): boolean {
    return fund.recurring && provider.capabilities.recurring !== "no";
  }

  // ---------------------------------------------------------------- Stripe

  let stripe: Stripe | null = null;
  let stripeElements: StripeElements | null = null;
  let paymentElement: StripePaymentElement | null = null;
  let stripeMode: "payment" | "subscription" = "payment";

  function mountStripe(): void {
    if (paymentElement || !config.publishableKey || typeof Stripe !== "function") return;
    const styles = getComputedStyle(document.body);
    stripe = Stripe(config.publishableKey);
    stripeMode = frequency === "monthly" ? "subscription" : "payment";
    stripeElements = stripe.elements({
      mode: stripeMode,
      amount: Math.max(chargedCents(), PREVIEW_CENTS),
      currency: "usd",
      appearance: {
        theme: "stripe",
        variables: {
          colorPrimary: styles.getPropertyValue("--teal").trim() || "#1d7e8b",
          colorText: styles.getPropertyValue("--ink").trim() || "#1a1a1a",
          fontFamily: styles.getPropertyValue("--sans").trim() || "sans-serif",
          borderRadius: "2px",
        },
      },
    });
    paymentElement = stripeElements.create("payment", { layout: "tabs" });
    paymentElement.on("loaderror", (event) => {
      cardErrors.textContent =
        event.error.message ??
        "The secure payment field could not load. You can still give by mail using the details below.";
      cardErrors.hidden = false;
    });
    paymentElement.on("change", () => {
      cardErrors.hidden = true;
    });
    paymentElement.mount("#payment-element");
  }

  /**
   * Stripe needs to know the amount and whether the gift repeats, because that
   * changes which payment methods it offers. `mode` cannot be changed after
   * creation, so a switch between one-time and monthly rebuilds the element.
   */
  function syncStripe(): void {
    if (!stripeElements || provider.capabilities.ui !== "stripe-payment-element") return;
    const wanted: "payment" | "subscription" = frequency === "monthly" ? "subscription" : "payment";
    if (wanted !== stripeMode) {
      paymentElement?.destroy();
      paymentElement = null;
      stripeElements = null;
      mountStripe();
      return;
    }
    stripeElements.update({ amount: Math.max(chargedCents(), PREVIEW_CENTS) });
  }

  // ---------------------------------------------------------------- Square

  let squareStarted = false;
  let squareCard: SquareCard | null = null;

  async function mountSquare(): Promise<void> {
    const settings = provider.square;
    if (squareStarted || !settings?.applicationId || !settings.locationId) return;
    squareStarted = true;
    const host =
      settings.environment === "production"
        ? "https://web.squarecdn.com/v1/square.js"
        : "https://sandbox.web.squarecdn.com/v1/square.js";
    try {
      await loadScript(host);
      if (!window.Square) throw new Error("Square SDK did not initialise");
      const payments = window.Square.payments(settings.applicationId, settings.locationId);
      squareCard = await payments.card();
      await squareCard.attach("#square-card");
      squareMount.hidden = false;
      squarePlaceholder.hidden = true;
      squareNote.textContent =
        "This is Square's real card field, from the Web Payments SDK. As with Stripe, nothing is charged here: completing a payment needs a server-side CreatePayment call with an access token.";
    } catch (error) {
      squareStarted = false;
      squareErrors.textContent =
        error instanceof Error ? error.message : "Square's payment field could not load.";
      squareErrors.hidden = false;
    }
  }

  // ---------------------------------------------------------------- PayPal

  let paypalStarted = false;

  /**
   * PayPal's Donate SDK renders its own button, which opens a popup that
   * handles amount, frequency, payment details and receipts. That is why this
   * is the only provider here that would genuinely work in production on a
   * static site: nothing secret is needed, only a public hosted button ID.
   *
   * The amount and fund chosen above are passed as `item_name` for the donor's
   * receipt, but PayPal collects the amount itself inside the popup, so they
   * are a starting point rather than something this page can enforce.
   */
  async function mountPayPal(): Promise<void> {
    const settings = provider.paypal;
    const identifier = settings?.hostedButtonId || settings?.business;
    if (paypalStarted || !settings || !identifier) return;
    paypalStarted = true;
    try {
      await loadScript("https://www.paypalobjects.com/donate/sdk/donate-sdk.js");
      if (!window.PayPal) throw new Error("PayPal Donate SDK did not initialise");
      const options: PayPalDonationButtonOptions = {
        env: settings.environment === "sandbox" ? "sandbox" : "production",
        item_name: fund.title,
        image: {
          src: "https://www.paypalobjects.com/en_US/i/btn/btn_donateCC_LG.gif",
          title: "PayPal - The safer, easier way to pay online!",
          alt: "Donate with PayPal button",
        },
        onComplete: (params) => {
          showReceipt(params.tx ?? "PayPal donation");
        },
      };
      if (settings.hostedButtonId) options.hosted_button_id = settings.hostedButtonId;
      else options.business = settings.business;

      window.PayPal.Donation.Button(options).render("#paypal-donate-button");
      paypalMount.hidden = false;
      paypalPlaceholder.hidden = true;
    } catch (error) {
      paypalStarted = false;
      paypalErrors.textContent =
        error instanceof Error ? error.message : "PayPal's donate button could not load.";
      paypalErrors.hidden = false;
    }
  }

  // --------------------------------------------------------------- render

  function renderAmounts(): void {
    amountOptions.replaceChildren();
    for (const dollars of fund.suggestedAmounts) {
      const cents = Math.round(dollars * 100);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "amount-option";
      button.textContent = formatCents(cents);
      button.setAttribute("aria-pressed", String(presetCents === cents));
      button.addEventListener("click", () => {
        presetCents = presetCents === cents ? null : cents;
        customAmount.value = "";
        renderAmounts();
        renderTotal();
      });
      amountOptions.append(button);
    }
  }

  /**
   * Zelle has no payment link, so there is nothing to hyperlink. What it does
   * have is a tag (a business handle) and a QR code, both issued by the bank —
   * the QR encodes a Zelle directory token and cannot be generated from an
   * email address, so we only ever display one the parish supplies. Rows with
   * nothing configured are hidden rather than filled with a placeholder.
   */
  function renderZelleIdentity(): void {
    const { tag, handle, qr } = config.zelle;

    zelleTag.textContent = tag ? `@${tag.replace(/^@/, "")}` : "";
    zelleHandle.textContent = handle || "Not yet configured";
    for (const row of document.querySelectorAll<HTMLElement>('[data-zelle-row="tag"]')) {
      row.hidden = !tag;
    }
    // Fall back to the raw handle only when there is no friendlier tag.
    for (const row of document.querySelectorAll<HTMLElement>('[data-zelle-row="handle"]')) {
      row.hidden = Boolean(tag) && Boolean(handle);
    }

    if (qr) {
      if (zelleQrImage.getAttribute("src") !== qr) zelleQrImage.src = qr;
      zelleQr.hidden = false;
    } else {
      zelleQr.hidden = true;
    }
  }

  function renderZelle(): void {
    const gift = selectedCents();
    renderZelleIdentity();
    zelleAmount.textContent = gift > 0 ? formatCents(gift) : "Choose an amount above";
    zelleMemo.textContent = gift > 0 ? fund.title : "—";
    zelleFrequencyNote.textContent =
      frequency === "monthly" ? provider.capabilities.recurringNote : "";
  }

  function renderTotal(): void {
    const gift = selectedCents();
    const fee = feeCents();

    coverFeesAmount.textContent =
      gift > 0 ? ` — ${formatCents(processingFee(gift, provider.fee))}` : "";

    if (provider.checkout === "zelle") renderZelle();
    syncStripe();

    if (gift <= 0) {
      summary.textContent = "Choose an amount to continue.";
      submitLabel.textContent = "Give";
      return;
    }

    const cadence = frequency === "monthly" ? " each month" : "";
    if (provider.checkout === "zelle") {
      summary.textContent = `${formatCents(gift)} to ${fund.title}${cadence}, with no fee deducted.`;
    } else if (fee > 0) {
      summary.textContent = `${formatCents(gift)} to ${fund.title}, plus ${formatCents(fee)} to cover ${provider.name}'s fee — ${formatCents(gift + fee)}${cadence}.`;
    } else {
      const cost = processingFee(gift, provider.fee);
      summary.textContent = `${formatCents(gift)} to ${fund.title}${cadence}. ${provider.name} takes about ${formatCents(cost)}, leaving ${formatCents(gift - cost)}.`;
    }
    submitLabel.textContent = `Give ${formatCents(gift + fee)}${frequency === "monthly" ? " monthly" : ""}`;
  }

  /**
   * The monthly option is removed outright when the provider cannot arrange a
   * donor-chosen recurring gift, rather than shown and then failing later.
   */
  function renderFrequency(): void {
    const support = provider.capabilities.recurring;
    const available = monthlyAvailable();

    monthlyField.hidden = support === "no";
    monthlyRadio.disabled = !available;
    if (!available && frequency === "monthly") {
      frequency = "once";
      onceRadio.checked = true;
    }
    monthlyLabel.textContent =
      support === "donor-scheduled" ? "Monthly (you set it up)" : "Monthly";
    frequencyFields.classList.toggle("is-limited", !available);

    if (support === "no") {
      monthlyNote.textContent = provider.capabilities.recurringNote;
    } else if (!fund.recurring) {
      monthlyNote.textContent = `${fund.title} accepts one-time gifts only.`;
    } else if (support === "donor-scheduled") {
      monthlyNote.textContent = provider.capabilities.recurringNote;
    } else {
      monthlyNote.textContent = "";
    }
  }

  function setError(message: string, focus?: HTMLElement): void {
    formError.textContent = message;
    formError.hidden = message === "";
    if (message && focus) focus.focus();
  }

  function setProvider(id: string, focusTab = false): void {
    const next = config.providers.find((candidate) => candidate.id === id);
    if (!next) return;
    provider = next;
    const caps = provider.capabilities;

    for (const tab of tabs) {
      const active = tab.dataset.providerTab === id;
      tab.setAttribute("aria-selected", String(active));
      tab.tabIndex = active ? 0 : -1;
      if (active && focusTab) tab.focus();
    }
    for (const panel of panels) panel.hidden = panel.dataset.providerPanel !== id;
    for (const section of paymentSections) {
      section.hidden = section.dataset.payment !== provider.checkout;
    }

    providerNameInline.textContent = provider.name;
    paymentLegend.textContent = provider.checkout === "zelle" ? "How the donor pays" : "Card";

    coverFeesField.hidden = !caps.coverFees;
    if (!caps.coverFees) coverFees.checked = false;
    coverFeesLabel.firstChild!.textContent = caps.coverFees
      ? `Cover ${provider.name}'s fee of ${provider.fee.label} so the parish receives my full gift`
      : "";

    const isZelle = provider.checkout === "zelle";
    // PayPal brings its own button and collects the gift in its popup, so our
    // submit would be a second, misleading way to "give".
    const hasOwnButton = caps.ui === "paypal-donate-sdk";
    const noSubmit = isZelle || hasOwnButton;
    submit.hidden = noSubmit;
    noSubmitNote.hidden = !noSubmit;
    noSubmitNote.textContent = isZelle
      ? "There is no button to press — the gift is sent from the donor's banking app."
      : "The gift is completed in PayPal's own window, using the button above.";
    donorEmail.required = !noSubmit;

    setError("");
    cardErrors.hidden = true;
    squareErrors.hidden = true;
    paypalErrors.hidden = true;

    if (caps.ui === "stripe-payment-element") mountStripe();
    if (caps.ui === "square-web-payments") void mountSquare();
    if (caps.ui === "paypal-donate-sdk") void mountPayPal();

    const url = new URL(window.location.href);
    url.searchParams.set("provider", id);
    window.history.replaceState({}, "", url);

    renderFrequency();
    renderTotal();
  }

  // ----------------------------------------------------------------- wiring

  for (const tab of tabs) {
    tab.addEventListener("click", () => setProvider(tab.dataset.providerTab ?? ""));
    tab.addEventListener("keydown", (event) => {
      const keys = ["ArrowLeft", "ArrowRight", "Home", "End"];
      if (!keys.includes(event.key)) return;
      event.preventDefault();
      const index = tabs.indexOf(tab);
      let target = index;
      if (event.key === "ArrowLeft") target = (index - 1 + tabs.length) % tabs.length;
      if (event.key === "ArrowRight") target = (index + 1) % tabs.length;
      if (event.key === "Home") target = 0;
      if (event.key === "End") target = tabs.length - 1;
      setProvider(tabs[target]!.dataset.providerTab ?? "", true);
    });
  }

  for (const input of form.querySelectorAll<HTMLInputElement>('input[name="fund"]')) {
    input.addEventListener("change", () => {
      const next = config.funds.find((candidate) => candidate.id === input.value);
      if (!next) return;
      fund = next;
      presetCents = null;
      customAmount.value = "";
      renderFrequency();
      renderAmounts();
      renderTotal();
    });
  }

  for (const input of form.querySelectorAll<HTMLInputElement>('input[name="frequency"]')) {
    input.addEventListener("change", () => {
      frequency = input.value === "monthly" ? "monthly" : "once";
      renderTotal();
    });
  }

  customAmount.addEventListener("input", () => {
    presetCents = null;
    renderAmounts();
    renderTotal();
  });

  coverFees.addEventListener("change", renderTotal);

  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-copy]")) {
    button.addEventListener("click", async () => {
      const source = document.getElementById(button.dataset.copy ?? "");
      const text = source?.textContent?.trim();
      if (!text) return;
      try {
        await navigator.clipboard.writeText(text);
        const original = button.textContent;
        button.textContent = "Copied";
        button.classList.add("is-copied");
        window.setTimeout(() => {
          button.textContent = original;
          button.classList.remove("is-copied");
        }, 1600);
      } catch {
        // Clipboard access can be refused; the value is on screen to read.
      }
    });
  }

  function reset(): void {
    presetCents = null;
    customAmount.value = "";
    coverFees.checked = false;
    donorName.value = "";
    donorEmail.value = "";
    paymentElement?.clear();
    void squareCard?.clear();
    cardErrors.hidden = true;
    setError("");
    receipt.hidden = true;
    form.hidden = false;
    renderAmounts();
    renderTotal();
    form.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function showReceipt(reference: string): void {
    const gift = selectedCents();
    const fee = feeCents();
    const cost = processingFee(gift, provider.fee);
    const rows: Array<[string, string]> = [
      ["Provider", provider.name],
      ["Fund", fund.title],
      ["Gift", formatCents(gift)],
    ];
    if (fee > 0) rows.push(["Fee covered by donor", formatCents(fee)]);
    rows.push([
      "Charged",
      `${formatCents(gift + fee)}${frequency === "monthly" ? " per month" : ""}`,
    ]);
    rows.push(["Parish receives", formatCents(fee > 0 ? gift : gift - cost)]);
    rows.push(["Frequency", frequency === "monthly" ? "Monthly" : "One-time"]);
    if (donorName.value.trim()) rows.push(["From", donorName.value.trim()]);
    rows.push(["Receipt to", donorEmail.value.trim()]);
    rows.push(["Reference", reference]);

    const list = document.createElement("dl");
    list.className = "receipt-list";
    for (const [term, value] of rows) {
      const dt = document.createElement("dt");
      dt.textContent = term;
      const dd = document.createElement("dd");
      dd.textContent = value;
      list.append(dt, dd);
    }
    receiptBody.replaceChildren(list);
    receipt.hidden = false;
    form.hidden = true;
    receipt.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function finish(): void {
    processing = false;
    submit.disabled = false;
    showReceipt(`demo_${Math.random().toString(36).slice(2, 10)}`);
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (processing || provider.checkout === "zelle") return;

    const gift = selectedCents();
    if (gift < MIN_CENTS) {
      setError(`Please choose an amount of at least ${formatCents(MIN_CENTS)}.`, customAmount);
      return;
    }
    if (gift > MAX_CENTS) {
      setError(
        `For gifts above ${formatCents(MAX_CENTS)}, please contact the parish directly so we can arrange the transfer.`,
        customAmount,
      );
      return;
    }
    if (!isValidEmail(donorEmail.value)) {
      setError("Please enter an email address so we can send your receipt.", donorEmail);
      return;
    }

    setError("");
    processing = true;
    submit.disabled = true;
    const restoreLabel = submitLabel.textContent ?? "Give";
    submitLabel.textContent = "Checking…";

    // Only Stripe exposes a client-side validator that works without a server.
    // Square's equivalent is tokenize(), which we deliberately never call.
    const useStripeValidation =
      provider.capabilities.ui === "stripe-payment-element" && stripeElements !== null;
    const validate: Promise<string | null> = useStripeValidation
      ? stripeElements!
          .submit()
          .then((result) => result.error?.message ?? null)
          .catch(() => "The payment details could not be validated.")
      : Promise.resolve(null);

    void validate.then((message) => {
      if (message) {
        processing = false;
        submit.disabled = false;
        submitLabel.textContent = restoreLabel;
        cardErrors.textContent = message;
        cardErrors.hidden = false;
        return;
      }
      submitLabel.textContent = "Processing…";
      // A real charge would happen here, against an intent created server-side.
      // In demo mode we only wait, so no card is ever submitted for payment.
      window.setTimeout(() => {
        submitLabel.textContent = restoreLabel;
        finish();
      }, SIMULATED_LATENCY_MS);
    });
  });

  restart.addEventListener("click", reset);

  const requested = new URL(window.location.href).searchParams.get("provider");
  const initial = config.providers.some((candidate) => candidate.id === requested)
    ? requested!
    : provider.id;

  renderAmounts();
  setProvider(initial);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start);
} else {
  start();
}
