import Database from "better-sqlite3";
import { Kysely, Migrator, SqliteDialect } from "kysely";
import { migrations } from "../lib/db/migrations";
import { DatabaseSchema } from "../lib/db/schema";

const DATABASE_PATH = process.env.DATABASE_PATH || "statusphere.db";

async function migrate() {
  const sqlite = new Database(DATABASE_PATH);
  sqlite.pragma("journal_mode = WAL");

  const db = new Kysely<DatabaseSchema>({
    dialect: new SqliteDialect({ database: sqlite }),
  });

  const migrator = new Migrator({
    db,
    provider: { getMigrations: async () => migrations },
  });

  const { error } = await migrator.migrateToLatest();

  if (error) {
    throw error;
  }

  console.log("Migrations complete.");
  await db.destroy();
}

migrate();
