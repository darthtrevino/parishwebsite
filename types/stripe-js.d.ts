/**
 * Minimal ambient declarations for Stripe.js v3, loaded as a global from
 * https://js.stripe.com/v3/.
 *
 * Stripe requires that Stripe.js be loaded directly from their domain — it may
 * not be bundled or self-hosted, because that would pull this site into PCI
 * scope. So there is no npm package to take types from, and we declare the
 * slice of the API this site actually uses.
 *
 * Covers the card Element and the Payment Element in deferred-intent mode.
 * Deferred mode matters here: it renders from a publishable key alone, with no
 * PaymentIntent and therefore no server, which is what lets a static site show
 * the real Stripe UI (including the US bank account / ACH tab).
 */

interface StripeElementStyleVariant {
  color?: string;
  fontFamily?: string;
  fontSize?: string;
  fontSmoothing?: string;
  fontWeight?: string | number;
  letterSpacing?: string;
  lineHeight?: string;
  "::placeholder"?: { color?: string };
}

interface StripeElementStyle {
  base?: StripeElementStyleVariant;
  complete?: StripeElementStyleVariant;
  empty?: StripeElementStyleVariant;
  invalid?: StripeElementStyleVariant;
}

interface StripeCardElementOptions {
  style?: StripeElementStyle;
  hidePostalCode?: boolean;
  disabled?: boolean;
}

interface StripeError {
  type: string;
  code?: string;
  message?: string;
  decline_code?: string;
}

interface StripeCardElementChangeEvent {
  elementType: "card";
  empty: boolean;
  complete: boolean;
  error?: StripeError;
  brand?: string;
  value?: { postalCode?: string };
}

interface StripeCardElement {
  mount(target: string | HTMLElement): void;
  unmount(): void;
  destroy(): void;
  clear(): void;
  focus(): void;
  blur(): void;
  update(options: StripeCardElementOptions): void;
  on(event: "change", handler: (event: StripeCardElementChangeEvent) => void): void;
  on(event: "ready" | "focus" | "blur" | "escape", handler: () => void): void;
}

interface StripePaymentElementOptions {
  layout?: "tabs" | "accordion" | { type: "tabs" | "accordion"; defaultCollapsed?: boolean };
  defaultValues?: { billingDetails?: StripeBillingDetails };
  fields?: {
    billingDetails?: "auto" | "never" | { name?: "auto" | "never"; email?: "auto" | "never" };
  };
  terms?: Record<string, "auto" | "always" | "never">;
  readOnly?: boolean;
}

interface StripePaymentElementChangeEvent {
  elementType: "payment";
  empty: boolean;
  complete: boolean;
  collapsed: boolean;
  value: { type: string };
}

interface StripePaymentElement {
  mount(target: string | HTMLElement): void;
  unmount(): void;
  destroy(): void;
  clear(): void;
  focus(): void;
  blur(): void;
  update(options: StripePaymentElementOptions): void;
  on(event: "change", handler: (event: StripePaymentElementChangeEvent) => void): void;
  on(event: "loaderror", handler: (event: { error: StripeError }) => void): void;
  on(event: "ready" | "focus" | "blur" | "escape", handler: () => void): void;
}

interface StripeElements {
  create(type: "card", options?: StripeCardElementOptions): StripeCardElement;
  create(type: "payment", options?: StripePaymentElementOptions): StripePaymentElement;
  getElement(type: "card"): StripeCardElement | null;
  getElement(type: "payment"): StripePaymentElement | null;
  /**
   * Re-renders the element after the donor changes the amount or switches
   * between a one-time and a recurring gift.
   */
  update(options: Partial<StripeDeferredElementsOptions>): void;
  /**
   * Runs Stripe's own client-side validation and collects the payment details.
   * It does not create a PaymentIntent and does not charge anything — that
   * still requires a server holding the secret key.
   */
  submit(): Promise<{ error?: StripeError }>;
}

interface StripeAppearance {
  theme?: "stripe" | "night" | "flat";
  labels?: "above" | "floating";
  variables?: Record<string, string>;
  rules?: Record<string, Record<string, string>>;
}

interface StripeElementsOptions {
  fonts?: Array<{ cssSrc: string } | { family: string; src: string; weight?: string }>;
  locale?: string;
  appearance?: StripeAppearance;
}

/**
 * Options for the deferred-intent flow, where the amount is supplied up front
 * instead of a PaymentIntent client secret.
 */
interface StripeDeferredElementsOptions extends StripeElementsOptions {
  mode: "payment" | "subscription" | "setup";
  amount?: number;
  currency: string;
  paymentMethodTypes?: string[];
  setupFutureUsage?: "off_session" | "on_session";
}

interface StripeBillingDetails {
  name?: string;
  email?: string;
  phone?: string;
}

interface StripePaymentMethod {
  id: string;
  type: string;
  card?: { brand: string; last4: string; exp_month: number; exp_year: number };
}

interface Stripe {
  elements(options?: StripeElementsOptions | StripeDeferredElementsOptions): StripeElements;
  /**
   * Tokenizes card details into a PaymentMethod. Note that this alone does not
   * move money: charging requires a PaymentIntent created server-side with the
   * secret key. The demo on the giving page therefore never calls this.
   */
  createPaymentMethod(data: {
    type: "card";
    card: StripeCardElement;
    billing_details?: StripeBillingDetails;
  }): Promise<{ paymentMethod?: StripePaymentMethod; error?: StripeError }>;
}

declare function Stripe(publishableKey: string, options?: { locale?: string }): Stripe;
