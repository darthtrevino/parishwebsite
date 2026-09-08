/**
 * Minimal ambient declarations for the Square Web Payments SDK, loaded as a
 * global from web.squarecdn.com (or sandbox.web.squarecdn.com).
 *
 * Like Stripe.js, Square's SDK must be loaded from Square's own domain rather
 * than bundled, so there is no npm package to take types from and we declare
 * only the slice this site uses.
 *
 * The SDK needs an Application ID and a Location ID, which are per-account and
 * therefore not committed here — see `providers[].square` in
 * src/_data/giving.json. Tokenizing a card still does not move money: that
 * requires a server-side CreatePayment call with an access token.
 */

interface SquareCardOptions {
  postalCode?: string;
  style?: Record<string, Record<string, string>>;
}

interface SquareTokenResult {
  status: "OK" | "Cancel" | "Abort" | "Invalid";
  token?: string;
  errors?: Array<{ message: string; field?: string; type?: string }>;
}

interface SquareCard {
  attach(selector: string | HTMLElement): Promise<void>;
  detach(): Promise<void>;
  destroy(): Promise<void>;
  clear(): Promise<void>;
  focus(field?: string): Promise<void>;
  tokenize(verificationDetails?: unknown): Promise<SquareTokenResult>;
  addEventListener(
    event:
      | "focusClassAdded"
      | "focusClassRemoved"
      | "errorClassAdded"
      | "errorClassRemoved"
      | "cardBrandChanged"
      | "postalCodeChanged",
    handler: (event: unknown) => void,
  ): void;
}

interface SquarePayments {
  card(options?: SquareCardOptions): Promise<SquareCard>;
}

interface SquareSdk {
  payments(applicationId: string, locationId: string): SquarePayments;
}

declare const Square: SquareSdk | undefined;

interface Window {
  Square?: SquareSdk;
}
