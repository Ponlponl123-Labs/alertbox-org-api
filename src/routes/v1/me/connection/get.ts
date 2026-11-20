import Elysia, { t } from "elysia";
import { orgContext, requireOrgPermission } from "@/core/org";
import { OrgPerm } from "@/consts/permission";
import { db } from "@/db";

/**
 * GET endpoint to retrieve the third-party connections/integration secrets for the active streamer.
 */
export const endpoint = new Elysia()
  .use(orgContext)
  .get(
    "/",
    async ({ org, set }) => {
      if (!org) {
        set.status = "Forbidden";
        return "No active organization found";
      }
      if (!requireOrgPermission(org, OrgPerm.INTEGRATION_VIEW)) {
        set.status = "Forbidden";
        return "Insufficient permissions to view integrations";
      }

      const isOwnerOrAdmin = org.role === "OWNER" || org.role === "ADMIN";
      const canManage = isOwnerOrAdmin || requireOrgPermission(org, OrgPerm.INTEGRATION_MANAGE);

      const mask = (secret: string | null | undefined) => {
        if (!secret) return null;
        if (canManage) return secret;
        return "••••••••";
      };

      const integrations = await db
        .selectFrom("Integration")
        .select(["type", "secret", "username", "disabledAt", "options"])
        .where("streamerId", "=", Number(org.streamerId))
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
      } as any;
    },
    {
      detail: {
        tags: ["Payment Connections"],
        summary: "List connected payment integrations",
        description:
          "Retrieves active integration status and configuration for payment providers (Stripe, Ko-fi, Buy Me a Coffee, FeelFreePay, Streamlabs). Masked or non-sensitive fields are returned to configure provider settings in the creator dashboard.",
      },
      response: {
        200: t.Object(
          {
            stripe: t.Nullable(
              t.String({
                description: "Stripe API restricted key or webhook secret.",
              }),
            ),
            bmac: t.Nullable(
              t.Object({
                username: t.String({
                  description: "Buy Me a Coffee creator username.",
                }),
                secret: t.String({ description: "BMAC webhook secret." }),
              }),
            ),
            kofi: t.Nullable(
              t.Object({
                username: t.String({ description: "Ko-fi creator username." }),
                secret: t.String({
                  description: "Ko-fi verification token.",
                }),
              }),
            ),
            xendit: t.Nullable(t.String()),
            ffp: t.Nullable(
              t.String({ description: "FeelFreePay API key." }),
            ),
            streamlabs: t.Boolean({
              description: "Whether Streamlabs relay is connected.",
            }),
          },
          { description: "Current integration configurations." },
        ),
        403: t.String({ description: "Forbidden" }),
      },
    },
  );

export default endpoint;
