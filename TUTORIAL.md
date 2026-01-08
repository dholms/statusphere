
# Building Statusphere: An AT Protocol Tutorial

Build a simple status-setting app for Bluesky users using AT Protocol, OAuth, and real-time sync.

**What you'll build:** Users log in with their Bluesky account, pick an emoji status, and see a live feed of everyone's statuses.

---

## Prerequisites

- Node.js 20+
- pnpm (or npm/yarn)
- Basic familiarity with Next.js and TypeScript

---

## Part 1: Project Setup

### 1.1 Create Next.js App

```bash
npx create-next-app@latest statusphere --yes
cd statusphere
```

### 1.2 Install Dependencies

```bash
pnpm add @atproto/common-web @atproto/lex @atproto/oauth-client-node @atproto/syntax @atproto/tap better-sqlite3 kysely
pnpm add -D @types/better-sqlite3 tsx
```

**What these do:**
- `@atproto/common-web` - Basic AT Protocol utilities including DID document parsing
- `@atproto/lex` - Lexicon (schema) generation and validation
- `@atproto/oauth-client-node` - OAuth client for Bluesky authentication
- `@atproto/syntax` - AT Protocol URI parsing utilities
- `@atproto/tap` - Client library for Tap - an AT Protocol sync tool
- `better-sqlite3` - Fast SQLite driver
- `kysely` - Type-safe SQL query builder
- `tsx` - Run TypeScript files directly (for scripts)

### 1.3 Update next.config.ts

@TODO Do we need this??


```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;
```

This tells Next.js to use the native SQLite module server-side.

---

## Part 2: Database Setup

### 2.1 Define the Schema

Create `lib/db/schema.ts`:

```typescript
export interface DatabaseSchema {
  auth_state: AuthStateTable;
  auth_session: AuthSessionTable;
  status: StatusTable;
}

interface AuthStateTable {
  key: string;
  value: string;
}

interface AuthSessionTable {
  key: string;
  value: string;
}

interface StatusTable {
  uri: string;
  authorDid: string;
  status: string;
  createdAt: string;
  indexedAt: string;
}
```

**What's happening:**
- `auth_state` - Temporary storage during OAuth flow
- `auth_session` - Persistent user sessions (keyed by DID)
- `status` - Status records from users

### 2.2 Database Connection

Create `lib/db/index.ts`:

```typescript
import Database from "better-sqlite3";
import { Kysely, SqliteDialect } from "kysely";
import { DatabaseSchema } from "./schema";

const DATABASE_PATH = process.env.DATABASE_PATH || "statusphere.db";

let _db: Kysely<DatabaseSchema> | null = null;

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
```

### 2.3 Create Migrations

Create `lib/db/migrations.ts`:

```typescript
import { Kysely, Migration, MigrationProvider } from "kysely";

const migrations: Record<string, Migration> = {
  "001": {
    async up(db: Kysely<unknown>) {
      await db.schema
        .createTable("auth_state")
        .addColumn("key", "text", (col) => col.primaryKey())
        .addColumn("value", "text", (col) => col.notNull())
        .execute();

      await db.schema
        .createTable("auth_session")
        .addColumn("key", "text", (col) => col.primaryKey())
        .addColumn("value", "text", (col) => col.notNull())
        .execute();

      await db.schema
        .createTable("status")
        .addColumn("uri", "text", (col) => col.primaryKey())
        .addColumn("authorDid", "text", (col) => col.notNull())
        .addColumn("status", "text", (col) => col.notNull())
        .addColumn("createdAt", "text", (col) => col.notNull())
        .addColumn("indexedAt", "text", (col) => col.notNull())
        .execute();

      await db.schema
        .createIndex("status_author_idx")
        .on("status")
        .column("authorDid")
        .execute();
    },
    async down(db: Kysely<unknown>) {
      await db.schema.dropTable("status").execute();
      await db.schema.dropTable("auth_session").execute();
      await db.schema.dropTable("auth_state").execute();
    },
  },
};

export const migrationProvider: MigrationProvider = {
  async getMigrations() {
    return migrations;
  },
};
```


### 2.4 Migration Script

Create `scripts/migrate.ts`:
Using Kysely's migration system

