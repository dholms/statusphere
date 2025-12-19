import Database from "better-sqlite3";
import { Kysely, SqliteDialect } from "kysely";
import { DatabaseSchema } from "./schema";

let _db: Kysely<DatabaseSchema> | null = null;

export type Database = Kysely<DatabaseSchema>;

export const getDb = (): Kysely<DatabaseSchema> => {
  if (!_db) {
    const sqlite = new Database("statusphere.db");
    sqlite.pragma("journal_mode = WAL");

    _db = new Kysely<DatabaseSchema>({
      dialect: new SqliteDialect({ database: sqlite }),
    });
  }
  return _db;
};
