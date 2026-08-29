import { t, type Static } from "elysia";

/**
 * Elysia / TypeBox schema for a Buy Me a Coffee "Donation Created" webhook payload.
 */
export const DonationCreated = t.Object({
  id: t.Number(),
  amount: t.Number(),
  object: t.String(),
  status: t.String(),
  message: t.Nullable(t.String()),
  currency: t.String(),
  refunded: t.String(),
  created_at: t.Number(),
  note_hidden: t.String(),
  refunded_at: t.Nullable(t.Number()),
  support_note: t.Nullable(t.String()),
  support_type: t.String(),
  supporter_name: t.Nullable(t.String()),
  supporter_name_type: t.String(),
  transaction_id: t.Nullable(t.String()),
  application_fee: t.String(),
  supporter_id: t.Number(),
  supporter_email: t.String(),
  total_amount_charged: t.String(),
  coffee_count: t.Number(),
  coffee_price: t.Number(),
});

/**
 * TypeScript type representing a Buy Me a Coffee "Donation Created" webhook payload.
 */
export type DonationCreatedType = Static<typeof DonationCreated>;

/**
 * Elysia / TypeBox schema for a Buy Me a Coffee "Monthly Support Started" webhook payload.
 */
export const MonthlySupportStarted = t.Object({
  id: t.Number(),
  amount: t.Number(),
  object: t.String(),
  paused: t.String(),
  paused_at: t.Nullable(t.Number()),
  paused_until: t.Nullable(t.Number()),
  unpaused_at: t.Nullable(t.Number()),
  paused_by: t.Nullable(t.String()),
  status: t.String(),
  canceled: t.String(),
  currency: t.String(),
  psp_id: t.Nullable(t.String()),
  duration_type: t.String(),
  started_at: t.Number(),
  canceled_at: t.Nullable(t.Number()),
  note_hidden: t.Boolean(),
  support_note: t.Nullable(t.String()),
  supporter_name: t.Nullable(t.String()),
  supporter_id: t.Number(),
  supporter_email: t.String(),
  current_period_end: t.Number(),
  current_period_start: t.Number(),
});

/**
 * TypeScript type representing a Buy Me a Coffee "Monthly Support Started" webhook payload.
 */
export type MonthlySupportStartedType = Static<typeof MonthlySupportStarted>;

/**
 * Elysia / TypeBox schema for a Buy Me a Coffee webhook payload (union of event types).
 */
export const webhookBodySchema = t.Union([
  t.Object({
    type: t.Literal("donation.created"),
    live_mode: t.Boolean(),
    attempt: t.Number(),
    created: t.Number(),
    event_id: t.Number(),
    data: DonationCreated,
  }),
  t.Object({
    type: t.Literal("recurring_donation.started"),
    live_mode: t.Boolean(),
    attempt: t.Number(),
    created: t.Number(),
    event_id: t.Number(),
    data: MonthlySupportStarted,
  }),
]);

export type WebhookBodySchemaType = Static<typeof webhookBodySchema>;

export interface BmacIntegrationRecord {
  userId: string;
  bmacSecret: string | null;
  streamlabsSecret: string | null;
  streamlabsRefreshToken?: string | null;
  streamlabsOptions: number;
}
