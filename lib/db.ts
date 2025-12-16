import Database from "better-sqlite3";
import { Kysely, SqliteDialect } from "kysely";

// Database schema types
export interface DatabaseSchema {
  auth_state: AuthStateTable;
  auth_session: AuthSessionTable;
}

interface AuthStateTable {
  key: string;
  value: string; // JSON stringified NodeSavedState
}

interface AuthSessionTable {
  key: string; // DID
  value: string; // JSON stringified NodeSavedSession
}

// Lazy initialization to avoid issues during Next.js build
let _db: Kysely<DatabaseSchema> | null = null;

export function getDb(): Kysely<DatabaseSchema> {
  if (!_db) {
    const sqlite = new Database("statusphere.db");
    // Enable WAL mode for better concurrent access
    sqlite.pragma("journal_mode = WAL");

    // Initialize the schema
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS auth_state (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS auth_session (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);

    _db = new Kysely<DatabaseSchema>({
      dialect: new SqliteDialect({
        database: sqlite,
      }),
    });
  }
  return _db;
}
