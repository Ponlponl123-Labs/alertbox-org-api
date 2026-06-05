import Elysia, { t } from "elysia";
import { Me } from "@/classes/me";
import { isValidUri } from "@/utils/regex";
import { isBearerToken } from "@/utils/bearer-token";
import { ip } from "elysia-ip";

/**
 * PATCH endpoint to update/register the custom URI for the profile.
 * Subject to cooldown and availability checks.
 */
export const endpoint = new Elysia()
  .use(ip())
  .patch(
    "/",
    async ({ headers, set, ip, body }) => {
      const parsedUri = String(body ?? "")
        .trim()
        .toLowerCase();
      if (!parsedUri || parsedUri.length >= 50 || !isValidUri(parsedUri)) {
        set.status = "Bad Request";
        return "Bad Request";
      }

      const authToken = isBearerToken(headers.authorization);
      if (!authToken) {
        set.status = "Bad Request";
        return "Bad Request";
      }

      const user = await new Me().use(authToken, ip, {
        profile: {
          select: {
            uriCooldownEnd: true,
          }
        }
      });
      if (!user || !user.data) {
        set.status = "Unauthorized";
        return "Unauthorized";
      }

      const now = Date.now();
      const cooldown =
        user.data.profile?.uriCooldownEnd && new Date(user.data.profile.uriCooldownEnd);
      if (cooldown && cooldown.getTime() > now) {
        set.status = "Too Many Requests";
        return "Please retry again after " + cooldown.getTime();
      }

      const success = await user.profile.registerURI(parsedUri);

      if (!success) {
        set.status = "Forbidden";
        return "URI has been registered or is invalid";
      }

      return "OK";
    },
    {
      headers: t.Object({
        authorization: t.String(),
      }),
      body: t.String(),
    },
  );

export default endpoint;
