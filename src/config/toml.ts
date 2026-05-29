import { TOML } from "bun";
import betterConsole, { tsflag } from "ts-better-console";
import { TomlConfig } from "../types/toml.types";

export async function loadTomlConfig(): Promise<TomlConfig> {
  const env = process.env.NODE_ENV || "development";
  const globalConfigPath = "config.toml";
  const envConfigPath = `config.${env}.toml`;

  let config: TomlConfig = {};

  try {
    const globalFile = Bun.file(globalConfigPath);
    if (await globalFile.exists()) {
      const globalConfig = TOML.parse(await globalFile.text()) as TomlConfig;
      config = { ...config, ...globalConfig };
      betterConsole.log(
        tsflag(
          "info",
          true,
          `✓ Loaded global config from: ${globalConfigPath}`,
        ),
      );
    } else {
      betterConsole.log(
        tsflag(
          "warn",
          true,
          "⚠ Global config not found: config.toml (optional)",
        ),
      );
    }

    const envFile = Bun.file(envConfigPath);
    if (await envFile.exists()) {
      const envConfig = TOML.parse(await envFile.text()) as TomlConfig;
      config = deepMerge(config, envConfig) as TomlConfig;
      betterConsole.log(
        tsflag("info", true, `✓ Loaded ${env} config from: config.${env}.toml`),
      );
    } else {
      betterConsole.log(
        tsflag(
          "warn",
          true,
          `⚠ Environment config not found: config.${env}.toml`,
        ),
      );
    }

    return config;
  } catch (error) {
    betterConsole.log(
      tsflag("error", true, "✗ Failed to load TOML config:", error),
    );
    return config;
  }
}

function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
): Record<string, unknown> {
  const output = { ...target };

  for (const key of Object.keys(source)) {
    if (isObject(source[key]) && isObject(target[key])) {
      output[key] = deepMerge(
        target[key] as Record<string, unknown>,
        source[key] as Record<string, unknown>,
      );
    } else {
      output[key] = source[key];
    }
  }

  return output;
}

function isObject(item: unknown): item is Record<string, unknown> {
  return !!item && typeof item === "object" && !Array.isArray(item);
}

export const tomlConfig = await loadTomlConfig();

export function getConfigValue<T = unknown>(path: string, defaultValue?: T): T {
  const keys = path.split(".");
  let value: unknown = tomlConfig;

  for (const key of keys) {
    if (value && typeof value === "object" && key in value) {
      value = (value as Record<string, unknown>)[key];
    } else {
      return defaultValue as T;
    }
  }

  return value as T;
}

export default tomlConfig;
