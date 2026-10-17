import Elysia from "elysia";
import { auth } from "@/core/auth";
import { prisma } from "@/core/prisma";
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

      const tx = await prisma.client.transactionLog.findFirst({
        where: { id: txIdBig, orgId, streamerId },
      });

      if (!tx) {
        set.status = "Not Found";
        return "Transaction not found";
      }

      const unixTime = Math.floor(Date.now() / 1000);
      const baseTxId = tx.providerTxId || String(tx.id);
      const newProviderTxId = `${baseTxId}_r${unixTime}`;

      const duplicatedTx = await prisma.client.transactionLog.create({
        data: {
          orgId,
          streamerId,
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
        },
      });

      const formattedTx = {
        id: String(duplicatedTx.id),
        provider: duplicatedTx.provider,
        type: duplicatedTx.type,
        status: duplicatedTx.status,
        isTest: duplicatedTx.isTest,
        amount: duplicatedTx.amount,
        currency: duplicatedTx.currency,
        senderName: duplicatedTx.senderName,
        message: duplicatedTx.message,
        createdAt: duplicatedTx.createdAt.toISOString(),
        isDeleted: false,
      };

      await Promise.all([
        broadcastStreamerTransaction(orgId, streamerId, {
          type: "transaction:new",
          transaction: formattedTx,
        }),
        WebhookDispatcher.dispatchAlerts(streamerId, {
          type: duplicatedTx.type as any,
          name: duplicatedTx.senderName,
          amount: duplicatedTx.amount,
          currency: duplicatedTx.currency,
          message: duplicatedTx.message,
        }),
        recordActivityTransaction(orgId, duplicatedTx.isTest),
        logOrgAudit({
          orgId,
          userId: user.data.id,
          action: "TRANSACTION_RESENT",
          targetType: "STREAMER",
          targetId: streamerId,
          payload: {
            transactionId: String(tx.id),
            newTransactionId: String(duplicatedTx.id),
            streamerId: String(streamerId),
            senderName: duplicatedTx.senderName,
            amount: duplicatedTx.amount,
            currency: duplicatedTx.currency,
            provider: duplicatedTx.provider,
          },
        }),
      ]);

      return {
        success: true,
        message: `Alert for ${duplicatedTx.senderName} (${duplicatedTx.amount} ${duplicatedTx.currency}) re-triggered.`,
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
