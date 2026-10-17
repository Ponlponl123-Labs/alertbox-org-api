import type { ModerationConfig } from "@/types";

export const DEFAULT_MODERATION_CONFIG: ModerationConfig = {
  enabled: true,
  textEnabled: true,
  imageEnabled: true,
  apiUrl: "",
  cacheTtlSec: 604800,
  timeoutMs: 5000,
};
