import { PrismaClient } from "@/generated/prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import betterConsole, { Card, cs, s, tsflag } from "ts-better-console";
import { dbConfig } from "@/config/env";

class PrismaORM {
  public client: PrismaClient;
  public adapter: PrismaMariaDb;
  private isConnected: boolean = false;

  constructor() {
    betterConsole.log(
      tsflag(
        "info",
        true,
        "· Initializing Prisma ORM with provided database configuration...",
      ),
    );

    this.adapter = new PrismaMariaDb({
      host: dbConfig.host,
      port: dbConfig.port,
      user: dbConfig.user,
      password: dbConfig.password,
      database: dbConfig.database,
    });
    this.client = new PrismaClient({ adapter: this.adapter });

    this.connect();
  }

  private async connect() {
    try {
      betterConsole.log(
        tsflag(
          "info",
          true,
          s("··· Connecting to the database", { color: "yellow" }),
        ),
      );
      await this.client.$connect();

      // Verify connection with a simple query
      await this.client.$queryRaw`SELECT 1`;

      this.isConnected = true;
      betterConsole.log(
        tsflag(
          "info",
          true,
          s("✓ Database connection established successfully!", {
            color: "green",
          }),
        ),
      );
    } catch (error) {
      betterConsole.error(
        tsflag(
          "error",
          true,
          cs([
            "Failed to connect to the database:",
            s(String(error), { color: "red" }),
          ]),
        ),
      );
      process.exit(1);
    }

    new Card(
      cs(
        [
          "Host: " + dbConfig.host,
          "Port: " + dbConfig.port,
          "User: " + dbConfig.user,
          "Database: " + dbConfig.database,
        ],
        "   \n",
      ),
      undefined,
      {
        title: {
          content: `Database Connection Details`,
        },
        footer: {
          content: `· Connection Status: ${this.isConnected ? "Connected" : "Disconnected"}`,
          style: {
            color: this.isConnected ? "green" : "red",
          },
        },
        border: {
          symbols: {
            style: "round",
          },
        },
      },
    )
      .render()
      .split("\n")
      .forEach((line) => betterConsole.log(tsflag("info", true, line)));
  }
}

export default PrismaORM;
