import Elysia, { t } from "elysia";
import { isValidUri } from "@/utils/regex";
import { auth } from "@/core/auth";

/**
 * PATCH endpoint to update/register the custom URI for the profile.
 * Subject to cooldown and availability checks.
 */
export const endpoint = new Elysia()
  .use(auth)
  .patch(
    "/",
    async ({ getAuthenticatedUser, body, set }) => {
      const parsedUri = String(body ?? "")
        .trim()
        .toLowerCase();
      if (!parsedUri || parsedUri.length >= 50 || !isValidUri(parsedUri)) {
        set.status = "Bad Request";
        return "Bad Request";
      }

      const user = await getAuthenticatedUser({
        profile: {
          select: {
            uriCooldownEnd: true,
          }
        }
      });

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
      body: t.String(),
    },
  );

export default endpoint;
