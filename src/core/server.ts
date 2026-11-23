import Elysia, { t } from "elysia";
import { cors } from "@elysiajs/cors";
import { cs, link, s, tsflag } from "ts-better-console";
import { logger } from "@/utils/log";
import router, { availableVersions } from "../routes";
import { UnauthorizedError, BadRequestError, ForbiddenError } from "./auth";
import { setBunServer, getBunServer } from "./bun-server";
import fs from "node:fs";
import { isDev, isProduction } from "../config/env";
import { isAllowedOrigin } from "@/utils/security";
import { smallerBannerAsciiArt } from "@/consts/ascii-arts/alertbox-org";
import openapi from "@elysia/openapi";
import staticPlugin from "@elysiajs/static";
import { isAlertboxProduction } from "@/utils/instance";

if (!("toJSON" in BigInt.prototype)) {
  (BigInt.prototype as any).toJSON = function (): string {
    return this.toString();
  };
}

class Server {
  public app: Elysia;
  public port: number;
  public isShuttingDown = false;

  constructor(port: number = 3000) {
    this.app = new Elysia({ serve: { reusePort: false } });
    this.app.onRequest(({ request, set }) => {
      (request as any)._reqStartTime = performance.now();
      const ip =
        request.headers.get("cf-connecting-ip") ||
        request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
        request.headers.get("x-real-ip") ||
        getBunServer()?.requestIP(request)?.address;
      const origin = request.headers.get("origin") || request.headers.get("referer");
      (request as any)._clientIp = ip;
      (request as any)._clientOrigin = origin;

      try {
        const u = new URL(request.url);
        if (u.pathname.startsWith("//")) {
          u.pathname = u.pathname.replace(/\/+/g, "/");
          Object.defineProperty(request, "url", { value: u.toString(), writable: true });
        }
      } catch { }

      if (logger.isTrafficPending()) {
        let pathname = "";
        try {
          pathname = new URL(request.url).pathname;
        } catch {
          pathname = request.url;
        }
        logger.trafficPending(
          tsflag(
            "info",
            true,
            cs([
              s("[TRAFFIC-PENDING]", { color: "yellow", styles: ["bold"] }),
              request.method,
              pathname,
              ...(ip ? [s(`(${ip})`, { color: "gray" })] : []),
              ...(origin ? [s(`from ${origin}`, { color: "gray" })] : []),
            ]),
          ),
        );
      }
      set.headers["X-Content-Type-Options"] = "nosniff";
      set.headers["X-Frame-Options"] = "SAMEORIGIN";
      set.headers["Referrer-Policy"] = "strict-origin-when-cross-origin";
      set.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()";
      set.headers["Cross-Origin-Resource-Policy"] = "cross-origin";
      set.headers["Cross-Origin-Opener-Policy"] = "same-origin";
      set.headers["X-Permitted-Cross-Domain-Policies"] = "none";
      if (!isDev) {
        set.headers["Strict-Transport-Security"] =
          "max-age=31536000; includeSubDomains; preload";
      }
    });

    this.app.onAfterResponse(({ request, set }) => {
      if (logger.isTraffic()) {
        const startTime = (request as any)._reqStartTime;
        const duration = startTime ? `${(performance.now() - startTime).toFixed(2)}ms` : "0ms";
        const status = Number(set.status || 200);
        const statusColor = status >= 500 ? "red" : status >= 400 ? "yellow" : "green";
        const ip = (request as any)._clientIp;
        const origin = (request as any)._clientOrigin;
        let pathname = "";
        try {
          pathname = new URL(request.url).pathname;
        } catch {
          pathname = request.url;
        }
        logger.traffic(
          tsflag(
            "info",
            true,
            cs([
              s("[TRAFFIC]", { color: "magenta", styles: ["bold"] }),
              request.method,
              pathname,
              s(String(status), { color: statusColor }),
              s(`[${duration}]`, { color: "cyan" }),
              ...(ip ? [s(`(${ip})`, { color: "gray" })] : []),
              ...(origin ? [s(`from ${origin}`, { color: "gray" })] : []),
            ]),
          ),
        );
      }
    });
    this.app.use(
      cors({
        origin: (request: Request): boolean => {
          const origin = request.headers.get("origin");
          if (!origin) return true;
          return isAllowedOrigin(origin);
        },
        methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allowedHeaders: true,
        credentials: true,
      }),
    );
    if (!isProduction && fs.existsSync("./public")) {
      this.app.use(staticPlugin());
    }
    if (process.env.DISABLE_OPENAPI !== "true") {
      this.app.use(openapi({
        provider: null,
        exclude: {
          paths: [/^\/public/, /^\/api/],
          staticFile: true,
        },
        documentation: {
          info: {
            title: "AlertBox.org API",
            version: "1.0.0",
            description: `High-performance, low-latency live streaming alert & donation engine for creators.

### Key Capabilities
- **Real-Time Overlay Engine**: Ultra-low latency WebSocket & Redis Pub/Sub alert broadcast for OBS & browser overlays.
- **Webhook Ingestion**: Unified processing for Ko-fi, Buy Me a Coffee, and payment webhooks with deduplication & disaster recovery audit logging.
- **Streamlabs Relay**: Automatic donation relay pipeline with OAuth2 token auto-refresh.
- **Creator Hub**: Custom tipping pages (\`tip-to.me\`), reactive widget customization, and profile routing.`,
            termsOfService: "https://law.ponlponl123.com/additional/alertbox.org",
            summary: `The official API for AlertBox.org. For more information, visit https://alertbox.org/docs`,
            contact: {
              name: "AlertBox.org Foundation",
              email: "foundation@alertbox.org",
              url: "https://labs.ponlponl123.com",
            },
            license: {
              name: "Ponlponl123 Labs License (MIT)",
              url: "https://github.com/Ponlponl123-Labs/alertbox-org-api/blob/main/LICENSE",
            },
          },
          servers: [
            {
              url: isDev ? "http://localhost:3001" : "https://api.alertbox.org",
              description: isDev ? "Development Server" : "Production Server",
            },
          ],
        },
      }));
    }
    this.port = port;
    this.setupEvents();
    this.routes();
    this.favicon();
    this.listen();
  }

