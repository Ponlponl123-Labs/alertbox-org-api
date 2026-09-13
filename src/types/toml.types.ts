export interface TomlConfig {
  title?: string;
  redis?: {
    enabled?: boolean;
    host?: string;
    port?: number;
    password?: string;
    db?: number;
    name?: string;
    tls?: boolean | {
      ca?: string;
      cert?: string;
      key?: string;
      rejectUnauthorized?: boolean;
      servername?: string;
    };
    sentinel?: {
      enabled?: boolean;
      password?: string;
      tls?: boolean | {
        ca?: string;
        cert?: string;
        key?: string;
        rejectUnauthorized?: boolean;
        servername?: string;
      };
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