```typescript
import Database from "better-sqlite3";
import { Kysely, Migrator, SqliteDialect } from "kysely";
import { migrationProvider } from "../lib/db/migrations";
import { DatabaseSchema } from "../lib/db/schema";

const DATABASE_PATH = process.env.DATABASE_PATH || "statusphere.db";

async function migrate() {
  const sqlite = new Database(DATABASE_PATH);
  sqlite.pragma("journal_mode = WAL");

  const db = new Kysely<DatabaseSchema>({
    dialect: new SqliteDialect({ database: sqlite }),
  });

  const migrator = new Migrator({ db, provider: migrationProvider });
  const { error } = await migrator.migrateToLatest();

  if (error) throw error;

  console.log("Migrations complete.");
  await db.destroy();
}

migrate();
```

### 2.5 Add migration script to package.json

Add to `pnpm start` so that we always run migrations before starting the application.

```json
{
  "scripts": {
    "dev": "pnpm migrate && next dev",
    "build": "next build",
    "start": "pnpm migrate && next start --port ${PORT-3000}",
    "migrate": "tsx scripts/migrate.ts"
  }
}
```

### Checkpoint 1: Test Database

```bash
pnpm migrate
```

You should see "Migrations complete." and a `statusphere.db` file created.

---

## Part 3: OAuth Authentication

### 3.1 OAuth Client

Create `lib/auth/client.ts`:

```typescript
import {
  atprotoLoopbackClientMetadata,
  NodeOAuthClient,
} from "@atproto/oauth-client-node";
import type {
  NodeSavedSession,
  NodeSavedState,
} from "@atproto/oauth-client-node";
import { getDb } from "@/lib/db";

let client: NodeOAuthClient | null = null;

export async function getOAuthClient(): Promise<NodeOAuthClient> {
  if (client) return client;

  client = new NodeOAuthClient({
    // For local development, use loopback client
    clientMetadata: atprotoLoopbackClientMetadata(
      `http://localhost?${new URLSearchParams([
        ["redirect_uri", `http://127.0.0.1:3000/oauth/callback`],
        ["scope", `atproto`],
      ])}`,
    ),

    // Store OAuth state in database
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
          .onConflict((oc) => oc.column("key").doUpdateSet({ value: valueJson }))
          .execute();
      },
      async del(key: string) {
        const db = getDb();
        await db.deleteFrom("auth_state").where("key", "=", key).execute();
      },
    },

    // Store sessions in database
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
          .onConflict((oc) => oc.column("key").doUpdateSet({ value: valueJson }))
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
```

**Key concepts:**
- `atprotoLoopbackClientMetadata` - Special client type for localhost development
- `stateStore` - Temporary storage during OAuth dance (CSRF protection)
- `sessionStore` - Persistent sessions keyed by user's DID

### 3.2 Session Helper

Create `lib/auth/session.ts`:

```typescript
import { cookies } from "next/headers";
import { getOAuthClient } from "./client";
import type { OAuthSession } from "@atproto/oauth-client-node";

export async function getSession(): Promise<OAuthSession | null> {
  const cookieStore = await cookies();
  const did = cookieStore.get("did")?.value;

  if (!did) return null;

  try {
    const client = await getOAuthClient();
    return await client.restore(did);
  } catch {
    return null;
  }
}

export async function getDid(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get("did")?.value ?? null;
}
```

### 3.3 Export Auth Module

Create `lib/auth/index.ts`:

```typescript
export { getOAuthClient } from "./client";
export { getSession, getDid } from "./session";
```

### 3.4 Login Route

Create `app/oauth/login/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getOAuthClient } from "@/lib/auth/client";

export async function POST(request: NextRequest) {
  try {
    const { handle } = await request.json();

    if (!handle || typeof handle !== "string") {
      return NextResponse.json(
        { error: "Handle is required" },
        { status: 400 },
      );
    }

    const client = await getOAuthClient();

    // Resolves handle, finds their auth server, returns authorization URL
    const authUrl = await client.authorize(handle, {
      scope: "atproto",
    });

    return NextResponse.json({ redirectUrl: authUrl.toString() });
  } catch (error) {
    console.error("OAuth login error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Login failed" },
      { status: 500 },
    );
  }
}
```

### 3.5 Callback Route

Create `app/oauth/callback/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getOAuthClient } from "@/lib/auth/client";

const PUBLIC_URL = process.env.PUBLIC_URL || "http://localhost:3000";

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const client = await getOAuthClient();

    // Exchange code for session
    const { session } = await client.callback(params);

    const response = NextResponse.redirect(new URL("/", PUBLIC_URL));

    // Set DID cookie
    response.cookies.set("did", session.did, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7, // 1 week
      path: "/",
    });

    return response;
  } catch (error) {
    console.error("OAuth callback error:", error);
    return NextResponse.redirect(new URL("/?error=login_failed", PUBLIC_URL));
  }
}
```

