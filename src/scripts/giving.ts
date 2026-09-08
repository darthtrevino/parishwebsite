/**
 * Giving page — mock checkout and provider comparison.
 *
 * IMPORTANT: this is a prototype of the donor experience, not a working
 * payment form. It exists so the parish can compare Stripe, Square, Donorbox,
 * and Zelle side by side and see how each one changes the flow and the fees.
 *
 * Only the Stripe panel mounts a real payment element (Stripe.js v3 Elements,
 * which keeps card details inside Stripe's own iframe). Even there, no charge
 * is ever attempted: moving money needs a PaymentIntent created server-side
 * with a secret key, and a static site has no server. The other panels are
 * static representations, because Square and Donorbox both require credentials
 * tied to a real account and Zelle cannot be embedded at all.
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

interface GivingProvider {
  id: string;
  name: string;
  checkout: "stripe" | "square" | "iframe" | "zelle";
  fee: ProviderFee;
}

interface GivingConfig {
  demo: boolean;
  publishableKey: string;
  defaultProvider: string;
  zelle: { handle: string };
  providers: GivingProvider[];
  funds: GivingFund[];
}

type Frequency = "once" | "monthly";

const MIN_CENTS = 100;
const MAX_CENTS = 5_000_000;
const SIMULATED_LATENCY_MS = 1400;

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
  const monthlyRadio = must<HTMLInputElement>(document, "#frequency-monthly");
  const onceRadio = must<HTMLInputElement>(document, "#frequency-once");
  const monthlyNote = must<HTMLSpanElement>(document, "#monthly-note");
  const paymentLegend = must<HTMLLegendElement>(document, "#payment-legend");
  const providerNameInline = must<HTMLSpanElement>(document, "#provider-name-inline");
  const zelleHandle = must<HTMLElement>(document, "#zelle-handle");
  const zelleAmount = must<HTMLElement>(document, "#zelle-amount");
  const zelleMemo = must<HTMLElement>(document, "#zelle-memo");
  const zelleFrequencyNote = must<HTMLElement>(document, "#zelle-frequency-note");

  const tabs = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-provider-tab]"));
  const panels = Array.from(document.querySelectorAll<HTMLElement>("[data-provider-panel]"));
  const paymentSections = Array.from(document.querySelectorAll<HTMLElement>("[data-payment]"));

  let fund = config.funds[0]!;
  let provider =
    config.providers.find((candidate) => candidate.id === config.defaultProvider) ??
    config.providers[0]!;
  let frequency: Frequency = "once";
  let presetCents: number | null = null;
  let cardComplete = false;
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

  function renderZelle(): void {
    const gift = selectedCents();
    zelleHandle.textContent = config.zelle.handle || "Not yet configured";
    zelleAmount.textContent = gift > 0 ? formatCents(gift) : "Choose an amount above";
    zelleMemo.textContent = gift > 0 ? fund.title : "—";
    zelleFrequencyNote.textContent =
      frequency === "monthly"
        ? "For a monthly gift the donor sets up a repeating transfer in their own banking app. The parish cannot create, change, or cancel it."
        : "";
  }

  function renderTotal(): void {
    const gift = selectedCents();
    const fee = feeCents();

    coverFeesAmount.textContent =
      gift > 0 ? ` — ${formatCents(processingFee(gift, provider.fee))}` : "";

    if (provider.checkout === "zelle") renderZelle();

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

  function renderFrequency(): void {
    monthlyRadio.disabled = !fund.recurring;
    if (!fund.recurring && frequency === "monthly") {
      frequency = "once";
      onceRadio.checked = true;
    }
    frequencyFields.classList.toggle("is-limited", !fund.recurring);
    monthlyNote.textContent = fund.recurring ? "" : `${fund.title} accepts one-time gifts only.`;
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

    const isZelle = provider.checkout === "zelle";
    coverFeesField.hidden = isZelle;
    if (isZelle) coverFees.checked = false;
    coverFeesLabel.firstChild!.textContent = `Cover ${provider.name}'s fee of ${provider.fee.label} so the parish receives my full gift`;

    submit.hidden = isZelle;
    noSubmitNote.hidden = !isZelle;
    donorEmail.required = !isZelle;

    setError("");
    cardErrors.hidden = true;

    const url = new URL(window.location.href);
    url.searchParams.set("provider", id);
    window.history.replaceState({}, "", url);

    renderTotal();
  }

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

  let card: StripeCardElement | null = null;
  if (typeof Stripe === "function" && config.publishableKey) {
    const stripe = Stripe(config.publishableKey);
    const styles = getComputedStyle(document.body);
    card = stripe.elements().create("card", {
      hidePostalCode: false,
      style: {
        base: {
          color: styles.getPropertyValue("--ink").trim() || "#1a1a1a",
          fontFamily: styles.getPropertyValue("--sans").trim(),
          fontSize: "16px",
          "::placeholder": { color: "#9a9a9a" },
        },
        invalid: { color: "#a5203a" },
      },
    });
    card.mount("#card-element");
    card.on("change", (event) => {
      cardComplete = event.complete;
      cardErrors.textContent = event.error?.message ?? "";
      cardErrors.hidden = !event.error;
      if (event.complete) setError("");
    });
  } else {
    cardErrors.textContent =
      "The secure card field could not load. Check your connection, or give by mail using the details below.";
    cardErrors.hidden = false;
  }

  function reset(): void {
    presetCents = null;
    customAmount.value = "";
    coverFees.checked = false;
    donorName.value = "";
    donorEmail.value = "";
    cardComplete = false;
    card?.clear();
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
    // Only the Stripe panel has a live element to validate; the others are
    // static representations, so there is nothing to check.
    if (provider.checkout === "stripe") {
      if (!card) {
        setError("The secure card field is unavailable, so this gift cannot be completed here.");
        return;
      }
      if (!cardComplete) {
        setError("Please complete your card details.");
        card.focus();
        return;
      }
    }

    setError("");
    processing = true;
    submit.disabled = true;
    const restoreLabel = submitLabel.textContent ?? "Give";
    submitLabel.textContent = "Processing…";

    // A real charge would happen here, against a PaymentIntent created
    // server-side. In demo mode we only wait, so no card is sent anywhere.
    window.setTimeout(() => {
      processing = false;
      submit.disabled = false;
      submitLabel.textContent = restoreLabel;
      showReceipt(`demo_${Math.random().toString(36).slice(2, 10)}`);
    }, SIMULATED_LATENCY_MS);
  });

  restart.addEventListener("click", reset);

  const requested = new URL(window.location.href).searchParams.get("provider");
  const initial = config.providers.some((candidate) => candidate.id === requested)
    ? requested!
    : provider.id;

  renderFrequency();
  renderAmounts();
  setProvider(initial);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start);
} else {
  start();
}
