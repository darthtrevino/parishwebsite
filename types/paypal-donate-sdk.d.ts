/**
 * Minimal ambient declarations for PayPal's Donate SDK.
 *
 * Loaded from https://www.paypalobjects.com/donate/sdk/donate-sdk.js at runtime
 * and never bundled, so this only describes the surface we actually call.
 *
 * Unlike PayPal's main Checkout SDK, the Donate SDK needs no client secret and
 * no server: a hosted button ID is a public value that is meant to appear in
 * page source. See https://developer.paypal.com/sdk/donate/
 */

/** The object handed to `onComplete` after a donation finishes. */
interface PayPalDonationResult {
  /** Transaction ID. */
  tx?: string;
  /** Transaction status. */
  st?: string;
  /** Transaction amount. */
  amt?: string;
  /** Currency code. */
  cc?: string;
  /** Custom message passed through from the button. */
  cm?: string;
  item_number?: string;
  item_name?: string;
}

interface PayPalDonationButtonOptions {
  /** Omitted or "production" for live; "sandbox" against sandbox.paypal.com. */
  env?: "production" | "sandbox";
  /** For business accounts, from paypal.com/donate/buttons. */
  hosted_button_id?: string;
  /** For personal accounts: the account email or payer ID. */
  business?: string;
  /** Shown on the donor's receipt; used here to name the fund. */
  item_name?: string;
  item_number?: string;
  image?: {
    src: string;
    title?: string;
    alt?: string;
  };
  onComplete?: (params: PayPalDonationResult) => void;
}

interface PayPalDonationButton {
  /** Renders into a CSS selector, e.g. "#paypal-donate-button". */
  render(selector: string): void;
}

interface PayPalDonationNamespace {
  Button(options: PayPalDonationButtonOptions): PayPalDonationButton;
}

interface PayPalDonateSdk {
  Donation: PayPalDonationNamespace;
}

declare const PayPal: PayPalDonateSdk | undefined;

interface Window {
  PayPal?: PayPalDonateSdk;
}
