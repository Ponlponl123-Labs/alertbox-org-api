import Elysia from "elysia";
import { auth } from "@/core/auth";
import { db } from "@/db";
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

      const tx = await db
        .selectFrom("TransactionLog")
        .select([
          "id",
          "isDeleted",
          "senderName",
          "amount",
          "currency",
          "provider",
        ])
        .where("id", "=", Number(txIdBig))
        .where("orgId", "=", Number(orgId))
        .where("streamerId", "=", Number(streamerId))
        .executeTakeFirst();

      if (!tx) {
        set.status = "Not Found";
        return "Transaction not found";
      }

      const isRestoring = tx.isDeleted !== null;
      const nextDeletedDate = isRestoring ? null : new Date();

      await db
        .updateTable("TransactionLog")
        .set({ isDeleted: nextDeletedDate, updatedAt: new Date() })
        .where("id", "=", Number(tx.id))
        .execute();

      const isDeletedBool = nextDeletedDate !== null;

      await Promise.all([
        broadcastStreamerTransaction(orgId, streamerId, {
          type: "transaction:updated",
          transactionId: String(tx.id),
          isDeleted: isDeletedBool,
        }),
        logOrgAudit({
          orgId,
          userId: user.data.id,
          action: isRestoring ? "TRANSACTION_RESTORED" : "TRANSACTION_DELETED",
          targetType: "STREAMER",
          targetId: BigInt(streamerId),
          payload: {
            transactionId: String(tx.id),
            streamerId: String(streamerId),
            senderName: tx.senderName,
            amount: Number(tx.amount),
            currency: tx.currency,
            provider: tx.provider,
          },
        }),
      ]);

      return {
        id: String(tx.id),
        isDeleted: isDeletedBool,
        deletedAt: nextDeletedDate ? nextDeletedDate.toISOString() : null,
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