### 3.6 Logout Route

Create `app/oauth/logout/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getOAuthClient } from "@/lib/auth/client";

export async function POST() {
  try {
    const cookieStore = await cookies();
    const did = cookieStore.get("did")?.value;

    if (did) {
      const client = await getOAuthClient();
      await client.revoke(did);
    }

    cookieStore.delete("did");
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Logout error:", error);
    const cookieStore = await cookies();
    cookieStore.delete("did");
    return NextResponse.json({ success: true });
  }
}
```

### 3.7 Login Form Component

Create `components/LoginForm.tsx`:

```typescript
"use client";

import { useState } from "react";

export function LoginForm() {
  const [handle, setHandle] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/oauth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handle }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Login failed");
      }

      // Redirect to Bluesky authorization
      window.location.href = data.redirectUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
          Bluesky Handle
        </label>
        <input
          type="text"
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
          placeholder="alice.bsky.social"
          className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
          disabled={loading}
        />
      </div>

      {error && (
        <p className="text-red-500 text-sm">{error}</p>
      )}

      <button
        type="submit"
        disabled={loading || !handle}
        className="w-full py-2 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
      >
        {loading ? "Signing in..." : "Sign in with Bluesky"}
      </button>
    </form>
  );
}
```

### 3.8 Logout Button Component

Create `components/LogoutButton.tsx`:

```typescript
"use client";

import { useRouter } from "next/navigation";

export function LogoutButton() {
  const router = useRouter();

  async function handleLogout() {
    await fetch("/oauth/logout", { method: "POST" });
    router.refresh();
  }

  return (
    <button
      onClick={handleLogout}
      className="text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
    >
      Sign out
    </button>
  );
}
```

### 3.9 Update Home Page

Replace `app/page.tsx`:

```typescript
import { getSession } from "@/lib/auth";
import { LoginForm } from "@/components/LoginForm";
import { LogoutButton } from "@/components/LogoutButton";

export default async function Home() {
  const session = await getSession();

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-950">
      <main className="w-full max-w-md mx-auto p-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-100 mb-2">
            Statusphere
          </h1>
          <p className="text-zinc-600 dark:text-zinc-400">
            Set your status on the Atmosphere
          </p>
        </div>

        <div className="bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 p-6">
          {session ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  Signed in as{" "}
                  <span className="font-mono">{session.did}</span>
                </p>
                <LogoutButton />
              </div>
              <p className="text-green-600">Authentication working!</p>
            </div>
          ) : (
            <LoginForm />
          )}
        </div>
      </main>
    </div>
  );
}
```

### Checkpoint 2: Test OAuth

```bash
pnpm dev
```

1. Open http://localhost:3000
2. Enter your Bluesky handle
3. Authorize the app
4. You should see "Authentication working!" with your DID

---

## Part 4: Lexicons (Data Schema)

### 4.1 Define Your Lexicon

Create `lexicons/xyz/statusphere/status.json`:

```json
{
  "lexicon": 1,
  "$type": "com.atproto.lexicon.schema",
  "id": "xyz.statusphere.status",
  "defs": {
    "main": {
      "type": "record",
      "key": "tid",
      "record": {
        "type": "object",
        "required": ["status", "createdAt"],
        "properties": {
          "status": {
            "type": "string",
            "minLength": 1,
            "maxLength": 32,
            "maxGraphemes": 1
          },
          "createdAt": {
            "type": "string",
            "format": "datetime"
          }
        }
      }
    }
  }
}
```

**What this defines:**
- A record type with ID `xyz.statusphere.status`
- Contains a single emoji (`maxGraphemes: 1`) and timestamp
- `key: "tid"` means records are identified by timestamp-based IDs

### 4.2 Generate TypeScript Code

Add to `package.json` scripts:

```json
{
  "scripts": {
    "build:lex": "ts-lex build --importExt=\"\" --out=./lib/lexicons --override",
    "build": "pnpm build:lex && next build"
  }
}
```

Run:

```bash
pnpm build:lex
```

This generates TypeScript in `lib/lexicons/` with validators and types.

### 4.3 Update OAuth Scope

Update `lib/auth/client.ts` to request access to your lexicon:

```typescript
// Change scope from "atproto" to:
["scope", `atproto repo:xyz.statusphere.status`],
```

