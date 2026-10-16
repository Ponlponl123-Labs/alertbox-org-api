import Elysia, { t } from "elysia";
import { auth } from "@/core/auth";
import { prisma } from "@/core/prisma";
import { redis } from "@/core/redis";
import { OrgPerm, StreamerPerm } from "@/utils/rbac";
import { hexColorToNumber } from "@/utils/color";
import { isValidUri } from "@/utils/regex";
import { registerURI } from "@/classes/streamer";
import { authorizeStreamer } from "@/core/org";
import { Moderation } from "@/classes/moderation";
import { processAvatar, processBanner } from "@/utils/image";
import { saveProfileImage, deleteProfileImage } from "@/utils/storage";
import { nanoid } from "nanoid";
import { inflateSync } from "node:zlib";
import { logOrgAudit } from "@/core/audit";
import { updateStreamerCache } from "@/utils/cache-sync";

export const endpoint = new Elysia()
  .use(auth)
  .patch(
    "/:orgId/streamers/:streamerId",
    async ({ getAuthenticatedUser, params, body, set }) => {
      const user = await getAuthenticatedUser();
      const authRes = await authorizeStreamer(
        params.orgId,
        params.streamerId,
        user.data.id,
        {
          requiredOrgPerm: OrgPerm.STREAMER_MANAGE,
          requiredStreamerPerm: StreamerPerm.STREAMER_MANAGE,
          actionDescription: "edit streamer channel",
        },
        set,
      );
      if (typeof authRes === "string") return set.status === "Bad Request" ? "Invalid organization or streamer ID" : authRes;
      const { orgId, streamerId } = authRes;

      const streamer = await prisma.client.streamer.findFirst({
        where: { id: streamerId, orgId, deletedAt: null },
      });

      if (!streamer) {
        set.status = "Not Found";
        return "Streamer channel not found";
      }

      const data: any = {};
      const newName = body.name?.trim().toLowerCase();
      const newDisplayName = body.displayName?.trim();
      if (newName) {
        if (!/^[a-z0-9_-]+$/.test(newName)) {
          set.status = "Bad Request";
          return "Channel name can only contain lowercase alphanumeric characters, hyphens, and underscores";
        }
        data.name = newName.slice(0, 64);
      }
      if (newDisplayName) data.displayName = newDisplayName.slice(0, 64);
      if (body.bio !== undefined) data.bio = body.bio ? body.bio.trim().slice(0, 1000) : null;

      if (body.avatar) {
        if (typeof (body.avatar as any).arrayBuffer === "function") {
          const buf = Buffer.from(await (body.avatar as any).arrayBuffer());
          const check = await Moderation.moderateImage(buf);
          if (check.flagged) {
            set.status = "Unavailable For Legal Reasons";
            return "Avatar contains inappropriate or NSFW content";
          }
          try {
            const processed = await processAvatar(buf);
            const { url } = await saveProfileImage(String(streamerId), "avatar", nanoid(), processed.buffer);
            if (streamer.avatar) {
              await deleteProfileImage(streamer.avatar).catch(() => {});
            }
            data.avatar = url;
          } catch {}
        } else if (typeof body.avatar === "string") {
          data.avatar = body.avatar;
        }
      } else if (body.avatar === null) {
        data.avatar = null;
      }

      if (body.banner) {
        if (typeof (body.banner as any).arrayBuffer === "function") {
          const buf = Buffer.from(await (body.banner as any).arrayBuffer());
          const check = await Moderation.moderateImage(buf);
          if (check.flagged) {
            set.status = "Unavailable For Legal Reasons";
            return "Banner contains inappropriate or NSFW content";
          }
          try {
            const processed = await processBanner(buf);
            const { url } = await saveProfileImage(String(streamerId), "banner", nanoid(), processed.buffer);
            if (streamer.banner) {
              await deleteProfileImage(streamer.banner).catch(() => {});
            }
            data.banner = url;

            if (body.accentColor === undefined) {
              try {
                const onePixelPng = await new Bun.Image(processed.buffer)
                  .resize(1, 1)
                  .png()
                  .bytes();
                let idatOffset = -1;
                for (let i = 0; i < onePixelPng.length - 4; i++) {
                  if (
                    onePixelPng[i] === 0x49 &&
                    onePixelPng[i + 1] === 0x44 &&
                    onePixelPng[i + 2] === 0x41 &&
                    onePixelPng[i + 3] === 0x54
                  ) {
                    idatOffset = i;
                    break;
                  }
                }
                if (idatOffset !== -1) {
                  const view = new DataView(onePixelPng.buffer, onePixelPng.byteOffset, onePixelPng.byteLength);
                  const idatLength = view.getUint32(idatOffset - 4, false);
                  const compressedData = onePixelPng.subarray(idatOffset + 4, idatOffset + 4 + idatLength);
                  const decompressed = inflateSync(compressedData);
                  if (decompressed.length >= 4) {
                    const r = decompressed[1];
                    const g = decompressed[2];
                    const b = decompressed[3];
                    data.accentColor = (r << 16) + (g << 8) + b;
                  }
                }
              } catch {}
            }
          } catch {}
        } else if (typeof body.banner === "string") {
          data.banner = body.banner;
        }
      } else if (body.banner === null) {
        data.banner = null;
      }

      if (body.accentColor !== undefined) {
        data.accentColor = body.accentColor === null ? null : typeof body.accentColor === "number" ? body.accentColor : hexColorToNumber(body.accentColor);
      }
      if (body.twitch !== undefined || body.socialTwitch !== undefined) data.twitch = body.twitch ?? body.socialTwitch;
      if (body.youtube !== undefined || body.socialYoutube !== undefined) data.youtube = body.youtube ?? body.socialYoutube;
      if (body.twitter !== undefined || body.socialTwitter !== undefined) data.twitter = body.twitter ?? body.socialTwitter;
      if (body.facebook !== undefined || body.socialFacebook !== undefined) data.facebook = body.facebook ?? body.socialFacebook;
      if (body.reddit !== undefined || body.socialReddit !== undefined) data.reddit = body.reddit ?? body.socialReddit;
      if (body.discord !== undefined || body.socialDiscord !== undefined) data.discord = body.discord ?? body.socialDiscord;

      const updated = await prisma.client.streamer.update({
        where: { id: streamerId },
        data,
      });

      const members = await prisma.client.organizationMember.findMany({
        where: { orgId },
        select: { userId: true },
      });

      await updateStreamerCache(
        {
          id: updated.id,
          orgId,
          name: updated.name,
          displayName: updated.displayName,
          bio: updated.bio,
          avatar: updated.avatar,
          banner: updated.banner,
          accentColor: updated.accentColor,
          twitch: updated.twitch,
          youtube: updated.youtube,
          twitter: updated.twitter,
          facebook: updated.facebook,
          reddit: updated.reddit,
          discord: updated.discord,
          uri: updated.uri,
        },
        members.map((m) => m.userId),
      );

      await logOrgAudit({
        orgId,
        userId: user.data.id,
        action: "STREAMER_UPDATED",
        targetType: "STREAMER",
        targetId: streamerId,
        payload: { changedFields: Object.keys(data), streamerName: updated.name },
      });

      return {
        id: String(updated.id),
        name: updated.name,
        displayName: updated.displayName,
        bio: updated.bio,
        avatar: updated.avatar,
        banner: updated.banner,
        accentColor: updated.accentColor,
        twitch: updated.twitch,
        youtube: updated.youtube,
        twitter: updated.twitter,
        facebook: updated.facebook,
        reddit: updated.reddit,
        discord: updated.discord,
      };
    },
    {
      detail: {
        tags: ["Organizations"],
        summary: "Update streamer channel",
        description: "Updates streamer channel metadata and images. Requires EDIT_STREAMER_PROFILE.",
      },
      body: t.Object({
        name: t.Optional(t.String({ pattern: "^[a-z0-9_\\-]+$", minLength: 1, maxLength: 64 })),
        displayName: t.Optional(t.String({ minLength: 1, maxLength: 64 })),
        bio: t.Optional(t.Nullable(t.String({ maxLength: 1000 }))),
        accentColor: t.Optional(t.Nullable(t.Union([t.String(), t.Number()]))),
        avatar: t.Optional(
          t.Union([
            t.File({
              maxSize: "5m",
              type: ["image/png", "image/jpeg", "image/webp"],
            }),
            t.Nullable(t.String()),
          ]),
        ),
        banner: t.Optional(
          t.Union([
            t.File({
              maxSize: "10m",
              type: ["image/png", "image/jpeg", "image/webp"],
            }),
            t.Nullable(t.String()),
          ]),
        ),
        socialTwitch: t.Optional(t.Nullable(t.String())),
        socialYoutube: t.Optional(t.Nullable(t.String())),
        socialTwitter: t.Optional(t.Nullable(t.String())),
        socialFacebook: t.Optional(t.Nullable(t.String())),
        socialReddit: t.Optional(t.Nullable(t.String())),
        socialDiscord: t.Optional(t.Nullable(t.String())),
        twitch: t.Optional(t.Nullable(t.String())),
        youtube: t.Optional(t.Nullable(t.String())),
        twitter: t.Optional(t.Nullable(t.String())),
        facebook: t.Optional(t.Nullable(t.String())),
        reddit: t.Optional(t.Nullable(t.String())),
        discord: t.Optional(t.Nullable(t.String())),
      }),
    },
  )
  .patch(
    "/:orgId/streamers/:streamerId/uri",
    async ({ getAuthenticatedUser, params, headers, body, set }) => {
      const user = await getAuthenticatedUser();
      const authRes = await authorizeStreamer(
        params.orgId,
        params.streamerId,
        user.data.id,
        {
          requiredOrgPerm: OrgPerm.STREAMER_MANAGE,
          requiredStreamerPerm: StreamerPerm.STREAMER_MANAGE,
          actionDescription: "edit streamer handle",
        },
        set,
      );
      if (typeof authRes === "string") return set.status === "Bad Request" ? "Invalid organization or streamer ID" : authRes;
      const { orgId, streamerId } = authRes;

      const parsedUri = String(body ?? "").trim().toLowerCase();
      if (!parsedUri || parsedUri.length >= 50 || !isValidUri(parsedUri)) {
        set.status = "Bad Request";
        return "Bad Request";
      }

      const streamer = await prisma.client.streamer.findUnique({
        where: { id: streamerId },
        select: { uriCooldownEnd: true },
      });

      const now = Date.now();
      const cooldown = streamer?.uriCooldownEnd && new Date(streamer.uriCooldownEnd);
      if (cooldown && cooldown.getTime() > now) {
        set.status = "Too Many Requests";
        return "Please retry again after " + cooldown.getTime();
      }

      const authHeader = headers.authorization ? headers.authorization.replace(/^Bearer\s+/i, "") : "";
      const success = await registerURI(streamerId, parsedUri, authHeader);
      if (!success) {
        set.status = "Forbidden";
        return "URI has been registered or is invalid";
      }

      return "OK";
    },
    {
      detail: {
        tags: ["Organizations"],
        summary: "Register streamer channel URI",
        description: "Registers or updates custom URI handle for a streamer channel.",
      },
      body: t.String(),
    },
  );

export default endpoint;
