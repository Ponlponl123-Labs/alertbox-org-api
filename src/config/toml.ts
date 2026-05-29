import { TOML } from "bun";
import betterConsole, { Card, s, tsflag } from "ts-better-console";
import { TomlConfig } from "../types/toml.types";

export async function loadTomlConfig(): Promise<TomlConfig> {
  const env = process.env.NODE_ENV || "development";
  const globalConfigPath = "config.toml";
  const envConfigPath = `config.${env}.toml`;

  let config: TomlConfig = {};

  betterConsole.log(
    tsflag(
      "info",
      true,
      s(`· Loading configuration for environment: ${env}...`, {
        color: "yellow",
      }),
    ),
  );

  try {
    const globalFile = Bun.file(globalConfigPath);
    if (await globalFile.exists()) {
      const globalConfig = TOML.parse(await globalFile.text()) as TomlConfig;
      config = { ...config, ...globalConfig };
      betterConsole.log(
        tsflag(
          "info",
          true,
          s(`✓ Loaded global config from: ${globalConfigPath}`, {
            color: "green",
          }),
        ),
      );
    } else {
      betterConsole.log(
        tsflag(
          "warn",
          true,
          s("! Global config not found: config.toml (optional)", {
            color: "yellow",
          }),
        ),
      );
    }

    const envFile = Bun.file(envConfigPath);
    if (await envFile.exists()) {
      const envConfig = TOML.parse(await envFile.text()) as TomlConfig;
      config = deepMerge(config, envConfig) as TomlConfig;
      betterConsole.log(
        tsflag(
          "info",
          true,
          s(`✓ Loaded ${env} config from: config.${env}.toml`, {
            color: "green",
          }),
        ),
      );
    } else {
      betterConsole.log(
        tsflag(
          "warn",
          true,
          s(`⚠ Environment config not found: config.${env}.toml`, {
            color: "yellow",
          }),
        ),
      );
    }

    return config;
  } catch (error) {
    betterConsole.log(
      tsflag(
        "error",
        true,
        s("✗ Failed to load TOML config:", { color: "red" }),
      ),
    );
    betterConsole.error(new Card(String(error), "full").render());
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
