import { Database } from "bun:sqlite";
import env from "./env";

const dbPath = env.DB_PATH;

if (
  !(
    dbPath.endsWith(".sqlite") ||
    dbPath.endsWith(".db") ||
    dbPath.endsWith(".sqlite3")
  )
) {
  throw new Error(
    `Invalid database path: ${dbPath}! Please only use .sqlite .db or .sqlite3 extensions`
  );
}

export const db = new Database(dbPath);
