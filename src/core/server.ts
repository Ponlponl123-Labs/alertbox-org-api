import Elysia, { file } from "elysia";
import betterConsole, { cs, link, s, tsflag } from "ts-better-console";
import router, { availableVersions } from "../routes";
import { UnauthorizedError, BadRequestError } from "./auth";
import { setBunServer } from "./bun-server";

class Server {
  public app: Elysia;
  public port: number;

  constructor(port: number = 3000) {
    this.app = new Elysia({ serve: { reusePort: false } });
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
    ].join("\n");

    this.app.get("/", () => welcomeMessage);

    this.app.get("/health", () => ({ status: "ok" }));

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
