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
      detail: {
        tags: ["Creator Profile"],
        summary: "Claim or change custom URI handle",
        description:
          "Registers a custom public tipping handle (e.g. `tip-to.me/@yourname`). Must be 1–50 alphanumeric characters or underscores. Once updated, a 30-day cooldown is enforced before the handle can be changed again.",
      },
      body: t.String({
        description:
          "New custom URI handle (1-50 chars, lowercase alphanumeric and underscores).",
        examples: ["ponlponl123"],
      }),
      response: {
        200: t.String({
          description: "URI successfully registered.",
          examples: ["OK"],
        }),
      },
    },
  );

export default endpoint;
