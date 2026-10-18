import Elysia from "elysia";
import { auth } from "@/core/auth";
import { db } from "@/db";
import { OrgPerm, StreamerPerm } from "@/consts/permission";
import { authorizeStreamer } from "@/core/org";
import { broadcastStreamerTransaction } from "./broadcast";
import { WebhookDispatcher } from "@/classes/webhook/dispatcher";
import { recordActivityTransaction } from "@/routes/v1/org/transactions/activity";
import { logOrgAudit } from "@/core/audit";

export const endpoint = new Elysia()
  .use(auth)
  .post(
    "/:orgId/streamers/:streamerId/transactions/:txId/resend",
    async ({ getAuthenticatedUser, params, set }) => {
      const user = await getAuthenticatedUser();
      const authRes = await authorizeStreamer(
        params.orgId,
        params.streamerId,
        user.data.id,
        {
          requiredOrgPerm: OrgPerm.INTEGRATION_MANAGE,
          requiredStreamerPerm: StreamerPerm.STREAMER_INTEGRATION_MANAGE,
          actionDescription: "resend transaction alert",
        },
        set,
      );
      if (typeof authRes === "string") {
        return set.status === "Bad Request" ? "Invalid organization or streamer ID" : authRes;
      }
      const { orgId, streamerId } = authRes;

      let txIdBig: bigint;
      try {
        txIdBig = BigInt(params.txId);
      } catch {
        set.status = "Bad Request";
        return "Invalid transaction ID";
      }

      const tx = await db
        .selectFrom("TransactionLog")
        .selectAll()
        .where("id", "=", Number(txIdBig))
        .where("orgId", "=", Number(orgId))
        .where("streamerId", "=", Number(streamerId))
        .executeTakeFirst();

      if (!tx) {
        set.status = "Not Found";
        return "Transaction not found";
      }

      const unixTime = Math.floor(Date.now() / 1000);
      const baseTxId = tx.providerTxId || String(tx.id);
      const newProviderTxId = `${baseTxId}_r${unixTime}`;
      const now = new Date();

      const insertRes = await db
        .insertInto("TransactionLog")
        .values({
          orgId: Number(orgId),
          streamerId: Number(streamerId),
          provider: tx.provider,
          providerTxId: newProviderTxId,
          type: tx.type,
          status: tx.status,
          isTest: tx.isTest,
          amount: tx.amount,
          currency: tx.currency,
          senderName: tx.senderName,
          senderEmail: tx.senderEmail,
          message: tx.message,
          rawPayload: tx.rawPayload,
          createdAt: now,
          updatedAt: now,
        })
        .executeTakeFirstOrThrow();

      const newTxId = String(insertRes.insertId);

      const formattedTx = {
        id: newTxId,
        provider: tx.provider,
        type: tx.type,
        status: tx.status,
        isTest: Boolean(tx.isTest),
        amount: Number(tx.amount),
        currency: tx.currency,
        senderName: tx.senderName,
        message: tx.message,
        createdAt: now.toISOString(),
        isDeleted: false,
      };

      await Promise.all([
        broadcastStreamerTransaction(orgId, streamerId, {
          type: "transaction:new",
          transaction: formattedTx,
        }),
        WebhookDispatcher.dispatchAlerts(streamerId, {
          type: tx.type as any,
          name: tx.senderName,
          amount: Number(tx.amount),
          currency: tx.currency,
          message: tx.message,
        }),
        recordActivityTransaction(orgId, Boolean(tx.isTest)),
        logOrgAudit({
          orgId,
          userId: user.data.id,
          action: "TRANSACTION_RESENT",
          targetType: "STREAMER",
          targetId: BigInt(streamerId),
          payload: {
            transactionId: String(tx.id),
            newTransactionId: newTxId,
            streamerId: String(streamerId),
            senderName: tx.senderName,
            amount: Number(tx.amount),
            currency: tx.currency,
            provider: tx.provider,
          },
        }),
      ]);

      return {
        success: true,
        message: `Alert for ${tx.senderName} (${(Number(tx.amount) / 100).toFixed(2)} ${tx.currency}) re-triggered.`,
        transaction: formattedTx,
      };
    },
    {
      detail: {
        tags: ["Organizations"],
        summary: "Resend streamer transaction alert",
        description: "Re-triggers the alertbox overlay widget for an existing donation transaction, similar to Streamlabs replay.",
      },
    },
  );

export default endpoint;
