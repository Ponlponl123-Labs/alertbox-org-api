import Elysia, { t } from "elysia";
import { auth } from "@/core/auth";
import { prisma } from "@/core/prisma";
import { redis } from "@/core/redis";
import { OrgPerm } from "@/consts/permission";
import { authorizeOrg } from "@/core/org";
import { logOrgAudit } from "@/core/audit";
import { processAvatar, processBanner } from "@/utils/image";
import { saveProfileImage, deleteProfileImage } from "@/utils/storage";
import { updateOrgCache } from "@/utils/cache-sync";
import { Moderation } from "@/classes/moderation";
import { nanoid } from "nanoid";

export const endpoint = new Elysia()
  .use(auth)
  .patch(
    "/:orgId",
    async ({ getAuthenticatedUser, params, body, set }) => {
      const user = await getAuthenticatedUser();
      const authRes = await authorizeOrg(params.orgId, user.data.id, OrgPerm.ORG_MANAGE, set, "manage organization settings");
      if (typeof authRes === "string") return authRes;
      const { orgId } = authRes;

      const org = await prisma.client.organization.findUnique({
        where: { id: orgId },
      });

      if (!org || org.deletedAt) {
        set.status = "Not Found";
        return "Organization not found";
      }

      const data: any = {};
      if (body.name?.trim()) data.name = body.name.trim().slice(0, 100);

      // Handle avatar file upload or removal
      if (body.avatar) {
        if (typeof (body.avatar as any).arrayBuffer === "function") {
          const buf = Buffer.from(await (body.avatar as any).arrayBuffer());
          const check = await Moderation.moderateImage(buf);
          if (check.flagged) {
            set.status = "Unavailable For Legal Reasons";
            return "Avatar contains inappropriate or NSFW content";
          }
          try {
            const processed = await processAvatar(buf);
            const { url } = await saveProfileImage(String(orgId), "avatar", nanoid(), processed.buffer);
            if (org.avatar) {
              await deleteProfileImage(org.avatar).catch(() => {});
            }
            data.avatar = url;
          } catch {}
        } else if (typeof body.avatar === "string") {
          data.avatar = body.avatar;
        }
      } else if (body.avatar === null) {
        if (org.avatar) {
          await deleteProfileImage(org.avatar).catch(() => {});
        }
        data.avatar = null;
      }

      // Handle banner file upload or removal
      if (body.banner) {
        if (typeof (body.banner as any).arrayBuffer === "function") {
          const buf = Buffer.from(await (body.banner as any).arrayBuffer());
          const check = await Moderation.moderateImage(buf);
          if (check.flagged) {
            set.status = "Unavailable For Legal Reasons";
            return "Banner contains inappropriate or NSFW content";
          }
          try {
            const processed = await processBanner(buf);
            const { url } = await saveProfileImage(String(orgId), "banner", nanoid(), processed.buffer);
            if (org.banner) {
              await deleteProfileImage(org.banner).catch(() => {});
            }
            data.banner = url;
          } catch {}
        } else if (typeof body.banner === "string") {
          data.banner = body.banner;
        }
      } else if (body.banner === null) {
        if (org.banner) {
          await deleteProfileImage(org.banner).catch(() => {});
        }
        data.banner = null;
      }

      const updated = await prisma.client.organization.update({
        where: { id: orgId },
        data,
      });

      const members = await prisma.client.organizationMember.findMany({
        where: { orgId },
        select: { userId: true },
      });

      await updateOrgCache(
        {
          id: updated.id,
          type: updated.type,
          name: updated.name,
          slug: updated.slug,
          avatar: updated.avatar,
          banner: updated.banner,
          ownerId: updated.ownerId,
          createdAt: updated.createdAt,
        },
        members.map((m) => m.userId),
      );

      await logOrgAudit({
        orgId,
        userId: user.data.id,
        action: "ORG_SETTINGS_UPDATED",
        targetType: "ORGANIZATION",
        targetId: orgId,
        payload: {
          name: updated.name,
          slug: updated.slug,
          changedFields: Object.keys(data),
          changes: Object.fromEntries(
            Object.keys(data).map((k) => [
              k,
              {
                from: (org as any)[k] !== undefined ? ((org as any)[k] ?? null) : null,
                to: (updated as any)[k] !== undefined ? ((updated as any)[k] ?? null) : null,
              },
            ]),
          ),
        },
      });

      return {
        id: String(updated.id),
        type: updated.type,
        name: updated.name,
        slug: updated.slug,
        avatar: updated.avatar,
        banner: updated.banner,
      };
    },
    {
      detail: {
        tags: ["Organizations"],
        summary: "Update organization settings",
        description: "Updates organization name, avatar, or banner. Requires MANAGE_SETTINGS permission.",
      },
      body: t.Object({
        name: t.Optional(t.String({ minLength: 2, maxLength: 100 })),
        avatar: t.Optional(
          t.Union([
            t.File({
              maxSize: "5m",
              type: ["image/png", "image/jpeg", "image/webp"],
            }),
            t.Nullable(t.String()),
          ]),
        ),
        banner: t.Optional(
          t.Union([
            t.File({
              maxSize: "10m",
              type: ["image/png", "image/jpeg", "image/webp"],
            }),
            t.Nullable(t.String()),
          ]),
        ),
      }),
    },
  );

export default endpoint;
