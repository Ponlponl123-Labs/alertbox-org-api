export interface TomlConfig {
  title?: string;
  redis?: {
    enabled?: boolean;
    host?: string;
    port?: number;
    password?: string;
    db?: number;
    name?: string;
    sentinel?: {
      enabled?: boolean;
      password?: string;
      nodes?: Array<{
        host: string;
        port: number;
      }>;
    };
    natmap?: Array<{
      nat: string;
      host: string;
      port: number;
    }>;
  };
  [key: string]: unknown;
}
