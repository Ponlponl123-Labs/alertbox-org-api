import Redis, { type SentinelAddress } from "ioredis";
import betterConsole, { cs, link, s, tsflag } from "ts-better-console";
import tomlConfig from "../config/toml";

export class RedisClient {
  public redis: Redis;
  private natMap?: Record<string, { host: string; port: number }>;
  private redisSentinels?: Partial<SentinelAddress>[];

  constructor() {
    if (!tomlConfig.redis?.enabled) {
      betterConsole.log(
        tsflag(
          "warn",
          true,
          s(
            "! Redis is disabled in the configuration. Skipping Redis connection.",
            { color: "yellow" },
          ),
        ),
      );
      this.redis = new Redis({ lazyConnect: true });
      return;
    }

    betterConsole.log(
      tsflag(
        "info",
        true,
        "· Initializing Redis Client with provided configuration...",
      ),
    );

    this.natMap = this.buildNatMap();
    this.redisSentinels = this.buildSentinels();

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

  private async connect() {
    betterConsole.log(
      tsflag(
        "info",
        true,
        s("··· Attempting to connect to Redis Database", {
          color: "yellow",
        }),
      ),
    );

    try {
      await this.redis.connect();
      await this.redis.ping();
      betterConsole.log(
        tsflag(
          "info",
          true,
          s("✓ Redis Database connected successfully!", { color: "green" }),
        ),
      );
    } catch (err) {
      betterConsole.log(
        tsflag(
          "error",
          true,
          s("✗ Redis Database connection error:", { color: "red" }),
          err,
        ),
      );
      process.exit(1);
    }
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
          s("○ No Redis Sentinel NAT mappings found in TOML configuration.", {
            color: "yellow",
          }),
        ),
      );
      return undefined;
    }
    betterConsole.log(
      tsflag(
        "info",
        true,
        s(`▸ Found ${natMapData.length} NAT mappings in TOML configuration.`, {
          color: "green",
        }),
      ),
    );
    natMapData.forEach((nat, i) => {
      betterConsole.log(
        tsflag(
          "info",
          true,
          s(
            cs([
              `⌎ Mapping ${i + 1}:`,
              link(`${nat.nat}`, `http://${nat.nat}`),
              `->`,
              link(`${nat.host}:${nat.port}`, `http://${nat.host}:${nat.port}`),
            ]),
            {
              color: "blue",
            },
          ),
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
          s(
            "! Redis Sentinel is disabled in the configuration. Using direct Redis connection.",
            { color: "yellow" },
          ),
        ),
      );
      return;
    }

    betterConsole.log(
      tsflag(
        "info",
        true,
        cs([
          "· Redis Sentinel is",
          s("enabled", { color: "green", styles: ["bold"] }),
          "in the configuration. Building configuration...",
        ]),
      ),
    );

    const sentinels: Partial<SentinelAddress>[] =
      tomlConfig.redis?.sentinel?.nodes?.map((node, i) => {
        betterConsole.log(
          tsflag(
            "info",
            true,
            s(
              cs([
                `⌎ Configured Redis Sentinel ${i + 1}:`,
                link(
                  `${node.host}:${node.port}`,
                  `http://${node.host}:${node.port}`,
                ),
              ]),
              {
                color: "blue",
              },
            ),
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
        s(`▸ Total Redis Sentinel nodes configured: ${sentinels.length}`, {
          color: sentinels.length > 0 ? "green" : "yellow",
        }),
      ),
    );
    betterConsole.log(
      tsflag(
        "info",
        true,
        s(
          sentinels.length > 0
            ? "✓ Sentinel configuration built successfully!"
            : "⚠ No Sentinel nodes found in configuration.",
          { color: sentinels.length > 0 ? "green" : "yellow" },
        ),
      ),
    );
    return sentinels;
  }
}

export default RedisClient;
