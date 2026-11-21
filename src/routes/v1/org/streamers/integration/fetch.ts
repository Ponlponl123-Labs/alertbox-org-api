import Elysia from "elysia";
import { auth } from "@/core/auth";
import { db } from "@/db";
import { OrgPerm, StreamerPerm } from "@/consts/permission";
import { authorizeStreamer } from "@/core/org";
import { hasPermission, hasStreamerPermission } from "@/utils/rbac";
import { integrationParamsSchema } from "./common";
import { streamerIntegrationsResponseSchema, standardErrors } from "../schemas";

export const fetchEndpoint = new Elysia()
  .use(auth)
  .get(
    "",
    async ({ getAuthenticatedUser, params, set }) => {
      const user = await getAuthenticatedUser();
      const authRes = await authorizeStreamer(
        params.orgId,
        params.streamerId,
        user.data.id,
        {
          requiredOrgPerm: OrgPerm.INTEGRATION_VIEW,
          requiredStreamerPerm: StreamerPerm.STREAMER_VIEW,
          actionDescription: "view streamer connections",
        },
        set,
      );
      if (typeof authRes === "string") return set.status === "Bad Request" ? "Invalid organization or streamer ID" : authRes;
      const { streamerId } = authRes;

      const isOwnerOrAdmin = authRes.role === "OWNER" || authRes.role === "ADMIN";
      const canManage = isOwnerOrAdmin || (hasPermission(authRes.permissions, OrgPerm.INTEGRATION_MANAGE) && hasStreamerPermission(authRes.streamerPermissions, StreamerPerm.STREAMER_INTEGRATION_MANAGE));

      const mask = (secret: string | null | undefined) => {
        if (!secret) return null;
        if (canManage && secret.length > 4) {
          return `••••${secret.slice(-4)}`;
        }
        return "••••••••";
      };

      const integrations = await db
        .selectFrom("Integration")
        .select(["type", "secret", "username", "disabledAt", "options"])
        .where("streamerId", "=", Number(streamerId))
        .where("deletedAt", "is", null)
        .execute();

      const byType = new Map(integrations.map((i) => [i.type, i]));
      const stripe = byType.get("STRIPE");
      const bmac = byType.get("BUYMEACOFFEE");
      const kofi = byType.get("KOFI");
      const xendit = byType.get("XENDIT");
      const ffp = byType.get("FEELFREEPAY");
      const streamlabs = byType.get("STREAMLABS");

      return {
        stripe: mask(stripe?.secret),
        bmac: bmac?.secret
          ? {
            username: bmac.username ?? "",
            secret: mask(bmac.secret)!,
          }
          : null,
        kofi: kofi?.secret
          ? {
            username: kofi.username ?? "",
            secret: mask(kofi.secret)!,
          }
          : null,
        xendit: mask(xendit?.secret),
        ffp: mask(ffp?.secret),
        youtube: null,
        facebook: null,
        twitch: null,
        patreon: null,
        streamlabs: streamlabs?.secret ? true : false,
        disabled: {
          stripe: Boolean(stripe?.disabledAt),
          bmac: Boolean(bmac?.disabledAt),
          buymeacoffee: Boolean(bmac?.disabledAt),
          kofi: Boolean(kofi?.disabledAt),
          xendit: Boolean(xendit?.disabledAt),
          ffp: Boolean(ffp?.disabledAt),
          feelfreepay: Boolean(ffp?.disabledAt),
          streamlabs: Boolean(streamlabs?.disabledAt),
        },
      };
    },
    {
      params: integrationParamsSchema,
      detail: {
        tags: ["Streamer Integrations"],
        summary: "Get streamer channel connections",
        description: "Returns connected payment providers and triggers for a specific streamer channel. Masks secrets for view-only callers.",
      },
      response: {
        200: streamerIntegrationsResponseSchema,
        ...standardErrors,
      },
    },
  );

export default fetchEndpoint;