  private routes() {
    const welcomeMessage = [
      "Welcome to the AlertBox.org API!",
      "Read the documentation at https://alertbox.org/docs",
      "",
      "Latest version: " + availableVersions[availableVersions.length - 1],
      "Available versions: " + availableVersions.join(", "),
      "",
      "Roadmap: https://ponl.link/roadmap-alertbox.org",
      "",
      smallerBannerAsciiArt,
    ].join("\n");

    this.app.get("/", () => welcomeMessage, {
      detail: {
        tags: ["System"],
        summary: "API Welcome & Status banner",
        description: "Returns greeting message, version details, and documentation links.",
      },
      response: {
        200: t.String({ description: "ASCII welcome banner and documentation metadata" }),
      },
    });

    this.app.get(
      "/health",
      ({ set }) => {
        set.headers["cache-control"] = "public, max-age=5, s-maxage=10, stale-while-revalidate=5";
        return { status: "ok" };
      },
      {
        detail: {
          tags: ["System"],
          summary: "System health check",
          description: "Returns 200 OK status for load balancers and orchestrator liveness probes.",
        },
        response: {
          200: t.Object({
            status: t.String({ description: "Liveness status", examples: ["ok"] }),
          }, { description: "Service health status" }),
        },
      },
    );

    this.app.get(
      "/ready",
      ({ set }) => {
        if (this.isShuttingDown) {
          set.status = 503;
          return { status: "shutting_down" };
        }
        return { status: "ready" };
      },
      {
        detail: {
          tags: ["System"],
          summary: "System readiness probe",
          description: "Returns 200 OK when ready to serve traffic, or 503 during graceful SIGTERM drain.",
        },
        response: {
          200: t.Object({
            status: t.String({ examples: ["ready"] }),
          }),
          503: t.Object({
            status: t.String({ examples: ["shutting_down"] }),
          }),
        },
      },
    );

    this.app.get(
      "/instance",
      ({ set }) => {
        if (isAlertboxProduction()) {
          set.status = 200;
          return "OK";
        }
        set.status = 404;
        return "Not Found";
      },
      {
        detail: {
          tags: ["System"],
          summary: "Check if running AlertBox.org production instance",
          description: "Returns 200 OK if official AlertBox.org instance, 404 if self-hosted.",
        },
        response: {
          200: t.String({ description: "Official production deployment instance indicator", examples: ["OK"] }),
          404: t.String({ description: "Self-hosted deployment instance indicator", examples: ["Not Found"] }),
        },
      },
    );

    this.app.ws("/health/ws", {
      open(ws) {
        ws.send(JSON.stringify({ status: "ok" }));
      },
      message(ws, message) {
        if (message === "ping") {
          ws.send("pong");
        } else if (typeof message === "string" && message.includes("ping")) {
          try {
            const parsed = JSON.parse(message);
            if (parsed.type === "ping") {
              ws.send(JSON.stringify({ type: "pong" }));
            }
          } catch {
            // Ignore invalid JSON messages
          }
        }
      }
    });

    this.app.use(router);
  }

