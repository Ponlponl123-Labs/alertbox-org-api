import { prisma, redis } from "@/index";
import { Prisma, accounts } from "@/generated/prisma/client";
import { basicUserSelect } from "@/consts/session";
import { day } from "@/consts/time";
import { nanoid } from "nanoid";
import betterConsole, { tsflag } from "ts-better-console";
import { UAParser } from "ua-parser-js";
import { get_IPGeolocation } from "../utils/ip";
import {
  MinimalUser,
  SessionUser,
  User,
  UserCreated,
} from "@/types/account.types";

export interface MeOptions {
  cache?: boolean;
}

export class Me<T extends Prisma.accountsSelect = typeof basicUserSelect> {
  public data: (Prisma.accountsGetPayload<{ select: T }> & { id: bigint }) | null = null;
  private options: MeOptions;
  private currentSession: string | null = null;

  constructor(options: MeOptions = { cache: true }) {
    this.options = options;
  }

  /**
   * Authenticate and load user data using a session token.
   */
  public async use(
    session: string,
    ip: string,
    select: T = basicUserSelect as any,
  ): Promise<this | false | null> {
    this.currentSession = session;
    const session_info = await prisma.client.sessions.findFirst({
      where: {
        token: session,
        disabled: null,
        expire: {
          gt: new Date(),
        },
      },
    });

    if (!session_info) return false;

    // Background usage tracking
    void prisma.client.session_usages
      .create({
        data: {
          uid: session_info.uid,
          secret: session_info.secret,
          token: session,
          ip_addr: ip,
          time: new Date(),
        },
      })
      .catch((error) => {
        betterConsole.error(
          tsflag(
            "error",
            true,
            `[Prisma > session_usages.create] Background insert failed: ${error}`,
          ),
        );
      });

    if (session_info.ip_addr !== ip) {
      void Me.destroySession(session);
      return false;
    }

    const filterUser = (user: any) => {
      const filtered = Object.keys(select).reduce((acc, key) => {
        if ((select as any)[key]) acc[key] = (user as any)[key];
        return acc;
      }, {} as any);
      // Ensure ID is always included
      filtered.id = user.id;
      return filtered;
    };

    if (this.options.cache) {
      const c = await redis.redis.get("user:" + session_info.uid + ":info");
      if (c) {
        if (c === "deleted") return false;
        const cached = JSON.parse(c);

        const hasAllFields = Object.keys(select).every(
          (key) => !(select as any)[key] || key in cached,
        );

        if (hasAllFields) {
          this.data = filterUser(cached);
          return this;
        }
      }
    }

    const user = (await prisma.client.accounts.findFirst({
      where: {
        id: session_info.uid,
      },
    })) as any;

    if (!user) return null;

    if (user.deleted) {
      redis.redis.setex("user:" + session_info.uid + ":info", day, "deleted");
      return false;
    }

    // Cache everything except the auth 'secret'
    const { secret, ...cacheableUser } = user;
    redis.redis.setex(
      "user:" + session_info.uid + ":info",
      day,
      JSON.stringify(cacheableUser),
    );

    if (user?.uri)
      redis.redis.setex("user:" + session_info.uid + ":uri", day, user?.uri);
    if (user?.uri_cooldown)
      redis.redis.setex(
        "user:" + session_info.uid + ":uri_cooldown",
        day,
        String(user?.uri_cooldown.getTime()),
      );

    this.data = filterUser(cacheableUser);
    return this;
  }

  /**
   * Load user data by UID.
   */
  public async load(
    uid: bigint,
    select: T = basicUserSelect as any,
  ): Promise<this | false | null> {
    const filterUser = (user: any) => {
      const filtered = Object.keys(select).reduce((acc, key) => {
        if ((select as any)[key]) acc[key] = (user as any)[key];
        return acc;
      }, {} as any);
      // Ensure ID is always included
      filtered.id = user.id;
      return filtered;
    };

    if (this.options.cache) {
      const c = await redis.redis.get("user:" + uid + ":info");
      if (c) {
        if (c === "deleted") return false;
        const cached = JSON.parse(c);

        const hasAllFields = Object.keys(select).every(
          (key) => !(select as any)[key] || key in cached,
        );

        if (hasAllFields) {
          this.data = filterUser(cached);
          return this;
        }
      }
    }

    const user = (await prisma.client.accounts.findFirst({
      where: {
        id: uid,
      },
    })) as any;

    if (!user) return null;

    if (user.deleted) {
      redis.redis.setex("user:" + uid + ":info", day, "deleted");
      return false;
    }

    const { secret, ...cacheableUser } = user;
    redis.redis.setex(
      "user:" + uid + ":info",
      day,
      JSON.stringify(cacheableUser),
    );

    this.data = filterUser(cacheableUser);
    return this;
  }

