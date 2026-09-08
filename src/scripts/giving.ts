/**
 * Giving page — mock checkout built on Stripe.js v3 Elements.
 *
 * IMPORTANT: this is a prototype of the donor experience, not a working
 * payment form. Stripe Elements collects and validates card details entirely
 * inside Stripe's own iframe (so card numbers never touch this site), but
 * actually moving money requires a PaymentIntent created server-side with the
 * parish's Stripe secret key. A static site has no server, so this file
 * deliberately never calls the Stripe API — it simulates the confirmation step
 * so the layout, copy, and flow can be reviewed.
 *
 * See docs/giving-setup.md for the two supported routes to real payments.
 */

interface GivingFund {
  id: string;
  title: string;
  recurring: boolean;
  suggestedAmounts: number[];
}

interface GivingConfig {
  demo: boolean;
  publishableKey: string;
  fee: { percent: number; fixed: number };
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
 * Grosses the gift up so the parish nets the donor's intended amount after
 * Stripe's fee, which is charged on the total rather than the base gift.
 */
function processingFee(cents: number, fee: GivingConfig["fee"]): number {
  if (cents <= 0) return 0;
  const rate = fee.percent / 100;
  const total = Math.round((cents + fee.fixed) / (1 - rate));
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
  if (config.funds.length === 0) return;

  // Unhidden before the lookups below so that a failure in wiring still leaves
  // the donor with a visible form rather than an empty page.
  form.hidden = false;

  const amountOptions = must<HTMLDivElement>(document, "#amount-options");
  const customAmount = must<HTMLInputElement>(document, "#custom-amount");
  const coverFees = must<HTMLInputElement>(document, "#cover-fees");
  const coverFeesLabel = must<HTMLSpanElement>(document, "#cover-fees-amount");
  const donorName = must<HTMLInputElement>(document, "#donor-name");
  const donorEmail = must<HTMLInputElement>(document, "#donor-email");
  const cardErrors = must<HTMLParagraphElement>(document, "#card-errors");
  const formError = must<HTMLParagraphElement>(document, "#form-error");
  const summary = must<HTMLParagraphElement>(document, "#giving-summary");
  const submit = must<HTMLButtonElement>(document, "#giving-submit");
  const submitLabel = must<HTMLSpanElement>(document, "#giving-submit-label");
  const receipt = must<HTMLDivElement>(document, "#giving-receipt");
  const receiptBody = must<HTMLDivElement>(document, "#giving-receipt-body");
  const restart = must<HTMLButtonElement>(document, "#giving-restart");
  const frequencyFields = must<HTMLFieldSetElement>(document, "#frequency-fields");
  const monthlyRadio = must<HTMLInputElement>(document, "#frequency-monthly");
  const onceRadio = must<HTMLInputElement>(document, "#frequency-once");
  const monthlyNote = must<HTMLSpanElement>(document, "#monthly-note");

  let fund = config.funds[0]!;
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
    return coverFees.checked ? processingFee(selectedCents(), config.fee) : 0;
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

  function renderTotal(): void {
    const gift = selectedCents();
    const fee = feeCents();

    coverFeesLabel.textContent =
      gift > 0 ? ` (adds ${formatCents(processingFee(gift, config.fee))})` : "";

    if (gift <= 0) {
      summary.textContent = "Choose an amount to continue.";
      submitLabel.textContent = "Give";
      return;
    }

    const cadence = frequency === "monthly" ? " each month" : "";
    summary.textContent =
      fee > 0
        ? `${formatCents(gift)} to ${fund.title}, plus ${formatCents(fee)} to cover processing — ${formatCents(gift + fee)}${cadence}.`
        : `${formatCents(gift)} to ${fund.title}${cadence}.`;
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
    const rows: Array<[string, string]> = [
      ["Fund", fund.title],
      ["Gift", formatCents(gift)],
    ];
    if (fee > 0) rows.push(["Processing covered", formatCents(fee)]);
    rows.push([
      "Total",
      `${formatCents(gift + fee)}${frequency === "monthly" ? " per month" : ""}`,
    ]);
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
    if (processing) return;

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
    if (!card) {
      setError("The secure card field is unavailable, so this gift cannot be completed here.");
      return;
    }
    if (!cardComplete) {
      setError("Please complete your card details.");
      card.focus();
      return;
    }

    setError("");
    processing = true;
    submit.disabled = true;
    const restoreLabel = submitLabel.textContent ?? "Give";
    submitLabel.textContent = "Processing…";

    // A real charge would happen here, against a PaymentIntent created
    // server-side. In demo mode we only wait, so no card is sent to Stripe.
    window.setTimeout(() => {
      processing = false;
      submit.disabled = false;
      submitLabel.textContent = restoreLabel;
      showReceipt(`demo_${Math.random().toString(36).slice(2, 10)}`);
    }, SIMULATED_LATENCY_MS);
  });

  restart.addEventListener("click", reset);

  renderFrequency();
  renderAmounts();
  renderTotal();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start);
} else {
  start();
}
