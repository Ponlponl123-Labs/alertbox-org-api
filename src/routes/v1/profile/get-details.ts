import Elysia, { t } from "elysia";
import { Me } from "@/classes/me";
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
    const owner = await Me.getURIOwner(parsedUri);
    if (!owner) {
      set.status = "Not Found";
      return "Not Found";
    }

    const user = await new Me().load(owner, {
      profile: true,
      integration: true,
      disabledAt: true,
      deletedAt: true,
    });

    if (!user || !user.data || !user.data.profile) {
      set.status = "Not Found";
      return "Not Found";
    }

    if (!user.data.profile.publishedAt || user.data.disabledAt || user.data.deletedAt) {
      set.status = "Forbidden";
      return "Forbidden";
    }

    // Exclude internal database identifiers from the returned public profile
    const { userId: _, id: __, ...publicProfile } = user.data.profile;

    // Build safe public integrations — NEVER expose secrets
    const integration = user.data.integration;
    const integrations = {
      stripe: !!integration?.stripeSecret,
      xendit: !!integration?.xenditSecret,
      omise: false,
      "2c2p": false,
      feelfreepay: !!integration?.ffpSecret,
      kofi: !!integration?.kofiSecret,
      bmac: !!integration?.bmacSecret,
    };

    return {
      ...publicProfile,
      kofiUsername: integration?.kofiUsername ?? null,
      bmacUsername: integration?.bmacUsername ?? null,
      integrations,
    };
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
          description: "Invalid URI format.",
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
        description: "Creator's registered custom handle.",
        examples: ["ponlponl123"],
      }),
    }),
  },
);

export default endpoint;
