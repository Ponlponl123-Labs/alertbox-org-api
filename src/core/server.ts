import Elysia, { file } from "elysia";
import betterConsole, { tsflag } from "ts-better-console";
import router, { availableVersions } from "../routes";

class Server {
  public app: Elysia;
  public port: number;

  constructor(port: number = 3000) {
    this.app = new Elysia();
    this.port = port;
    this.routes();
    this.favicon();
    this.setupEvents();
    this.listen();
  }

  private routes() {
    this.app.get("/", () => {
      const body = [
        "Welcome to the AlertBox.org API!",
        "Read the documentation at https://alertbox.org/docs",
        "",
        "Latest version: " + availableVersions[availableVersions.length - 1],
        "Available versions: " + availableVersions.join(", "),
      ];
      return body.join("\n");
    });

    this.app.use(router);
  }

  private favicon() {
    this.app.get("/favicon.ico", file("./favicon.ico"));
  }

  private setupEvents() {
    this.app.on("start", ({ server }) => {
      betterConsole.log(
        tsflag(
          "info",
          true,
          `🦊 Elysia is running at ${server?.hostname}:${server?.port}`,
        ),
      );
    });

    this.app.on("error", ({ code, error }) => {
      if (code === "NOT_FOUND") return;
      betterConsole.log(tsflag("error", true, "An error occurred:", error));
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
            `Port ${this.port} is already in use, rotating to ${this.port + 1}...`,
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
