import Elysia, { t } from "elysia";
import { orgContext } from "@/core/org";
import { sessionUserSelect } from "@/consts/session";
import { db } from "@/db";
import { checkRateLimit } from "@/utils/rate-limit";
import { sanitizeDiscordText, sendDiscordWebhook } from "@/utils/discord-webhook";

export const endpoint = new Elysia()
  .use(orgContext)
  .post(
    "/feedback",
    async ({ getAuthenticatedUser, body, request, set }) => {
      const user = await getAuthenticatedUser(sessionUserSelect);
      const rl = await checkRateLimit(`me:feedback:${String(user.data.id)}`, 5, 300);
      if (!rl.allowed) {
        set.status = 429;
        set.headers["Retry-After"] = String(rl.retryAfterSec);
        return "Too many feedback submissions. Please wait and try again.";
      }

      const message = String(body.message ?? "").trim().slice(0, 2000);
      const pathname = String(body.pathname ?? "").trim().slice(0, 512);
      const rating =
        typeof body.rating === "number" && Number.isInteger(body.rating)
          ? Math.min(5, Math.max(1, body.rating))
          : null;
      const reasons = Array.isArray(body.reasons)
        ? body.reasons
            .map((r) => String(r).trim().slice(0, 64))
            .filter(Boolean)
            .slice(0, 10)
        : [];

      if (!message && rating === null) {
        set.status = "Bad Request";
        return "Feedback message or rating is required";
      }

      const userAgent = (request.headers.get("user-agent") || "").slice(0, 512) || null;

      await db
        .insertInto("UserFeedback")
        .values({
          userId: Number(user.data.id),
          rating,
          reasons: reasons.length > 0 ? JSON.stringify(reasons) : null,
          message,
          pathname: pathname || "/app",
          userAgent,
        })
        .execute();

      const webhookUrl =
        process.env.DISCORD_NOTIFY_WEBHOOK_FEEDBACK ||
        process.env.DISCORD_FEEDBACK_WEBHOOK ||
        process.env.DISCORD_NOTIFY_WEBHOOK;

      if (webhookUrl) {
        const displayName =
          user.data.displayName || user.data.name || user.data.email || `User #${String(user.data.id)}`;
        void sendDiscordWebhook(webhookUrl, {
          username: "Alertbox Feedback",
          embeds: [
            {
              title: "New User Feedback",
              color: 0x3b82f6,
              fields: [
                {
                  name: "User",
                  value: sanitizeDiscordText(`${displayName} (ID: ${String(user.data.id)}, ${user.data.email})`, 256),
                },
                ...(rating !== null
                  ? [{ name: "Rating", value: `${rating}/5`, inline: true }]
                  : []),
                {
                  name: "Pathname",
                  value: sanitizeDiscordText(pathname || "/app", 256),
                  inline: true,
                },
                ...(reasons.length > 0
                  ? [{ name: "Reasons", value: sanitizeDiscordText(reasons.join(", "), 512) }]
                  : []),
                {
                  name: "Message",
                  value: sanitizeDiscordText(message || "(no note)", 1024),
                },
                ...(userAgent
                  ? [{ name: "User-Agent", value: sanitizeDiscordText(userAgent, 512) }]
                  : []),
              ],
              timestamp: new Date().toISOString(),
            },
          ],
        });
      }

      return { ok: true };
    },
    {
      detail: {
        tags: ["User Account"],
        summary: "Submit user feedback",
        description: "Stores authenticated user feedback in the database and forwards it to Discord webhook if configured.",
      },
      body: t.Object({
        message: t.Optional(t.String({ maxLength: 2000 })),
        pathname: t.String({ minLength: 1, maxLength: 512 }),
        rating: t.Optional(t.Integer({ minimum: 1, maximum: 5 })),
        reasons: t.Optional(t.Array(t.String({ maxLength: 64 }), { maxItems: 10 })),
      }),
      response: {
        200: t.Object({ ok: t.Boolean() }),
        400: t.String(),
        429: t.String(),
      },
    },
  );

export default endpoint;
