import Elysia, { t } from "elysia";
import { Me } from "@/classes/me";
import { isValidUri } from "@/utils/regex";

/**
 * GET endpoint to check if a specific URI exists/has an owner.
 */
export const endpoint = new Elysia().get(
  "/:uri",
  async ({ params, set }) => {
    const parsedUri = String(params.uri ?? "")
      .trim()
      .toLowerCase();
    if (!parsedUri || parsedUri.length >= 50 || !isValidUri(parsedUri)) {
      set.status = "Bad Request";
      return "Bad Request";
    }
    if (await Me.getURIOwner(parsedUri)) return "OK";
    set.status = "Not Found";
    return "Not Found";
  },
  {
    detail: {
      tags: ["Public Profiles"],
      summary: "Check if a creator URI exists",
      description:
        "Checks if a custom URI handle (e.g. `ponlponl`) exists and is claimed by an active user. Returns `200 OK` if the handle has an owner, or `404 Not Found` if it is unclaimed or available.",
    },
    params: t.Object({
      uri: t.String({
        description: "The custom handle or slug to check.",
        examples: ["ponlponl"],
      }),
    }),
    response: {
      200: t.String({
        description: "Handle exists and is owned by a creator.",
        examples: ["OK"],
      }),
      404: t.String({
        description: "Handle does not exist or is unclaimed.",
        examples: ["Not Found"],
      }),
    },
  },
);

export default endpoint;
