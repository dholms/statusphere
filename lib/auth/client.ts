import {
  atprotoLoopbackClientMetadata,
  Keyset,
  JoseKey,
  NodeOAuthClient,
  OAuthClientMetadataInput,
} from "@atproto/oauth-client-node";
import type {
  NodeSavedSession,
  NodeSavedState,
} from "@atproto/oauth-client-node";
import { getDb } from "@/lib/db";

const PUBLIC_URL = process.env.PUBLIC_URL;
const PRIVATE_KEY = process.env.PRIVATE_KEY;

let client: NodeOAuthClient | null = null;

export async function getOAuthClient(): Promise<NodeOAuthClient> {
  if (client) return client;

  // For production: use confidential client with private key
  // For development: use loopback client (localhost only)
  const keyset =
    PUBLIC_URL && PRIVATE_KEY
      ? new Keyset([await JoseKey.fromJWK(JSON.parse(PRIVATE_KEY))])
      : undefined;

  if (PUBLIC_URL && !keyset?.size) {
    throw new Error(
      "PRIVATE_KEY environment variable is required when PUBLIC_URL is set",
    );
  }

  const clientMetadata: OAuthClientMetadataInput = PUBLIC_URL
    ? {
        client_name: "Statusphere",
        client_id: `${PUBLIC_URL}/oauth-client-metadata.json`,
        jwks_uri: `${PUBLIC_URL}/.well-known/jwks.json`,
        redirect_uris: [`${PUBLIC_URL}/oauth/callback`],
        scope: "atproto repo:xyz.statusphere.status",
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        application_type: "web",
        token_endpoint_auth_method: "private_key_jwt",
        token_endpoint_auth_signing_alg: keyset?.findPrivateKey({
          usage: "sign",
        })?.alg,
        dpop_bound_access_tokens: true,
      }
    : atprotoLoopbackClientMetadata(
        `http://localhost?${new URLSearchParams([
          ["redirect_uri", `http://127.0.0.1:3000/oauth/callback`],
          ["scope", `atproto repo:xyz.statusphere.status`],
        ])}`,
      );

  client = new NodeOAuthClient({
    keyset,
    clientMetadata,

    // State store - temporary storage for OAuth state during authorization
    stateStore: {
      async get(key: string) {
        const db = getDb();
        const row = await db
          .selectFrom("auth_state")
          .select("value")
          .where("key", "=", key)
          .executeTakeFirst();
        return row ? JSON.parse(row.value) : undefined;
      },
      async set(key: string, value: NodeSavedState) {
        const db = getDb();
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
        const db = getDb();
        await db.deleteFrom("auth_state").where("key", "=", key).execute();
      },
    },

    // Session store - persistent storage for user sessions
    sessionStore: {
      async get(key: string) {
        const db = getDb();
        const row = await db
          .selectFrom("auth_session")
          .select("value")
          .where("key", "=", key)
          .executeTakeFirst();
        return row ? JSON.parse(row.value) : undefined;
      },
      async set(key: string, value: NodeSavedSession) {
        const db = getDb();
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
        const db = getDb();
        await db.deleteFrom("auth_session").where("key", "=", key).execute();
      },
    },
  });

  return client;
}