<!-- QUESTION: Should we use "atproto transition:generic" or the specific repo scope? The reference uses transition:generic but the tutorial app uses the specific scope. Need clarification on best practice. -->

---

## Part 5: Status Submission

### 5.1 Status API Route

Create `app/api/status/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { Client } from "@atproto/lex";
import { getOAuthClient, getSession } from "@/lib/auth";
import * as xyz from "@/lib/lexicons/xyz";

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { status } = await request.json();

  if (!status || typeof status !== "string") {
    return NextResponse.json({ error: "Status is required" }, { status: 400 });
  }

  const client = await getOAuthClient();
  const oauthSession = await client.restore(session.did);
  const lexClient = new Client(oauthSession);

  const createdAt = new Date().toISOString();
  const res = await lexClient.create(xyz.statusphere.status, {
    status,
    createdAt,
  });

  return NextResponse.json({
    success: true,
    status,
    uri: res.uri,
    cid: res.cid,
  });
}
```

**What's happening:**
- Verify user is logged in
- Create a lex `Client` with their OAuth session
- Use generated lexicon to create a record
- Record is written to user's PDS (Personal Data Server)

### 5.2 Status Picker Component

Create `components/StatusPicker.tsx`:

```typescript
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const EMOJIS = ["👍", "😊", "🎉", "💻", "😴", "💙"];

interface StatusPickerProps {
  currentStatus?: string | null;
}

export function StatusPicker({ currentStatus }: StatusPickerProps) {
  const router = useRouter();
  const [selected, setSelected] = useState<string | null>(currentStatus ?? null);
  const [loading, setLoading] = useState(false);

  async function handleSelect(emoji: string) {
    setLoading(true);
    setSelected(emoji);

    try {
      const res = await fetch("/api/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: emoji }),
      });

      if (!res.ok) {
        throw new Error("Failed to update status");
      }

      router.refresh();
    } catch (err) {
      console.error("Failed to update status:", err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-3">
        Set your status
      </p>
      <div className="flex flex-wrap gap-2">
        {EMOJIS.map((emoji) => (
          <button
            key={emoji}
            onClick={() => handleSelect(emoji)}
            disabled={loading}
            className={`text-2xl p-2 rounded-lg transition-all
              ${selected === emoji
                ? "bg-blue-100 dark:bg-blue-900 ring-2 ring-blue-500"
                : "hover:bg-zinc-100 dark:hover:bg-zinc-800"
              }
              disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
}
```

### 5.3 Update Home Page

Update `app/page.tsx` to include the picker:

```typescript
import { getSession } from "@/lib/auth";
import { LoginForm } from "@/components/LoginForm";
import { LogoutButton } from "@/components/LogoutButton";
import { StatusPicker } from "@/components/StatusPicker";

export default async function Home() {
  const session = await getSession();

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-950">
      <main className="w-full max-w-md mx-auto p-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-100 mb-2">
            Statusphere
          </h1>
          <p className="text-zinc-600 dark:text-zinc-400">
            Set your status on the Atmosphere
          </p>
        </div>

        <div className="bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 p-6">
          {session ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  Signed in as{" "}
                  <span className="font-mono text-xs">{session.did}</span>
                </p>
                <LogoutButton />
              </div>
              <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800">
                <StatusPicker />
              </div>
            </div>
          ) : (
            <LoginForm />
          )}
        </div>
      </main>
    </div>
  );
}
```

### Checkpoint 3: Test Status Submission

```bash
pnpm dev
```

1. Log in
2. Click an emoji
3. Check your Bluesky account - the status record should be created!

You can verify at: `https://bsky.app/profile/YOUR_HANDLE` or via the AT Protocol API.

---

## Part 6: Local Database & Status Feed

Now we'll store statuses locally and display a feed.

### 6.1 Add Queries

Create `lib/db/queries.ts`:

```typescript
import { getDb } from ".";

interface StatusInput {
  uri: string;
  authorDid: string;
  status: string;
  createdAt: string;
  indexedAt: string;
}

export async function insertStatus(data: StatusInput) {
  const db = getDb();
  await db
    .insertInto("status")
    .values(data)
    .onConflict((oc) => oc.column("uri").doUpdateSet(data))
    .execute();
}

export async function getRecentStatuses(limit = 5) {
  const db = getDb();
  return db
    .selectFrom("status")
    .selectAll()
    .orderBy("createdAt", "desc")
    .limit(limit)
    .execute();
}

export async function getAccountStatus(did: string) {
  const db = getDb();
  return db
    .selectFrom("status")
    .selectAll()
    .where("authorDid", "=", did)
    .orderBy("createdAt", "desc")
    .limit(1)
    .executeTakeFirst();
}
```

