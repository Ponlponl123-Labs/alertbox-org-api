import { redis } from "@/core/redis";
import { day } from "@/consts/time";

const DEFAULT_CACHE_TTL = 3600;

/**
 * Write-through cache update for organization metadata.
 * Overwrites centralized org:info and in-memory member org_list caches in-place,
 * preventing cache busts and MariaDB read spikes.
 */
export async function updateOrgCache(
  org: {
    id: bigint | string;
    type?: string;
    name?: string;
    slug?: string;
    avatar?: string | null;
    banner?: string | null;
    ownerId?: bigint | string;
    createdAt?: Date;
  },
  memberUserIds: (bigint | string)[] = [],
): Promise<void> {
  const orgIdStr = String(org.id);
  const infoKey = `org:${orgIdStr}:info`;

  const existingRaw = await redis.redis.get(infoKey);
  const orgInfo = existingRaw
    ? { ...JSON.parse(existingRaw), ...org }
    : {
        id: orgIdStr,
        type: org.type || "COMMUNITY",
        name: org.name || "",
        slug: org.slug || "",
        avatar: org.avatar ?? null,
        banner: org.banner ?? null,
        ownerId: org.ownerId ? String(org.ownerId) : "",
        createdAt: org.createdAt || new Date(),
      };

  const tasks: Promise<any>[] = [
    redis.redis.setex(infoKey, day, JSON.stringify(orgInfo)),
  ];

  for (const userId of memberUserIds) {
    tasks.push(
      (async () => {
        const listKey = `user:${String(userId)}:org_list`;
        const cached = await redis.redis.get(listKey);
        if (!cached) return;
        try {
          const list: any[] = JSON.parse(cached);
          let changed = false;
          for (const item of list) {
            if (String(item.id) === orgIdStr) {
              if (org.type !== undefined) item.type = org.type;
              if (org.name !== undefined) item.name = org.name;
              if (org.slug !== undefined) item.slug = org.slug;
              if (org.avatar !== undefined) item.avatar = org.avatar;
              if (org.banner !== undefined) item.banner = org.banner;
              changed = true;
              break;
            }
          }
          if (changed) {
            await redis.redis.setex(listKey, DEFAULT_CACHE_TTL, JSON.stringify(list));
          }
        } catch {}
      })(),
    );
  }

  await Promise.all(tasks);
}

/**
 * Write-through cache update for streamer channel metadata.
 * Seamlessly overrides streamer info and updates parent organization streamers array.
 */
export async function updateStreamerCache(
  streamer: {
    id: bigint | string;
    orgId: bigint | string;
    name?: string;
    displayName?: string;
    bio?: string | null;
    avatar?: string | null;
    banner?: string | null;
    accentColor?: number;
    twitch?: string | null;
    youtube?: string | null;
    twitter?: string | null;
    facebook?: string | null;
    reddit?: string | null;
    discord?: string | null;
    uri?: string | null;
  },
  memberUserIds: (bigint | string)[] = [],
): Promise<void> {
  const streamerIdStr = String(streamer.id);
  const orgIdStr = String(streamer.orgId);

  const tasks: Promise<any>[] = [];

  // Update streamer:id:info in-place if cached
  tasks.push(
    (async () => {
      const infoKey = `streamer:${streamerIdStr}:info`;
      const cached = await redis.redis.get(infoKey);
      if (!cached) return;
      try {
        const info = JSON.parse(cached);
        const merged = { ...info, ...streamer, id: streamerIdStr, orgId: orgIdStr };
        await redis.redis.setex(infoKey, DEFAULT_CACHE_TTL, JSON.stringify(merged));
      } catch {}
    })(),
  );

  // Update org:orgId:streamers list in-place if cached
  tasks.push(
    (async () => {
      const streamersKey = `org:${orgIdStr}:streamers`;
      const cached = await redis.redis.get(streamersKey);
      if (!cached) return;
      try {
        const list: any[] = JSON.parse(cached);
        let changed = false;
        for (const s of list) {
          if (String(s.id) === streamerIdStr) {
            if (streamer.name !== undefined) s.name = streamer.name;
            if (streamer.displayName !== undefined) s.displayName = streamer.displayName;
            if (streamer.avatar !== undefined) s.avatar = streamer.avatar;
            if (streamer.uri !== undefined) s.uri = streamer.uri;
            changed = true;
            break;
          }
        }
        if (changed) {
          await redis.redis.setex(streamersKey, DEFAULT_CACHE_TTL, JSON.stringify(list));
        }
      } catch {}
    })(),
  );

  // Update streamer in members' user:userId:org_list in-place if cached
  for (const userId of memberUserIds) {
    tasks.push(
      (async () => {
        const listKey = `user:${String(userId)}:org_list`;
        const cached = await redis.redis.get(listKey);
        if (!cached) return;
        try {
          const orgList: any[] = JSON.parse(cached);
          let changed = false;
          for (const org of orgList) {
            if (String(org.id) === orgIdStr && Array.isArray(org.streamers)) {
              for (const s of org.streamers) {
                if (String(s.id) === streamerIdStr) {
                  if (streamer.name !== undefined) s.name = streamer.name;
                  if (streamer.displayName !== undefined) s.displayName = streamer.displayName;
                  if (streamer.avatar !== undefined) s.avatar = streamer.avatar;
                  if (streamer.uri !== undefined) s.uri = streamer.uri;
                  changed = true;
                  break;
                }
              }
            }
          }
          if (changed) {
            await redis.redis.setex(listKey, DEFAULT_CACHE_TTL, JSON.stringify(orgList));
          }
        } catch {}
      })(),
    );
  }

  await Promise.all(tasks);
}

