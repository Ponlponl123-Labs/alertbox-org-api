import Elysia, { t } from "elysia";
import { ChannelNameRegistry } from "@/classes/streamer/channel-name";

export const endpoint = new Elysia().get(
  "/streamers/check-username/:name",
  async ({ params, set }) => {
    const result = await ChannelNameRegistry.checkAvailability(params.name);
    if (!result.available) {
      if (result.status === "invalid") {
        set.status = "Bad Request";
        return { available: false, reason: "invalid" };
      }
      if (result.status === "reserved") {
        set.status = "Forbidden";
        return { available: false, reason: "reserved" };
      }
      set.status = "Conflict";
      return { available: false, reason: "taken" };
    }
    return { available: true };
  },
  {
    detail: {
      tags: ["Organizations"],
      summary: "Check streamer channel username availability",
      description: "Fast cache-first check to verify if a streamer channel username is available.",
    },
    params: t.Object({
      name: t.String({ maxLength: 64 }),
    }),
  },
);

export default endpoint;
