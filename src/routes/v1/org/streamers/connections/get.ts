import Elysia from "elysia";
import { auth } from "@/core/auth";
import { db } from "@/db";
import { OrgPerm, StreamerPerm } from "@/consts/permission";
import { authorizeStreamer } from "@/core/org";

export const endpoint = new Elysia()
  .use(auth)
  .get(
    "/:orgId/streamers/:streamerId/connections",
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
        .where("streamerId", "=", Number(streamerId))
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
      };
    },
    {
      detail: {
        tags: ["Organizations"],
        summary: "Get streamer channel connections",
        description: "Returns connected payment providers and triggers for a specific streamer channel.",
      },
    },
  );

export default endpoint;
