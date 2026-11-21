import Elysia, { t } from "elysia";
import { ChannelNameRegistry } from "@/classes/streamer/channel-name";

export const endpoint = new Elysia().get(
  "/streamers/check-username/:name",
  async ({ params, set }) => {
    const result = await ChannelNameRegistry.checkAvailability(params.name);
    if (!result.available) {
      if (result.status === "invalid") {
        set.status = "Bad Request";
        return { available: false, reason: "invalid" as const };
      }
      if (result.status === "reserved") {
        set.status = "Forbidden";
        return { available: false, reason: "reserved" as const };
      }
      set.status = "Conflict";
      return { available: false, reason: "taken" as const };
    }
    return { available: true };
  },
  {
    detail: {
      tags: ["Streamers"],
      summary: "Check streamer channel username availability",
      description: "Fast cache-first check to verify if a streamer channel username is available.",
    },
    params: t.Object({
      name: t.String({
        maxLength: 64,
        description: "Candidate username or channel handle to test",
        examples: ["cool_creator"],
      }),
    }),
    response: {
      200: t.Object({
        available: t.Boolean({ description: "True if channel handle is available to claim", examples: [true] }),
      }, { description: "Username is available" }),
      400: t.Object({
        available: t.Boolean({ examples: [false] }),
        reason: t.String({ description: "Failure reason code", examples: ["invalid"] }),
      }, { description: "Bad Request: Username format is invalid" }),
      403: t.Object({
        available: t.Boolean({ examples: [false] }),
        reason: t.String({ description: "Failure reason code", examples: ["reserved"] }),
      }, { description: "Forbidden: Username is reserved" }),
      409: t.Object({
        available: t.Boolean({ examples: [false] }),
        reason: t.String({ description: "Failure reason code", examples: ["taken"] }),
      }, { description: "Conflict: Username is already taken" }),
    },
  },
);

export default endpoint;
