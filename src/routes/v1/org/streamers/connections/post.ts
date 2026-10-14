import Elysia, { t } from "elysia";
import { auth } from "@/core/auth";
import { prisma } from "@/core/prisma";
import { hasPermission, OrgPerm } from "@/utils/rbac";
import { resolveOrgId, resolveStreamerId } from "@/core/org";
import {
  resolveProvider,
  allowed_user_update_providers,
  setConnection,
} from "@/classes/streamer";

export const endpoint = new Elysia()
  .use(auth)
  .post(
    "/:orgId/streamers/:streamerId/connections/:provider",
    async ({ getAuthenticatedUser, params, body, set }) => {
      const user = await getAuthenticatedUser();
      const orgId = await resolveOrgId(params.orgId);
      if (!orgId) {
        set.status = "Bad Request";
        return "Invalid organization or streamer ID";
      }
      const streamerId = await resolveStreamerId(orgId, params.streamerId);
      if (!streamerId) {
        set.status = "Bad Request";
        return "Invalid organization or streamer ID";
      }

      const member = await prisma.client.organizationMember.findUnique({
        where: { orgId_userId: { orgId, userId: user.data.id } },
      });

      if (!member || !hasPermission(member.permissions, OrgPerm.MANAGE_INTEGRATIONS)) {
        set.status = "Forbidden";
        return "Insufficient permissions to manage integrations";
      }

      const provider = resolveProvider(params.provider ?? "");
      if (!provider || !allowed_user_update_providers.includes(provider)) {
        set.status = "Bad Request";
        return "Not supported provider";
      }

      if (provider === "kofi" || provider === "buymeacoffee") {
        if (typeof body === "string" || !body.username || !body.secret) {
          set.status = "Bad Request";
          return "Username and secret are required for this provider";
        }
      }

      await setConnection(streamerId, orgId, provider, body as any);
      return "OK";
    },
    {
      detail: {
        tags: ["Organizations"],
        summary: "Set streamer channel connection",
        description: "Links or updates payment provider credentials for a streamer channel.",
      },
      body: t.Union([
        t.Object({
          username: t.Optional(t.Nullable(t.String())),
          secret: t.String(),
        }),
        t.String(),
      ]),
    },
  );

export default endpoint;
