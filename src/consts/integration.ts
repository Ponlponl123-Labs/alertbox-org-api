export const streamlabs_redirect_uri =
  process.env.NODE_ENV === "production"
    ? "https://alertbox.org/app/connections/streamlabs"
    : "http://localhost:3000/app/connections/streamlabs";

export enum StreamlabsOption {
  STRIPE_PAYMENT_SUCCESS = 0b00000001,
  TIPPING_PAYMENT_SUCCESS = 0b00000010,
  KOFI_DONATION_SUCCESS = 0b00000100,
  KOFI_PURCHASE_SUCCESS = 0b00001000,
  BMAC_DONATION_SUCCESS = 0b00010000,
}
