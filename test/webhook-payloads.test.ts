import { describe, expect, it } from "bun:test";
import { Value } from "@sinclair/typebox/value";
import {
  webhookBodySchema,
  DonationCreated,
  MonthlySupportStarted,
} from "../src/types/webhooks/bmac.types";

describe("Webhook Event Schemas & Payload Validation", () => {
  it("should validate a complete BMAC donation.created payload", () => {
    const validDonation = {
      type: "donation.created",
      live_mode: true,
      attempt: 1,
      created: 1714500000,
      event_id: 12345,
      data: {
        id: 987,
        amount: 5,
        object: "donation",
        status: "succeeded",
        message: "Thanks for the great content!",
        currency: "USD",
        refunded: "false",
        created_at: 1714500000,
        note_hidden: "false",
        refunded_at: null,
        support_note: "Love your stream!",
        support_type: "donation",
        supporter_name: "John Doe",
        supporter_name_type: "name",
        transaction_id: "txn_123456",
        application_fee: "0.25",
        supporter_id: 456,
        supporter_email: "john@example.com",
        total_amount_charged: "5.00",
        coffee_count: 1,
        coffee_price: 5,
      },
    };

    expect(Value.Check(webhookBodySchema, validDonation)).toBe(true);
  });

  it("should validate a complete BMAC recurring_donation.started payload", () => {
    const validRecurring = {
      type: "recurring_donation.started",
      live_mode: true,
      attempt: 1,
      created: 1714500000,
      event_id: 12346,
      data: {
        id: 988,
        amount: 10,
        object: "monthly_support",
        paused: "false",
        paused_at: null,
        paused_until: null,
        unpaused_at: null,
        paused_by: null,
        status: "active",
        canceled: "false",
        currency: "USD",
        psp_id: "psp_123",
        duration_type: "month",
        started_at: 1714500000,
        canceled_at: null,
        note_hidden: false,
        support_note: null,
        supporter_name: "Jane Member",
        supporter_id: 789,
        supporter_email: "jane@example.com",
        current_period_end: 1717000000,
        current_period_start: 1714500000,
      },
    };

    expect(Value.Check(webhookBodySchema, validRecurring)).toBe(true);
  });

  it("should reject payloads with missing or invalid fields", () => {
    const invalidDonation = {
      type: "donation.created",
      live_mode: "yes", // should be boolean
      data: {
        id: "invalid_id_string", // should be number
      },
    };

    expect(Value.Check(webhookBodySchema, invalidDonation)).toBe(false);
  });

  it("should reject unknown event types", () => {
    const unknownEvent = {
      type: "unsupported.event",
      live_mode: true,
      attempt: 1,
      created: 1714500000,
      event_id: 999,
      data: {},
    };

    expect(Value.Check(webhookBodySchema, unknownEvent)).toBe(false);
  });
});