  private favicon() {
    this.app.get("/favicon.ico", () => Bun.file("./favicon.ico"));
  }

  private setupEvents() {
    this.app.on("start", ({ server }) => {
      if (server) {
        setBunServer(server);
      }
      logger.process(
        tsflag(
          "info",
          true,
          s(
            cs([
              "🦊 Elysia is running at",
              link(
                `${server?.hostname}:${server?.port}`,
                `http://${server?.hostname}:${server?.port}`,
              ),
            ]),
            {
              color: "green",
            },
          ),
        ),
      );
    });

    this.app.error({
      UNAUTHORIZED: UnauthorizedError,
      BAD_REQUEST: BadRequestError,
      FORBIDDEN: ForbiddenError,
    });

    this.app.onError(({ error, set, code }) => {
      const isForbidden =
        (code as string) === "FORBIDDEN" ||
        (error instanceof Error && (error.name === "ForbiddenError" || error instanceof ForbiddenError));

      if (isForbidden) {
        set.status = 403;
        return error instanceof Error ? error.message : "Forbidden";
      }
      const isUnauthorized =
        (code as string) === "UNAUTHORIZED" ||
        (error instanceof Error && (error.name === "UnauthorizedError" || error instanceof UnauthorizedError));

      if (isUnauthorized) {
        set.status = 401;
        return error instanceof Error ? error.message : "Unauthorized";
      }

      const isBadRequest =
        (code as string) === "BAD_REQUEST" ||
        (error instanceof Error && (error.name === "BadRequestError" || error instanceof BadRequestError));

      if (isBadRequest || code === "VALIDATION") {
        set.status = 400;
        return error instanceof Error ? error.message : "Bad Request";
      }

      if (code === "NOT_FOUND") {
        return;
      }
      logger.error(
        tsflag("error", true, s("An error occurred:", { color: "red" }), (error as any)?.stack || error),
      );
      set.status = 500;
      return "Internal Server Error";
    });
  }

  private listen() {
    try {
      this.app.listen(this.port);
    } catch (err: any) {
      if (
        err.code === "EADDRINUSE" ||
        err.errno === -4091 ||
        err.message?.includes("address in use")
      ) {
        logger.process(
          tsflag(
            "warn",
            true,
            s(
              `! Port ${this.port} is already in use, rotating to ${this.port + 1}...`,
              { color: "yellow" },
            ),
          ),
        );
        this.port++;
        this.listen();
      } else {
        throw err;
      }
    }
  }
}

export default Server;
