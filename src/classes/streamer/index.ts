import { db } from "@/db";
import { redis } from "@/core/redis";
import {
  setConnection,
  removeConnection,
} from "./connections";
import {
  updateProfile,
  registerURI,
  getURIOwner,
} from "./profile";
import {
  StreamerProfilePayload,
  ConnectionSecretPayload,
  SupportedProvider,
} from "@/types/streamer.types";
import { resolveProvider } from "@/utils/connections";
import {
  supported_providers,
  allowed_user_update_providers,
  providerAliases,
} from "@/consts/providers";

export class Streamer {
  public id: bigint;
  public data: any = null;

  constructor(id: bigint | string) {
    this.id = BigInt(id);
  }

  /**
   * Factory method to load an initialized Streamer instance.
   */
  public static async load(id: bigint | string): Promise<Streamer | null> {
    const streamer = new Streamer(id);
    const data = await streamer.fetch();
    return data ? streamer : null;
  }

  /**
   * Factory method to load a streamer by public handle/URI.
   */
  public static async byUri(uri: string): Promise<Streamer | null> {
    const ownerId = await getURIOwner(uri);
    if (!ownerId) return null;
    return Streamer.load(ownerId);
  }

  /**
   * Resolve streamer ID owning a public handle/URI.
   */
  public static async getURIOwner(uri: string): Promise<string | false> {
    return getURIOwner(uri);
  }

  /**
   * Fetch full streamer channel data from database/cache.
   */
  public async fetch(): Promise<any> {
    const numId = Number(this.id);
    const [streamer, org, widgets, integration] = await Promise.all([
      db
        .selectFrom("Streamer")
        .selectAll()
        .where("id", "=", numId)
        .where("deletedAt", "is", null)
        .executeTakeFirst(),
      db
        .selectFrom("Streamer")
        .innerJoin("Organization", "Organization.id", "Streamer.orgId")
        .select([
          "Organization.id as id",
          "Organization.name as name",
          "Organization.slug as slug",
          "Organization.avatar as avatar",
        ])
        .where("Streamer.id", "=", numId)
        .executeTakeFirst(),
      db
        .selectFrom("Widget")
        .selectAll()
        .where("streamerId", "=", numId)
        .where("deletedAt", "is", null)
        .execute(),
      db
        .selectFrom("Integration")
        .selectAll()
        .where("streamerId", "=", numId)
        .executeTakeFirst(),
    ]);

    if (!streamer) return null;

    const record = {
      ...streamer,
      organization: org,
      widgets,
      integration: integration ?? null,
    };

    this.data = record;
    return record;
  }

  /**
   * Update streamer channel profile fields and media assets.
   */
  public async update(payload: StreamerProfilePayload): Promise<any> {
    const updated = await updateProfile(this.id, this.data ?? {}, payload);
    if (updated) {
      this.data = { ...this.data, ...updated };
    }
    return updated;
  }

  /**
   * Register or update custom vanity URI for this streamer channel.
   */
  public async registerUri(uri: string, token: string): Promise<boolean> {
    return registerURI(this.id, uri, token);
  }

  /**
   * Streamer channel payment integrations namespace.
   */
  public get connections() {
    return {
      set: async (
        orgId: bigint | string,
        provider: SupportedProvider,
        payload: ConnectionSecretPayload,
      ) => {
        return setConnection(this.id, orgId, provider, payload);
      },
      remove: async (provider: SupportedProvider) => {
        return removeConnection(this.id, provider);
      },
      get: async (provider: SupportedProvider) => {
        return redis.redis.get(`streamer:${String(this.id)}:connections:${provider}`);
      },
    };
  }
}

// Export OOP class as default and named export
export default Streamer;

// Re-export domain utilities and constants for convenience
export * from "./connections";
export * from "./profile";
export {
  supported_providers,
  allowed_user_update_providers,
  providerAliases,
  resolveProvider,
};
export type {
  SupportedProvider,
  StreamerProfilePayload,
  ConnectionSecretPayload,
};
