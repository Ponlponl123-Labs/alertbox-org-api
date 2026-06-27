import Elysia from "elysia";
import { Connections } from "@/types/account.types";
import { auth } from "@/core/auth";
import { integrationSelect } from "@/consts/session";

/**
 * GET endpoint to retrieve the third-party connections/integration secrets for the user.
 */
export const endpoint = new Elysia()
  .use(auth)
  .get(
    "/",
    async ({ getAuthenticatedUser }) => {
      const user = await getAuthenticatedUser(integrationSelect);
      const integration = user.data.integration;

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
    }
  );

export default endpoint;
