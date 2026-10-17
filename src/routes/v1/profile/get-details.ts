import Elysia, { t } from "elysia";
import { prisma } from "@/core/prisma";
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
      } catch {}
    }

    const streamer = await prisma.client.streamer.findUnique({
      where: { id: targetStreamerId },
      include: {
        integration: true,
        organization: true,
      },
    });

    if (!streamer || streamer.deletedAt || streamer.organization?.deletedAt) {
      set.status = "Not Found";
      return "Not Found";
    }

    if (!streamer.publishedAt) {
      set.status = "Forbidden";
      return "Forbidden";
    }

    // Exclude internal database identifiers from the returned public profile
    const { id: _, orgId: __, ...publicProfile } = streamer;

    // Build safe public integrations — NEVER expose secrets
    const integration = streamer.integration;
    const integrations = {
      stripe: !!integration?.stripeSecret,
      xendit: !!integration?.xenditSecret,
      omise: false,
      "2c2p": false,
      feelfreepay: !!integration?.ffpSecret,
      kofi: !!integration?.kofiSecret,
      bmac: !!integration?.bmacSecret,
    };

    const result = {
      ...publicProfile,
      kofiUsername: integration?.kofiUsername ?? null,
      bmacUsername: integration?.bmacUsername ?? null,
      integrations,
    };

    void redis.redis.setex(cacheKey, 3600, JSON.stringify(result)).catch(() => {});
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
