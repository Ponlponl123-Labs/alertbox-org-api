import { prisma } from "@/core/prisma";

export type OrgAuditTargetType = "MEMBER" | "STREAMER" | "ORGANIZATION";

export async function logOrgAudit(params: {
  orgId: bigint;
  userId: bigint;
  action: string;
  targetType: OrgAuditTargetType;
  targetId?: bigint;
  payload?: any;
  ipAddress?: string;
}) {
  try {
    await prisma.client.organizationAuditLog.create({
      data: {
        orgId: params.orgId,
        userId: params.userId,
        action: params.action,
        targetType: params.targetType,
        targetId: params.targetId,
        payload: params.payload ? JSON.stringify(params.payload) : null,
        ipAddress: params.ipAddress || "127.0.0.1",
      },
    });
  } catch (err) {
    // Non-blocking log failure
    console.error("[AuditLog] Failed to record event:", err);
  }
}
