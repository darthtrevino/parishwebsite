/**
 * Minimal ambient declarations for Stripe.js v3, loaded as a global from
 * https://js.stripe.com/v3/.
 *
 * Stripe requires that Stripe.js be loaded directly from their domain — it may
 * not be bundled or self-hosted, because that would pull this site into PCI
 * scope. So there is no npm package to take types from, and we declare the
 * slice of the API this site actually uses.
 *
 * Only the card Element surface is covered. If the parish later moves to the
 * Payment Element or Checkout, extend this file to match.
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

interface StripeElements {
  create(type: "card", options?: StripeCardElementOptions): StripeCardElement;
  getElement(type: "card"): StripeCardElement | null;
}

interface StripeElementsOptions {
  fonts?: Array<{ cssSrc: string } | { family: string; src: string; weight?: string }>;
  locale?: string;
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
  elements(options?: StripeElementsOptions): StripeElements;
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
