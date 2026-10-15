import { getBunServer } from "@/core/bun-server";
import { redis } from "@/core/redis";

export interface SanitizedTransactionEvent {
  type: "transaction:new" | "transaction:updated" | "transaction:resend";
  transaction?: {
    id: string;
    provider: string;
    type: string;
    status: string;
    isTest: boolean;
    amount: number;
    currency: string;
    senderName: string;
    message: string | null;
    createdAt: string;
    isDeleted: boolean;
  };
  transactionId?: string;
  isDeleted?: boolean;
}

export const broadcastStreamerTransaction = async (
  orgId: bigint | string,
  streamerId: bigint | string,
  event: SanitizedTransactionEvent,
): Promise<void> => {
  const channel = `org:${String(orgId)}:streamer:${String(streamerId)}:transactions`;
  const payload = JSON.stringify(event);

  const bunServer = getBunServer();
  if (bunServer) {
    bunServer.publish(channel, payload);
  }

  try {
    if (redis.redis.status === "ready") {
      await redis.redis.publish(
        `alertbox-org:tx:${String(orgId)}:${String(streamerId)}`,
        payload,
      );
    }
  } catch {
    // ignore redis error
  }
};