### 6.2 Save Status on Creation

Update `app/api/status/route.ts` to save locally:

```typescript
import { insertStatus } from "@/lib/db/queries";

// After lexClient.create(), add:
await insertStatus({
  uri: res.uri,
  authorDid: session.did,
  status,
  createdAt,
  indexedAt: createdAt,
});
```

### 6.3 Add Time Helper

Create `lib/util.ts`:

```typescript
export function timeAgo(dateString: string): string {
  const now = new Date();
  const then = new Date(dateString);
  const seconds = Math.floor((now.getTime() - then.getTime()) / 1000);

  if (seconds < 60) return "just now";

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;

  const days = Math.floor(hours / 24);
  return `${days}d`;
}
```

### 6.4 Display Feed

Update `app/page.tsx`:

```typescript
import { getSession } from "@/lib/auth";
import { getRecentStatuses, getAccountStatus } from "@/lib/db/queries";
import { LoginForm } from "@/components/LoginForm";
import { LogoutButton } from "@/components/LogoutButton";
import { StatusPicker } from "@/components/StatusPicker";
import { timeAgo } from "@/lib/util";

export default async function Home() {
  const session = await getSession();
  const statuses = await getRecentStatuses();
  const accountStatus = session ? await getAccountStatus(session.did) : null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-950">
      <main className="w-full max-w-md mx-auto p-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-100 mb-2">
            Statusphere
          </h1>
          <p className="text-zinc-600 dark:text-zinc-400">
            Set your status on the Atmosphere
          </p>
        </div>

        {session ? (
          <div className="bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Signed in
              </p>
              <LogoutButton />
            </div>
            <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800">
              <StatusPicker currentStatus={accountStatus?.status} />
            </div>
          </div>
        ) : (
          <div className="bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 p-6 mb-6">
            <LoginForm />
          </div>
        )}

        <div className="bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 p-6">
          <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-400 mb-3">
            Recent
          </h3>
          {statuses.length === 0 ? (
            <p className="text-zinc-500 dark:text-zinc-400 text-sm">
              No statuses yet. Be the first!
            </p>
          ) : (
            <ul className="space-y-3">
              {statuses.map((s) => (
                <li key={s.uri} className="flex items-center gap-3 text-sm">
                  <span className="text-2xl">{s.status}</span>
                  <span className="text-zinc-600 dark:text-zinc-400 font-mono text-xs truncate flex-1">
                    {s.authorDid}
                  </span>
                  <span className="text-zinc-400 dark:text-zinc-500 text-xs">
                    {timeAgo(s.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </div>
  );
}
```

### Checkpoint 4: Test Local Feed

```bash
pnpm dev
```

1. Log in and set a status
2. The status should appear in the "Recent" feed below
3. Set more statuses - they should stack up

---

## Part 7: Production Deployment

<!-- QUESTION: Should I include the full production OAuth setup (PRIVATE_KEY, JWKS endpoint, etc.) in this tutorial, or keep it development-only and point to separate deployment docs? The production setup adds significant complexity. -->

### 7.1 Environment Variables

For production (e.g., Railway), you'll need:

```env
PUBLIC_URL=https://your-app.railway.app
PRIVATE_KEY={"kty":"EC","kid":"...","alg":"ES256",...}
DATABASE_PATH=/data/statusphere.db
TAP_URL=https://your-tap-server.example.com
TAP_ADMIN_PASSWORD=your-shared-secret
```

### 7.2 Generate Private Key

Create `scripts/gen-key.ts`:

```typescript
import { JoseKey } from "@atproto/oauth-client-node";

async function main() {
  const key = await JoseKey.generate("ES256");
  console.log(JSON.stringify(await key.privateJwk));
}

main();
```

Add to `package.json`:

```json
"gen-key": "tsx scripts/gen-key.ts"
```

Run `pnpm gen-key` and save the output as `PRIVATE_KEY` env var.

### 7.3 Update OAuth Client for Production

See the full `lib/auth/client.ts` in the repo for the production-ready version that:
- Checks for `PUBLIC_URL` and `PRIVATE_KEY`
- Uses confidential client metadata when available
- Falls back to loopback for local development

