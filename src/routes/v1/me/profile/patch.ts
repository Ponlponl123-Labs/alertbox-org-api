import Elysia, { t } from "elysia";
import { isValidUri } from "@/utils/regex";
import { orgContext, requireOrgPermission } from "@/core/org";
import { OrgPerm } from "@/consts/permission";
import { registerURI } from "@/classes/streamer";
import { prisma } from "@/core/prisma";

/**
 * PATCH endpoint to update/register the custom URI for the active streamer profile.
 * Subject to cooldown and availability checks.
 */
export const endpoint = new Elysia()
  .use(orgContext)
  .patch(
    "/",
    async ({ org, headers, body, set }) => {
      if (!org) {
        set.status = "Unauthorized";
        return "Unauthorized";
      }
      if (!requireOrgPermission(org, OrgPerm.STREAMER_MANAGE)) {
        set.status = "Forbidden";
        return "Insufficient permissions to edit streamer profile";
      }

      const parsedUri = String(body ?? "")
        .trim()
        .toLowerCase();
      if (!parsedUri || parsedUri.length >= 50 || !isValidUri(parsedUri)) {
        set.status = "Bad Request";
        return "Bad Request";
      }

      const streamer = await prisma.client.streamer.findUnique({
        where: { id: org.streamerId },
        select: { uriCooldownEnd: true },
      });

      const now = Date.now();
      const cooldown =
        streamer?.uriCooldownEnd && new Date(streamer.uriCooldownEnd);
      if (cooldown && cooldown.getTime() > now) {
        set.status = "Too Many Requests";
        return "Please retry again after " + cooldown.getTime();
      }

      const token = headers.authorization ? headers.authorization.replace(/^Bearer\s+/i, "") : "";
      const success = await registerURI(org.streamerId, parsedUri, token);

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
        pattern: "^[a-z0-9_]+$",
        minLength: 1,
        maxLength: 49,
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
