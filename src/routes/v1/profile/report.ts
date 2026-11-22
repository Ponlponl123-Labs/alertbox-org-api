import Elysia, { t } from "elysia";
import { ip } from "elysia-ip";
import { db } from "@/db";
import { Streamer } from "@/classes/streamer";
import { isValidUri } from "@/utils/regex";
import { checkRateLimit } from "@/utils/rate-limit";
import { validateEmailWithMx } from "@/utils/email";
import { sanitizeDiscordText, sendDiscordWebhook } from "@/utils/discord-webhook";

export const REPORT_TOPICS = [
  "INAPPROPRIATE_CONTENT",
  "IMPERSONATION",
  "FRAUD_SCAM",
  "HARASSMENT",
  "SPAM",
  "OTHER",
] as const;

export const endpoint = new Elysia()
  .use(ip({ headersFirst: true }))
  .post(
    "/:uri/report",
    async ({ params, body, request, ip: clientIp, set }) => {
      const parsedUri = String(params.uri ?? "")
        .trim()
        .toLowerCase();
      if (!parsedUri || parsedUri.length >= 50 || !isValidUri(parsedUri)) {
        set.status = "Bad Request";
        return "Invalid streamer handle";
      }

      const ipKey = clientIp || "unknown";
      const [ipLimit, targetLimit] = await Promise.all([
        checkRateLimit(`profile:report:ip:${ipKey}`, 3, 600),
        checkRateLimit(`profile:report:target:${ipKey}:${parsedUri}`, 1, 300),
      ]);

      if (!ipLimit.allowed || !targetLimit.allowed) {
        set.status = 429;
        const retryAfter = Math.max(ipLimit.retryAfterSec, targetLimit.retryAfterSec);
        set.headers["Retry-After"] = String(retryAfter);
        return "Too many reports submitted. Please wait before trying again.";
      }

      const mxCheck = await validateEmailWithMx(body.email);
      if (!mxCheck.valid) {
        set.status = "Bad Request";
        return "Invalid or undeliverable email domain (no MX record found)";
      }

      const owner = await Streamer.getURIOwner(parsedUri);
      if (!owner) {
        set.status = "Not Found";
        return "Streamer not found";
      }

      let targetStreamerId: bigint;
      try {
        targetStreamerId = BigInt(owner);
      } catch {
        set.status = "Not Found";
        return "Streamer not found";
      }

      const streamerRow = await db
        .selectFrom("Streamer")
        .innerJoin("Organization", "Organization.id", "Streamer.orgId")
        .select([
          "Streamer.id as id",
          "Streamer.orgId as orgId",
          "Streamer.name as name",
          "Streamer.displayName as displayName",
          "Streamer.deletedAt as streamerDeletedAt",
          "Organization.deletedAt as orgDeletedAt",
        ])
        .where("Streamer.id", "=", Number(targetStreamerId))
        .executeTakeFirst();

      if (!streamerRow || streamerRow.streamerDeletedAt || streamerRow.orgDeletedAt) {
        set.status = "Not Found";
        return "Streamer not found";
      }

      const message = String(body.message ?? "").trim().slice(0, 2000);
      if (message.length < 10) {
        set.status = "Bad Request";
        return "Report message must be at least 10 characters";
      }

      const userAgent = (request.headers.get("user-agent") || "").slice(0, 512) || null;

      await db
        .insertInto("StreamerReport")
        .values({
          orgId: Number(streamerRow.orgId),
          streamerId: Number(streamerRow.id),
          topic: body.topic,
          message,
          reporterEmail: mxCheck.normalized,
          ipAddress: clientIp ? String(clientIp).slice(0, 64) : null,
          userAgent,
        })
        .execute();

      const webhookUrl =
        process.env.DISCORD_NOTIFY_WEBHOOK_REPORT ||
        process.env.DISCORD_REPORT_WEBHOOK ||
        process.env.DISCORD_NOTIFY_WEBHOOK;

      if (webhookUrl) {
        const streamerLabel = streamerRow.displayName || streamerRow.name;
        void sendDiscordWebhook(webhookUrl, {
          username: "Alertbox Safety",
          embeds: [
            {
              title: "New Streamer Report",
              color: 0xf43f5e,
              fields: [
                {
                  name: "Streamer",
                  value: sanitizeDiscordText(`${streamerLabel} (@${parsedUri}, ID: ${String(streamerRow.id)})`, 256),
                },
                {
                  name: "Topic",
                  value: body.topic,
                  inline: true,
                },
                {
                  name: "Reporter Email",
                  value: sanitizeDiscordText(mxCheck.normalized, 256),
                  inline: true,
                },
                {
                  name: "Message",
                  value: sanitizeDiscordText(message, 1024),
                },
                ...(clientIp
                  ? [{ name: "IP", value: sanitizeDiscordText(String(clientIp), 64), inline: true }]
                  : []),
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
        tags: ["Public Profiles"],
        summary: "Report a streamer profile",
        description: "Allows anonymous users to report a streamer profile with topic, message, and MX-validated email address.",
      },
      params: t.Object({
        uri: t.String({
          pattern: "^[a-z0-9_]+$",
          minLength: 1,
          maxLength: 49,
        }),
      }),
      body: t.Object({
        topic: t.Union(REPORT_TOPICS.map((topic) => t.Literal(topic))),
        message: t.String({ minLength: 10, maxLength: 2000 }),
        email: t.String({ format: "email", maxLength: 320 }),
      }),
      response: {
        200: t.Object({ ok: t.Boolean() }),
        400: t.String(),
        404: t.String(),
        429: t.String(),
      },
    },
  )
  .get(
    "/:uri/report/check-email",
    async ({ query, ip: clientIp, set }) => {
      const ipKey = clientIp || "unknown";
      const limit = await checkRateLimit(`profile:report:mx:${ipKey}`, 30, 60);
      if (!limit.allowed) {
        set.status = 429;
        set.headers["Retry-After"] = String(limit.retryAfterSec);
        return "Too many requests";
      }
      const res = await validateEmailWithMx(query.email);
      return { valid: res.valid };
    },
    {
      detail: {
        tags: ["Public Profiles"],
        summary: "Validate email domain MX record for streamer report",
      },
      params: t.Object({
        uri: t.String({ pattern: "^[a-z0-9_]+$", minLength: 1, maxLength: 49 }),
      }),
      query: t.Object({
        email: t.String({ minLength: 3, maxLength: 320 }),
      }),
      response: {
        200: t.Object({ valid: t.Boolean() }),
        429: t.String(),
      },
    },
  );

export default endpoint;
