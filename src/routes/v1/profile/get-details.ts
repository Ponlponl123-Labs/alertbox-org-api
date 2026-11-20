import Elysia, { t } from "elysia";
import { db } from "@/db";
import { redis } from "@/core/redis";
import { Streamer } from "@/classes/streamer";
import { isValidUri } from "@/utils/regex";

/**
 * GET endpoint to retrieve the public profile details by URI.
 */
export const endpoint = new Elysia().get(
  "/:uri/details",
  async ({ params, set }) => {
    set.headers["Cache-Control"] = "no-store, no-cache, must-revalidate";

    const parsedUri = String(params.uri ?? "")
      .trim()
      .toLowerCase();
    if (!parsedUri || parsedUri.length >= 50 || !isValidUri(parsedUri)) {
      set.status = "Bad Request";
      return "Bad Request";
    }
    const owner = await Streamer.getURIOwner(parsedUri);
    if (!owner) {
      set.status = "Not Found";
      return "Not Found";
    }

    let targetStreamerId: bigint;
    try {
      targetStreamerId = BigInt(owner);
    } catch {
      set.status = "Not Found";
      return "Not Found";
    }

    const cacheKey = `streamer:${String(targetStreamerId)}:public_details`;
    const cached = await redis.redis.get(cacheKey).catch(() => null);
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch { }
    }

    const numId = Number(targetStreamerId);
    const [streamerRow, integrations] = await Promise.all([
      db
        .selectFrom("Streamer")
        .innerJoin("Organization", "Organization.id", "Streamer.orgId")
        .select([
          "Streamer.name as name",
          "Streamer.displayName as displayName",
          "Streamer.avatar as avatar",
          "Streamer.banner as banner",
          "Streamer.bio as bio",
          "Streamer.uri as uri",
          "Streamer.accentColor as accentColor",
          "Streamer.currency as currency",
          "Streamer.minTipAmount as minTipAmount",
          "Streamer.maxTipAmount as maxTipAmount",
          "Streamer.defaultDonorName as defaultDonorName",
          "Streamer.defaultDonorAmount as defaultDonorAmount",
          "Streamer.defaultDonorAvatar as defaultDonorAvatar",
          "Streamer.isDonorCanCustomAvatar as isDonorCanCustomAvatar",
          "Streamer.options as options",
          "Streamer.badges as badges",
          "Streamer.twitch as twitch",
          "Streamer.youtube as youtube",
          "Streamer.twitter as twitter",
          "Streamer.facebook as facebook",
          "Streamer.reddit as reddit",
          "Streamer.discord as discord",
          "Streamer.publishedAt as publishedAt",
          "Streamer.deletedAt as streamerDeletedAt",
          "Streamer.createdAt as createdAt",
          "Streamer.updatedAt as updatedAt",
          "Organization.deletedAt as orgDeletedAt",
        ])
        .where("Streamer.id", "=", numId)
        .executeTakeFirst(),
      db
        .selectFrom("Integration")
        .select(["type", "secret", "username", "disabledAt"])
        .where("streamerId", "=", numId)
        .where("deletedAt", "is", null)
        .execute(),
    ]);

    if (!streamerRow || streamerRow.streamerDeletedAt || streamerRow.orgDeletedAt) {
      set.status = "Not Found";
      return "Not Found";
    }

    if (!streamerRow.publishedAt) {
      set.status = "Forbidden";
      return "Forbidden";
    }

    const byType = new Map(integrations.map((i) => [i.type, i]));
    const stripe = byType.get("STRIPE");
    const xendit = byType.get("XENDIT");
    const ffp = byType.get("FEELFREEPAY");
    const kofi = byType.get("KOFI");
    const bmac = byType.get("BUYMEACOFFEE");

    const {
      streamerDeletedAt,
      orgDeletedAt,
      ...publicProfile
    } = streamerRow;

    const integrationsMap = {
      stripe: Boolean(stripe?.secret && !stripe.disabledAt),
      xendit: Boolean(xendit?.secret && !xendit.disabledAt),
      omise: false,
      "2c2p": false,
      feelfreepay: Boolean(ffp?.secret && !ffp.disabledAt),
      kofi: Boolean(kofi?.secret && !kofi.disabledAt),
      bmac: Boolean(bmac?.secret && !bmac.disabledAt),
    };

    const result = {
      ...publicProfile,
      kofiUsername: kofi?.username ?? null,
      bmacUsername: bmac?.username ?? null,
      integrations: integrationsMap,
    };

    void redis.redis.setex(cacheKey, 3600, JSON.stringify(result)).catch(() => { });
    return result;
  },
  {
    detail: {
      tags: ["Public Profiles"],
      summary: "Get public creator tipping profile",
      description:
        "Fetches the public profile information for a creator's tipping page (e.g. `tip-to.me/@ponlponl123`). Returns public fields (display name, bio, accent color, avatar/banner URLs, social links) and a sanitized map of enabled payment providers (`stripe`, `kofi`, `bmac`, `feelfreepay`) with zero sensitive secrets exposed.",
      responses: {
        200: {
          description: "Public tipping page metadata.",
        },
        400: {
          description: "Malformed URI parameter.",
        },
        403: {
          description: "Creator profile is unpublished or disabled.",
        },
        404: {
          description: "Creator profile not found.",
        },
      },
    },
    params: t.Object({
      uri: t.String({
        pattern: "^[a-z0-9_]+$",
        minLength: 1,
        maxLength: 49,
        description: "The custom handle or slug of the creator.",
        examples: ["ponlponl123"],
      }),
    }),
  },
);

export default endpoint;
