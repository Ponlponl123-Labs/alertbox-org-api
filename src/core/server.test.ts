import { expect, test, describe } from "bun:test";
import Server from "./server";

describe("Server Port Rotation", () => {
  test("should rotate port when already in use", () => {
    // We use a high port number to avoid conflicts with system services
    const basePort = 7000;
    
    const server1 = new Server(basePort);
    const server2 = new Server(basePort);

    try {
      expect(server1.port).toBeGreaterThanOrEqual(basePort);
      expect(server2.port).toBe(server1.port + 1);
    } finally {
      // Ensure servers are stopped even if test fails
      server1.app.stop();
      server2.app.stop();
    }
  });

  test("should not produce duplicate /api routes in OpenAPI documentation", async () => {
    const server = new Server(7005);
    try {
      const res = await server.app.handle(new Request("http://localhost/openapi/json"));
      const doc = await res.json();
      const paths = Object.keys(doc.paths || {});
      const apiPrefixed = paths.filter((p) => p.startsWith("/api/"));
      expect(apiPrefixed.length).toBe(0);
      expect(paths.length).toBeGreaterThan(0);
    } finally {
      server.app.stop();
    }
  });
});
