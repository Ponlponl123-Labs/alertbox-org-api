import { PrismaClient } from "@/generated/prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import betterConsole, { cs, s, tsflag } from "ts-better-console";
import { dbConfig } from "@/config/env";

class PrismaORM {
  public client: PrismaClient;
  public adapter: PrismaMariaDb;

  constructor() {
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
      betterConsole.log(tsflag("info", true, "Connecting to the database..."));
      await this.client.$connect();
      betterConsole.log(
        tsflag("info", true, "Connected to the database successfully."),
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
  }
}

export default PrismaORM;
