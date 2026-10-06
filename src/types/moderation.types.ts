export type ModerationTextEngine = "xlm-roberta" | "minilm" | "toxic-bert" | "none";

export interface TextModerationResult {
  flagged: boolean;
  score: number;
  engine: string;
  category?: string;
  reason?: string;
}

export interface ImageModerationResult {
  flagged: boolean;
  score: number;
  engine: string;
  category?: string;
  reason?: string;
}

export interface ModerationConfig {
  enabled: boolean;
  textEnabled: boolean;
  imageEnabled: boolean;
  apiUrl: string;
  cacheTtlSec: number;
  timeoutMs: number;
}
