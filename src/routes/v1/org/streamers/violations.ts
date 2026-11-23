import Elysia from "elysia";
import { auth } from "@/core/auth";
import { authorizeStreamer } from "@/core/org";
import { OrgPerm, StreamerPerm } from "@/consts/permission";
import { ViolationTargetType } from "@/db/enums";
import { getTargetViolations, violationResponseSchema } from "@/utils/violation";
import { streamerParamsSchema, standardErrors } from "./schemas";

export const endpoint = new Elysia()
  .use(auth)
  .get(
    "/:orgId/streamers/:streamerId/violations",
    async ({ getAuthenticatedUser, params, set }) => {
      const user = await getAuthenticatedUser();
      const ctx = await authorizeStreamer(
        params.orgId,
        params.streamerId,
        BigInt(user.data.id),
        {
          requiredOrgPerm: OrgPerm.STREAMER_VIEW,
          requiredStreamerPerm: StreamerPerm.STREAMER_VIEW,
          actionDescription: "view streamer violations",
          allowOnViolation: true,
        },
        set,
      );
      if (typeof ctx === "string") return ctx;

      return getTargetViolations(ViolationTargetType.STREAMER, ctx.streamerId);
    },
    {
      params: streamerParamsSchema,
      response: {
        200: violationResponseSchema,
        ...standardErrors,
      },
      detail: {
        tags: ["Streamer Channels"],
        summary: "Get streamer violations",
        description: "Returns the highest violation level and list of violations for the specified streamer channel.",
      },
    },
  );

export default endpoint;
