import Database from "better-sqlite3";
import { Kysely, Migrator, SqliteDialect } from "kysely";
import { migrations } from "../lib/db/migrations";
import { DatabaseSchema } from "../lib/db/schema";

async function migrate() {
  const sqlite = new Database("statusphere.db");
  sqlite.pragma("journal_mode = WAL");

  const db = new Kysely<DatabaseSchema>({
    dialect: new SqliteDialect({ database: sqlite }),
  });

  const migrator = new Migrator({
    db,
    provider: { getMigrations: async () => migrations },
  });

  console.log("Running migrations...");
  const { error, results } = await migrator.migrateToLatest();

  results?.forEach((result) => {
    if (result.status === "Success") {
      console.log(`✓ ${result.migrationName}`);
    } else if (result.status === "Error") {
      console.error(`✗ ${result.migrationName}`);
    }
  });

  if (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  }

  console.log("Migrations complete.");
  await db.destroy();
}

migrate();
