import type { Server } from "bun";

let bunServer: Server<any> | null = null;

/**
 * Register the active Bun Server instance.
 */
export function setBunServer(server: Server<any>) {
  bunServer = server;
}

/**
 * Retrieve the active Bun Server instance.
 */
export function getBunServer(): Server<any> | null {
  return bunServer;
}
