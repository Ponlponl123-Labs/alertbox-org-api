import Elysia, { file } from "elysia";
import { cors } from "@elysiajs/cors";
import betterConsole, { cs, link, s, tsflag } from "ts-better-console";
import router, { availableVersions } from "../routes";
import { UnauthorizedError, BadRequestError } from "./auth";
import { setBunServer } from "./bun-server";
import { isDev } from "../config/env";
import { isAllowedOrigin } from "@/utils/security";
import { smallerBannerAsciiArt } from "@/consts/ascii-arts/alertbox-org";
import openapi from "@elysia/openapi";

class Server {
  public app: Elysia;
  public port: number;

  constructor(port: number = 3000) {
    this.app = new Elysia({ serve: { reusePort: false } });
    this.app.onRequest(({ set }) => {
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
    this.app.use(
      cors({
        origin: (request: Request): boolean => {
          const origin = request.headers.get("origin");
          if (!origin) return true;
          return isAllowedOrigin(origin);
        },
        methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allowedHeaders: [
          "Content-Type",
          "Authorization",
          "X-Signature-SHA256",
          "X-Requested-With",
        ],
        credentials: true,
      }),
    );
    this.app.use(openapi({
      provider: null,
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

    this.app.get("/", () => welcomeMessage);

    this.app.get("/health", () => ({ status: "ok" }));

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
      betterConsole.log(
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
    });

    this.app.onError(({ error, set, code }) => {
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

      if (isBadRequest) {
        set.status = 400;
        return error instanceof Error ? error.message : "Bad Request";
      }

      if (code === "NOT_FOUND") {
        return;
      }
      betterConsole.log(
        tsflag("error", true, s("An error occurred:", { color: "red" }), error),
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
        betterConsole.log(
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
