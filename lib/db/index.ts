import Database from "better-sqlite3";
import { Kysely, SqliteDialect } from "kysely";
import { DatabaseSchema } from "./schema";

let _db: Kysely<DatabaseSchema> | null = null;

export type Database = Kysely<DatabaseSchema>;

const DATABASE_PATH = process.env.DATABASE_PATH || "statusphere.db";

export const getDb = (): Kysely<DatabaseSchema> => {
  if (!_db) {
    const sqlite = new Database(DATABASE_PATH);
    sqlite.pragma("journal_mode = WAL");

    _db = new Kysely<DatabaseSchema>({
      dialect: new SqliteDialect({ database: sqlite }),
    });
  }
  return _db;
};
