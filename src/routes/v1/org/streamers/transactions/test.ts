import Elysia, { t } from "elysia";
import { auth } from "@/core/auth";
import { db } from "@/db";
import { OrgPerm, StreamerPerm } from "@/consts/permission";
import { authorizeStreamer } from "@/core/org";
import { broadcastStreamerTransaction } from "./broadcast";
import { WebhookDispatcher } from "@/classes/webhook/dispatcher";
import { recordActivityTransaction } from "@/routes/v1/org/transactions/activity";
import {
  streamerParamsSchema,
  streamerTestTxResponseSchema,
  standardErrors,
} from "../schemas";

export const endpoint = new Elysia()
  .use(auth)
  .post(
    "/:orgId/streamers/:streamerId/transactions/test",
    async ({ body, getAuthenticatedUser, params, set }) => {
      const user = await getAuthenticatedUser();
      const authRes = await authorizeStreamer(
        params.orgId,
        params.streamerId,
        user.data.id,
        {
          requiredOrgPerm: OrgPerm.INTEGRATION_MANAGE,
          requiredStreamerPerm: StreamerPerm.STREAMER_INTEGRATION_MANAGE,
          actionDescription: "send test transaction",
        },
        set,
      );
      if (typeof authRes === "string") {
        return set.status === "Bad Request" ? "Invalid organization or streamer ID" : authRes;
      }
      const { orgId, streamerId } = authRes;

      const provider = body.provider.toUpperCase().trim();
      const amount = Math.max(100, Math.round((Number(body.amount) || 50) * 100));
      const currency = (body.currency || "THB").toUpperCase().trim();
      const senderName = (body.senderName || "Test Supporter").trim();
      const message = body.message?.trim() || "This is a test tip alert!";

      const providerTxId = `test_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const now = new Date();
      const insertRes = await db
        .insertInto("TransactionLog")
        .values({
          orgId: Number(orgId),
          streamerId: Number(streamerId),
          provider,
          providerTxId,
          type: "TIP",
          status: "COMPLETED",
          isTest: 1,
          amount,
          currency,
          senderName,
          message,
          createdAt: now,
          updatedAt: now,
        })
        .executeTakeFirstOrThrow();

      const txId = String(insertRes.insertId);

      const formattedTx = {
        id: txId,
        provider,
        type: "TIP",
        status: "COMPLETED",
        isTest: true,
        amount,
        currency,
        senderName,
        message,
        createdAt: now.toISOString(),
        isDeleted: false,
      };

      await Promise.all([
        broadcastStreamerTransaction(orgId, streamerId, {
          type: "transaction:new",
          transaction: formattedTx,
        }),
        WebhookDispatcher.dispatchAlerts(streamerId, {
          type: "TIP",
          name: senderName,
          amount: amount / 100,
          currency,
          message,
        }),
        recordActivityTransaction(orgId, true),
      ]);

      return {
        success: true,
        transaction: formattedTx,
      };
    },
    {
      params: streamerParamsSchema,
      detail: {
        tags: ["Streamer Transactions"],
        summary: "Send test streamer transaction",
        description: "Creates and dispatches a test donation transaction for testing overlay and alert widgets.",
      },
      body: t.Object({
        provider: t.String({ description: "Simulated payment provider", examples: ["STRIPE", "BUYMEACOFFEE", "KOFI"] }),
        amount: t.Number({ description: "Simulated amount in currency units (e.g. 50 for 50 THB)", examples: [50] }),
        currency: t.Optional(t.String({ description: "Currency code (default: THB)", examples: ["THB", "USD"] })),
        senderName: t.Optional(t.String({ description: "Simulated sender or donor name", examples: ["Test Fan"] })),
        message: t.Optional(t.String({ description: "Simulated donation message", examples: ["Keep up the great streams!"] })),
      }),
      response: {
        200: streamerTestTxResponseSchema,
        ...standardErrors,
      },
    },
  );

export default endpoint;
