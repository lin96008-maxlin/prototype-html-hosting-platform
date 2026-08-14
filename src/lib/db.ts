import { Pool, type PoolClient, type QueryResultRow } from "pg";
import { assertDatabaseConfigured, env } from "@/lib/env";

declare global {
  // 开发环境热更新时复用连接池，避免耗尽 PostgreSQL 连接数。
  var __prototypePool: Pool | undefined;
}

export function getPool() {
  assertDatabaseConfigured();
  if (!globalThis.__prototypePool) {
    globalThis.__prototypePool = new Pool({
      connectionString: env.databaseUrl,
      max: env.databasePoolMax,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });
    globalThis.__prototypePool.on("error", (error) => {
      console.error(`PostgreSQL 空闲连接异常，连接池将在下次请求时重连：${error.message}`);
    });
  }
  return globalThis.__prototypePool;
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  values: unknown[] = [],
) {
  return getPool().query<T>(sql, values);
}

export async function withTransaction<T>(work: (client: PoolClient) => Promise<T>) {
  const client = await getPool().connect();
  try {
    await client.query("begin");
    const result = await work(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
