import {
  atprotoLoopbackClientMetadata,
  NodeOAuthClient,
} from "@atproto/oauth-client-node";
import type {
  NodeSavedSession,
  NodeSavedState,
} from "@atproto/oauth-client-node";
import { getDb } from "@/lib/db";

// Singleton pattern - OAuth client should only be instantiated once
let client: NodeOAuthClient | null = null;

export function getOAuthClient(): NodeOAuthClient {
  if (!client) {
    client = new NodeOAuthClient({
      clientMetadata: atprotoLoopbackClientMetadata(
        `http://localhost?${new URLSearchParams([
          ["redirect_uri", `http://127.0.0.1:3000/oauth/callback`],
          ["scope", `atproto transition:generic`],
        ])}`,
      ),

      // State store - temporary storage for OAuth state during authorization
      stateStore: {
        async get(key: string) {
          const db = await getDb();
          const row = await db
            .selectFrom("auth_state")
            .select("value")
            .where("key", "=", key)
            .executeTakeFirst();
          return row ? JSON.parse(row.value) : undefined;
        },
        async set(key: string, value: NodeSavedState) {
          const db = await getDb();
          const valueJson = JSON.stringify(value);
          await db
            .insertInto("auth_state")
            .values({ key, value: valueJson })
            .onConflict((oc) =>
              oc.column("key").doUpdateSet({ value: valueJson }),
            )
            .execute();
        },
        async del(key: string) {
          const db = await getDb();
          await db
            .deleteFrom("auth_state")
            .where("key", "=", key)
            .execute();
        },
      },

      // Session store - persistent storage for user sessions
      sessionStore: {
        async get(key: string) {
          const db = await getDb();
          const row = await db
            .selectFrom("auth_session")
            .select("value")
            .where("key", "=", key)
            .executeTakeFirst();
          return row ? JSON.parse(row.value) : undefined;
        },
        async set(key: string, value: NodeSavedSession) {
          const db = await getDb();
          const valueJson = JSON.stringify(value);
          await db
            .insertInto("auth_session")
            .values({ key, value: valueJson })
            .onConflict((oc) =>
              oc.column("key").doUpdateSet({ value: valueJson }),
            )
            .execute();
        },
        async del(key: string) {
          const db = await getDb();
          await db
            .deleteFrom("auth_session")
            .where("key", "=", key)
            .execute();
        },
      },
    });
  }
  return client;
}
