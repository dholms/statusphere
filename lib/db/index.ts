import Database from "better-sqlite3";
import { Kysely, Migrator, SqliteDialect } from "kysely";
import { migrations } from "./migrations";
import { DatabaseSchema } from "./schema";

let _db: Kysely<DatabaseSchema> | null = null;

export const getDb = async (): Promise<Kysely<DatabaseSchema>> => {
  if (!_db) {
    const sqlite = new Database("statusphere.db");
    sqlite.pragma("journal_mode = WAL");

    _db = new Kysely<DatabaseSchema>({
      dialect: new SqliteDialect({ database: sqlite }),
    });

    const migrator = new Migrator({
      db: _db,
      provider: { getMigrations: async () => migrations },
    });

    const res = await migrator.migrateToLatest();
    if (res.error) {
      throw res.error;
    }
  }
  return _db;
};
