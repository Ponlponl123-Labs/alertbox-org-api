import Redis, { type SentinelAddress } from "ioredis";
import betterConsole, { tsflag } from "ts-better-console";
import tomlConfig from "../config/toml";

export class RedisClient {
  public redis: Redis;
  private natMap?: Record<string, { host: string; port: number }>;
  private redisSentinels?: Partial<SentinelAddress>[];

  constructor() {
    if (!tomlConfig.redis?.enabled) {
      betterConsole.log(
        tsflag("warn", true, "Redis is disabled in the configuration."),
      );
      this.redis = new Redis({ lazyConnect: true });
      return;
    }

    this.redisSentinels = this.buildSentinels();
    this.natMap = this.buildNatMap();

    this.redis = new Redis({
      db: tomlConfig.redis?.db || 0,
      name: tomlConfig.redis?.name || "mymaster",
      host: tomlConfig.redis?.host || "localhost",
      port: tomlConfig.redis?.port || 6379,
      password: tomlConfig.redis?.password || undefined,
      natMap: this.natMap,
      sentinels: this.redisSentinels,
      sentinelPassword: tomlConfig.redis?.sentinel?.password || undefined,
      lazyConnect: true,
      enableReadyCheck: true,
      keyPrefix: "alertbox-org:",
      sentinelReconnectStrategy: (times) =>
        times > 20 ? null : Math.min(times * 200, 5000),
      retryStrategy: (times) =>
        times > 20 ? null : Math.min(times * 200, 5000),
    });

    this.connect();
  }

  private connect() {
    betterConsole.log(
      tsflag("info", true, "Attempting to connect to Redis Database..."),
    );
    this.redis
      .connect()
      .then(() =>
        betterConsole.log(
          tsflag("info", true, "Redis Database connected successfully!"),
        ),
      )
      .catch((err) =>
        betterConsole.log(
          tsflag("error", true, "Redis Database connection error:", err),
        ),
      );
  }

  private buildNatMap():
    | Record<string, { host: string; port: number }>
    | undefined {
    const natMapData = tomlConfig?.redis?.natmap;
    if (!natMapData) {
      betterConsole.log(
        tsflag(
          "warn",
          true,
          "No Redis Sentinel NAT mappings found in TOML configuration.",
        ),
      );
      return undefined;
    }
    betterConsole.log(
      tsflag(
        "info",
        true,
        `Found ${natMapData.length} NAT mappings in TOML configuration.`,
      ),
    );
    natMapData.forEach((nat, i) => {
      betterConsole.log(
        tsflag(
          "info",
          true,
          `  Mapping ${i + 1}: ${nat.nat} -> ${nat.host}:${nat.port}`,
        ),
      );
    });
    return Object.fromEntries(
      natMapData.map((nat) => [
        `${nat.nat}`,
        { host: nat.host, port: nat.port },
      ]),
    );
  }

  private buildSentinels(): Partial<SentinelAddress>[] | undefined {
    if (!tomlConfig?.redis?.sentinel?.enabled) {
      betterConsole.log(
        tsflag(
          "warn",
          true,
          "Redis Sentinel is disabled in the configuration. Using direct Redis connection.",
        ),
      );
      return;
    }

    const sentinels: Partial<SentinelAddress>[] =
      tomlConfig.redis?.sentinel?.nodes?.map((node, i) => {
        betterConsole.log(
          tsflag(
            "info",
            true,
            `Configured Redis Sentinel ${i + 1}: ${node.host}:${node.port}`,
          ),
        );
        return {
          host: node.host,
          port: node.port,
        };
      }) || [];

    betterConsole.log(
      tsflag(
        "info",
        true,
        `Configured Redis Sentinel Group: ${tomlConfig.redis?.name || "mymaster"}`,
      ),
    );
    return sentinels;
  }
}

export default RedisClient;
