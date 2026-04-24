import dotenv from "dotenv";
import mysql from "mysql2/promise";

dotenv.config();

const host = process.env.MYSQL_HOST || "localhost";
const port = Number(process.env.MYSQL_PORT || 3306);
const user = process.env.MYSQL_USER || "root";
const password = process.env.MYSQL_PASSWORD || "";
const database = process.env.MYSQL_DATABASE || "nfr";
const connectionLimit = Number(process.env.MYSQL_CONNECTION_LIMIT || 10);

export const pool = mysql.createPool({
  host,
  port,
  user,
  password,
  database,
  waitForConnections: true,
  connectionLimit,
  namedPlaceholders: true,
  dateStrings: true,
});

export async function query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  const [rows] = await pool.query(sql, params);
  return rows as T[];
}

export async function execute(sql: string, params: unknown[] = []): Promise<void> {
  await pool.execute(sql, params);
}

export async function pingDatabase(): Promise<boolean> {
  const rows = await query<{ ok: number }>("SELECT 1 AS ok");
  return rows[0]?.ok === 1;
}