  /**
   * Create a new account.
   */
  public async create(
    name: string,
    email: string,
    create_with: string,
  ): Promise<this | false> {
    const isAccountExist = await Me.isExist(email);
    if (isAccountExist) return false;

    let attempts = 0;
    const maxAttempts = 5;

    while (attempts < maxAttempts) {
      const timestamp = Date.now();
      const combinedToken = `${nanoid(32)}.${timestamp}.${nanoid(32)}`;
      const widgetId = `${nanoid(64)}.${timestamp}.${nanoid(64)}`;
      try {
        const user = await prisma.client.accounts.create({
          data: {
            name,
            email,
            displayname: name,
            create_with,
            secret: combinedToken,
            widget_id: widgetId,
          },
        });

        const { secret, ...cacheableUser } = user as any;
        this.data = cacheableUser;
        return this;
      } catch (error: any) {
        if (error?.code === "P2002") {
          attempts++;
          betterConsole.warn(
            tsflag(
              "warn",
              true,
              `[Prisma > createAccount] Collision detected for token ${combinedToken}. Retrying...`,
            ),
          );
        } else {
          throw error;
        }
      }
    }

    throw new Error(
      "Failed to generate a unique token after multiple attempts.",
    );
  }

  /**
   * Session management namespace.
   */
  public get session() {
    return {
      create: async (metadata: {
        method: string;
        user_agent: string;
        ip_addr: string;
      }) => {
        if (!this.data) {
          throw new Error(
            "User data not loaded. Use .use(), .load(), or .create() first.",
          );
        }
        return Me.createSession(this.data.id, metadata);
      },
      destroy: async () => {
        if (!this.currentSession) return false;
        return Me.destroySession(this.currentSession);
      },
    };
  }

  /**
   * Check if an account exists by email.
   */
  public static async isExist(email: string): Promise<MinimalUser | null> {
    const c = await redis.redis.get("email:" + email);
    if (c) {
      if (c === "deleted") return null;
      return JSON.parse(c);
    }
    const exist_user = await prisma.client.accounts.findFirst({
      select: {
        id: true,
        disabled: true,
        deleted: true,
      },
      where: {
        email,
      },
    });
    if (exist_user?.deleted) {
      redis.redis.setex("email:" + email, day, "deleted");
      return null;
    }
    if (exist_user) {
      redis.redis.setex("email:" + email, day, JSON.stringify(exist_user));
    }
    return exist_user;
  }

  /**
   * Create a new session.
   */
  public static async createSession(
    uid: bigint,
    metadata: {
      method: string;
      user_agent: string;
      ip_addr: string;
    },
  ): Promise<string | false> {
    const user_secret = await prisma.client.accounts.findFirst({
      select: {
        secret: true,
      },
      where: {
        id: uid,
        AND: {
          disabled: null,
          AND: {
            deleted: null,
          },
        },
      },
    });

    if (!user_secret) return false;

    let attempts = 0;
    const maxAttempts = 5;
    const useragent = UAParser(metadata.user_agent);
    const ip_geo = await get_IPGeolocation(metadata.ip_addr);
    const payload = {
      uid,
      secret: user_secret.secret,
      ip_addr: metadata.ip_addr,
      method: metadata.method,
      user_agent: metadata.user_agent,
      os: useragent.os.name,
      os_ver: useragent.os.version,
      platform: useragent.browser.name,
      platform_ver: useragent.browser.version,
      platform_major: useragent.browser.major,
      platform_type: useragent.browser.type,
      device_model: useragent.device.model,
      device_type: useragent.device.type,
      device_vendor: useragent.device.vendor,
      cpu_architecture: useragent.cpu.architecture,
      ip_addr_city: ip_geo ? ip_geo.city : null,
      ip_addr_asn: ip_geo ? ip_geo.asn : null,
      ip_addr_country: ip_geo ? ip_geo.country_name : null,
      ip_addr_country_code: ip_geo ? ip_geo.country_code : null,
      ip_addr_country_code_iso3: ip_geo ? ip_geo.country_code_iso3 : null,
      ip_addr_continent_code: ip_geo ? ip_geo.continent_code : null,
      ip_addr_isp: ip_geo ? ip_geo.org : null,
      ip_addr_lat: ip_geo ? ip_geo.latitude : null,
      ip_addr_long: ip_geo ? ip_geo.longitude : null,
      ip_addr_postal: ip_geo ? ip_geo.postal : null,
      ip_addr_region: ip_geo ? ip_geo.region : null,
      ip_addr_region_code: ip_geo ? ip_geo.region_code : null,
    };

    while (attempts < maxAttempts) {
      const timestamp = Date.now();
      const combinedToken = `${nanoid(64)}.${timestamp}.${nanoid(64)}`;
      try {
        await prisma.client.sessions.create({
          data: {
            ...payload,
            token: combinedToken,
            time: new Date(timestamp),
            expire: new Date(timestamp + 2 * 60 * 60 * 1000),
          },
        });

        return combinedToken;
      } catch (error: any) {
        if (error?.code === "P2002") {
          attempts++;
          betterConsole.warn(
            tsflag(
              "warn",
              true,
              `[Prisma > createAccount] Collision detected for token ${combinedToken}. Retrying...`,
            ),
          );
        } else {
          throw error;
        }
      }
    }

    throw new Error(
      "Failed to generate a unique token after multiple attempts.",
    );
  }

  /**
   * Destroy a session.
   */
  public static async destroySession(session: string): Promise<boolean> {
    const session_info = await prisma.client.sessions.findFirst({
      where: {
        token: session,
        AND: {
          disabled: null,
        },
      },
    });
    if (!session_info) return false;
    try {
      await prisma.client.sessions.update({
        data: {
          disabled: new Date(),
        },
        where: {
          token: session,
        },
      });
    } catch {
      return false;
    }
    return true;
  }
}
