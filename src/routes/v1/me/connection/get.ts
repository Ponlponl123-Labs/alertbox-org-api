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

      const integration = await db
        .selectFrom("Integration")
        .select([
          "stripeSecret",
          "bmacSecret",
          "bmacUsername",
          "kofiSecret",
          "kofiUsername",
          "xenditSecret",
          "ffpSecret",
          "streamlabsSecret",
        ])
        .where("streamerId", "=", Number(org.streamerId))
        .executeTakeFirst();

      return {
        stripe: integration?.stripeSecret ?? null,
        bmac: integration?.bmacSecret
          ? {
            username: integration.bmacUsername ?? "",
            secret: integration.bmacSecret,
          }
          : null,
        kofi: integration?.kofiSecret
          ? {
            username: integration.kofiUsername ?? "",
            secret: integration.kofiSecret,
          }
          : null,
        xendit: integration?.xenditSecret ?? null,
        ffp: integration?.ffpSecret ?? null,
        youtube: null,
        facebook: null,
        twitch: null,
        patreon: null,
        streamlabs: integration?.streamlabsSecret ? true : false,
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
      },
    },
  );

export default endpoint;
