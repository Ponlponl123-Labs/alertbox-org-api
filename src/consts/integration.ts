import { isDev } from "@/config/env";

export enum ConnectionProvider {
  DISCORD = 1,
  STREAMLABS = 2,
  TWITCH = 3,
  YOUTUBE = 4,
  GOOGLE = 5,
}

export const integrationRedirectUri: Record<ConnectionProvider, string> = {
  [ConnectionProvider.DISCORD]: !isDev
    ? "https://alertbox.org/app/connections/discord"
    : "http://localhost:3000/app/connections/discord",
  [ConnectionProvider.STREAMLABS]: !isDev
    ? "https://alertbox.org/app/connections/streamlabs"
    : "http://localhost:3000/app/connections/streamlabs",
  [ConnectionProvider.TWITCH]: !isDev
    ? "https://alertbox.org/app/connections/twitch"
    : "http://localhost:3000/app/connections/twitch",
  [ConnectionProvider.YOUTUBE]: !isDev
    ? "https://alertbox.org/app/connections/youtube"
    : "http://localhost:3000/app/connections/youtube",
  [ConnectionProvider.GOOGLE]: !isDev
    ? "https://alertbox.org/app/connections/google"
    : "http://localhost:3000/app/connections/google",
};

/**
 * @deprecated
 * Use integrationRedirectUri[ConnectionProvider.STREAMLABS] instead.
 */
export const streamlabs_redirect_uri = !isDev
  ? "https://alertbox.org/app/connections/streamlabs"
  : "http://localhost:3000/app/connections/streamlabs";

export enum StreamlabsOption {
  STRIPE_PAYMENT_SUCCESS = 0b00000001,
  BMAC_MEMBERSHIP_SUCCESS = 0b00000010,
  KOFI_DONATION_SUCCESS = 0b00000100,
  KOFI_PURCHASE_SUCCESS = 0b00001000,
  BMAC_DONATION_SUCCESS = 0b00010000,
}