/**
 * Write-through cache update for member role and permissions.
 */
export async function updateMemberCache(
  orgId: bigint | string,
  memberId: bigint | string,
  userId: bigint | string,
  updates: { role?: string; permissions?: string },
): Promise<void> {
  const orgIdStr = String(orgId);
  const memberIdStr = String(memberId);
  const userIdStr = String(userId);

  const tasks: Promise<any>[] = [];

  // In-place update org:orgId:members list if cached
  tasks.push(
    (async () => {
      const membersKey = `org:${orgIdStr}:members`;
      const cached = await redis.redis.get(membersKey);
      if (!cached) return;
      try {
        const list: any[] = JSON.parse(cached);
        let changed = false;
        for (const m of list) {
          if (String(m.id) === memberIdStr) {
            if (updates.role !== undefined) m.role = updates.role;
            if (updates.permissions !== undefined) m.permissions = updates.permissions;
            changed = true;
            break;
          }
        }
        if (changed) {
          await redis.redis.setex(membersKey, DEFAULT_CACHE_TTL, JSON.stringify(list));
        }
      } catch {}
    })(),
  );

  // In-place update user:userId:org_list for target member
  tasks.push(
    (async () => {
      const listKey = `user:${userIdStr}:org_list`;
      const cached = await redis.redis.get(listKey);
      if (!cached) return;
      try {
        const list: any[] = JSON.parse(cached);
        let changed = false;
        for (const item of list) {
          if (String(item.id) === orgIdStr) {
            if (updates.role !== undefined) item.role = updates.role;
            if (updates.permissions !== undefined) item.permissions = updates.permissions;
            changed = true;
            break;
          }
        }
        if (changed) {
          await redis.redis.setex(listKey, DEFAULT_CACHE_TTL, JSON.stringify(list));
        }
      } catch {}
    })(),
  );

  await Promise.all(tasks);
}

/**
 * Write-through cache update for widget alertbox settings.
 */
export async function updateWidgetSettingsCache(
  widgetId: bigint | string,
  token: string,
  alertboxSettings: any,
): Promise<void> {
  const cacheKey = `widget:settings:token:${token}`;
  const payload = {
    widgetId: String(widgetId),
    type: "ALERTBOX",
    alertbox: alertboxSettings,
  };
  await Promise.all([
    redis.redis.setex(cacheKey, DEFAULT_CACHE_TTL, JSON.stringify(payload)),
    redis.redis.setex(`widget:token:${token}`, DEFAULT_CACHE_TTL, String(widgetId)),
  ]);
}
