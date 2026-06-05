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
    params: t.Object({
      uri: t.String(),
    }),
  },
);

export default endpoint;
