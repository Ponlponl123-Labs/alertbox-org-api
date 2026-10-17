import Elysia from "elysia";
import { auth } from "@/core/auth";
import { prisma } from "@/core/prisma";
import { OrgPerm, StreamerPerm } from "@/consts/permission";
import { authorizeStreamer } from "@/core/org";
import { broadcastStreamerTransaction } from "./broadcast";
import { logOrgAudit } from "@/core/audit";

export const endpoint = new Elysia()
  .use(auth)
  .patch(
    "/:orgId/streamers/:streamerId/transactions/:txId/soft-delete",
    async ({ getAuthenticatedUser, params, set }) => {
      const user = await getAuthenticatedUser();
      const authRes = await authorizeStreamer(
        params.orgId,
        params.streamerId,
        user.data.id,
        {
          requiredOrgPerm: OrgPerm.TRANSACTION_VIEW,
          requiredStreamerPerm: StreamerPerm.STREAMER_TRANSACTION_VIEW,
          actionDescription: "soft delete streamer transaction",
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
        select: {
          id: true,
          isDeleted: true,
          senderName: true,
          amount: true,
          currency: true,
          provider: true,
        },
      });

      if (!tx) {
        set.status = "Not Found";
        return "Transaction not found";
      }

      const isRestoring = tx.isDeleted !== null;
      const nextDeletedDate = isRestoring ? null : new Date();

      const updated = await prisma.client.transactionLog.update({
        where: { id: tx.id },
        data: { isDeleted: nextDeletedDate },
        select: { id: true, isDeleted: true },
      });

      const isDeletedBool = updated.isDeleted !== null;

      await Promise.all([
        broadcastStreamerTransaction(orgId, streamerId, {
          type: "transaction:updated",
          transactionId: String(updated.id),
          isDeleted: isDeletedBool,
        }),
        logOrgAudit({
          orgId,
          userId: user.data.id,
          action: isRestoring ? "TRANSACTION_RESTORED" : "TRANSACTION_DELETED",
          targetType: "STREAMER",
          targetId: streamerId,
          payload: {
            transactionId: String(updated.id),
            streamerId: String(streamerId),
            senderName: tx.senderName,
            amount: tx.amount,
            currency: tx.currency,
            provider: tx.provider,
          },
        }),
      ]);

      return {
        id: String(updated.id),
        isDeleted: isDeletedBool,
        deletedAt: updated.isDeleted ? updated.isDeleted.toISOString() : null,
      };
    },
    {
      detail: {
        tags: ["Organizations"],
        summary: "Toggle soft-delete status for a transaction",
        description: "Toggles whether a transaction is soft-deleted (dashed and faded on table).",
      },
    },
  );

export default endpoint;
