import Elysia, { t } from "elysia";
import { Connections } from "@/types/account.types";
import { isBearerToken } from "@/utils/bearer-token";
import { Me } from "@/classes/me";
import { ip } from "elysia-ip";
import { integrationSelect } from "@/consts/session";

/**
 * GET endpoint to retrieve the third-party connections/integration secrets for the user.
 */
export const endpoint = new Elysia().use(ip()).get(
  "/",
  async ({ headers, set, ip }) => {
    const auth = isBearerToken(headers.authorization);
    if (!auth) {
      set.status = "Bad Request";
      return "Bad Request";
    }
    const user = await new Me({ cache: false }).use(
      auth,
      ip,
      integrationSelect,
    );
    if (!user || !user.data) {
      set.status = "Unauthorized";
      return "Unauthorized";
    }

    const integration = user.data.integration;

    return {
      stripe: integration?.stripeSecret ?? null,
      bmac: integration?.bmacSecret ?? null,
      kofi: integration?.kofiSecret ?? null,
      xendit: integration?.xenditSecret ?? null,
      ffp: integration?.ffpSecret ?? null,
      youtube: null,
      facebook: null,
      twitch: null,
      patreon: null,
      streamlabs: integration?.streamlabsSecret ? true : false,
    } as Connections;
  },
  {
    headers: t.Object({
      authorization: t.String(),
    }),
  },
);

export default endpoint;
