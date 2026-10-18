import {
  MysqlAdapter,
  MysqlIntrospector,
  MysqlQueryCompiler,
  CompiledQuery,
  type Dialect,
  type Driver,
  type DatabaseConnection,
  type QueryResult,
  type Kysely,
} from "kysely";
import { sql } from "./index";

class BunSqlConnection implements DatabaseConnection {
  async executeQuery<R>(compiledQuery: CompiledQuery): Promise<QueryResult<R>> {
    const rawRows = await sql.unsafe(compiledQuery.sql, compiledQuery.parameters as any);
    const rows = Array.isArray(rawRows) ? rawRows : [];
    const numAffectedRows = BigInt(rawRows?.affectedRows ?? 0);
    const insertId = BigInt(rawRows?.lastInsertRowid ?? 0);

    return {
      rows: rows as R[],
      numAffectedRows,
      insertId,
    };
  }

  async *streamQuery<R>(): AsyncIterableIterator<QueryResult<R>> {
    throw new Error("Streaming queries not supported in native Bun.SQL driver");
  }
}

class BunSqlDriver implements Driver {
  private readonly connection = new BunSqlConnection();

  async init(): Promise<void> {}
  async acquireConnection(): Promise<DatabaseConnection> {
    return this.connection;
  }
  async beginTransaction(connection: DatabaseConnection): Promise<void> {
    await connection.executeQuery(CompiledQuery.raw("START TRANSACTION"));
  }
  async commitTransaction(connection: DatabaseConnection): Promise<void> {
    await connection.executeQuery(CompiledQuery.raw("COMMIT"));
  }
  async rollbackTransaction(connection: DatabaseConnection): Promise<void> {
    await connection.executeQuery(CompiledQuery.raw("ROLLBACK"));
  }
  async releaseConnection(): Promise<void> {}
  async destroy(): Promise<void> {}
}

export class BunSqlDialect implements Dialect {
  createAdapter() {
    return new MysqlAdapter();
  }
  createDriver(): Driver {
    return new BunSqlDriver();
  }
  createIntrospector(db: Kysely<any>) {
    return new MysqlIntrospector(db);
  }
  createQueryCompiler() {
    return new MysqlQueryCompiler();
  }
}