### 7.4 Add Required Endpoints

For production OAuth, you need:

1. `app/.well-known/jwks.json/route.ts` - Serves public keys
2. `app/oauth-client-metadata.json/route.ts` - Serves client metadata

See the repo for implementations.

---

## Part 8: Real-time Sync with TAP (Optional)

<!-- QUESTION: Should TAP be included in the basic tutorial? It requires running a separate TAP server. Maybe this should be a separate "advanced" section or follow-up tutorial? -->

TAP (Taxon Appliance Protocol) lets you receive real-time updates when any user sets a status.

### 8.1 Install TAP

```bash
pnpm add @atproto/tap
```

### 8.2 TAP Client

Create `lib/tap.ts`:

```typescript
import { Tap } from "@atproto/tap";

const TAP_URL = process.env.TAP_URL || "http://localhost:2480";

let _tap: Tap | null = null;

export const getTap = (): Tap => {
  if (!_tap) {
    _tap = new Tap(TAP_URL);
  }
  return _tap;
};
```

### 8.3 Webhook Handler

Create `app/api/webhook/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { parseTapEvent, assureAdminAuth } from "@atproto/tap";
import { AtUri } from "@atproto/syntax";
import {
  upsertAccount,
  insertStatus,
  deleteStatus,
  deleteAccount,
} from "@/lib/db/queries";
import * as xyz from "@/lib/lexicons/xyz";

const TAP_ADMIN_PASSWORD = process.env.TAP_ADMIN_PASSWORD;

export async function POST(request: NextRequest) {
  // Verify the request is from our TAP server
  if (TAP_ADMIN_PASSWORD) {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    try {
      assureAdminAuth(TAP_ADMIN_PASSWORD, authHeader);
    } catch {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const body = await request.json();
  const evt = parseTapEvent(body);

  // Handle account/identity changes
  if (evt.type === "identity") {
    if (evt.status === "deleted") {
      await deleteAccount(evt.did);
    } else {
      await upsertAccount({
        did: evt.did,
        handle: evt.handle,
        active: evt.isActive ? 1 : 0,
      });
    }
  }

  // Handle status record changes
  if (evt.type === "record") {
    const uri = AtUri.make(evt.did, evt.collection, evt.rkey);

    if (evt.action === "create" || evt.action === "update") {
      let record: xyz.statusphere.status.Main;
      try {
        record = xyz.statusphere.status.$parse(evt.record);
      } catch {
        return NextResponse.json({ success: false });
      }

      await insertStatus({
        uri: uri.toString(),
        authorDid: evt.did,
        status: record.status,
        createdAt: record.createdAt,
        indexedAt: new Date().toISOString(),
      });
    } else if (evt.action === "delete") {
      await deleteStatus(uri.toString());
    }
  }

  return NextResponse.json({ success: true });
}
```

**What's happening:**
- `TAP_ADMIN_PASSWORD` - Shared secret between your app and TAP server
- `assureAdminAuth` - Validates the Basic auth header from TAP
- `identity` events - Handle changes (user renames, deletions)
- `record` events - Status creates/updates/deletes

---

## Summary

You've built:

1. **Database** - SQLite with Kysely for storing statuses
2. **OAuth** - Bluesky authentication with session management
3. **Lexicons** - Schema definition for status records
4. **API** - Routes for status submission
5. **UI** - React components for login and status picking
6. **Feed** - Display of recent statuses

**Next steps:**
- Add user handles (resolve DIDs to `@alice.bsky.social`)
- Add "top statuses" aggregation
- Deploy to production with full OAuth setup
- Add TAP for real-time updates from other users

---

## Open Questions for Review

<!-- These are things I wasn't sure about while writing -->

1. **OAuth scope**: Should the tutorial use `atproto transition:generic` or the specific `atproto repo:xyz.statusphere.status`? The reference app uses `transition:generic` but we used the specific scope.

2. **Production OAuth**: Should the full production OAuth setup (PRIVATE_KEY, JWKS, confidential client) be in this tutorial, or separate deployment docs?

3. **TAP**: Should TAP/webhooks be in the basic tutorial? It requires running a TAP server which adds complexity.

4. **Account table**: The current app has an `account` table for caching handles. Should this be in the basic tutorial or added later?

5. **Current status tracking**: The full app tracks "current" status per user. Should this complexity be in the basic tutorial?

6. **Error handling**: How much error handling should be shown? The tutorial is minimal but the real app has more robust error handling.
