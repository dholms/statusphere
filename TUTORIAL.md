# Building Statusphere: Custom Records with AT Protocol

Build a status-setting app using custom Lexicons and real-time sync.

**What you'll build:** Users pick an emoji status and see a live feed of everyone's statuses.

**Prerequisites:** Complete the [next-oauth tutorial](../next-oauth/TUTORIAL.md) first. This tutorial builds on that foundation.

---

## Part 1: Setup

### 1.1 Clone or Copy

Start from a completed next-oauth app, or copy the files over to a new project.

### 1.2 Install Additional Dependencies

```bash
pnpm add @atproto/common-web @atproto/lex @atproto/syntax @atproto/tap
```

**What these do:**
- `@atproto/common-web` - Basic AT Protocol utilities including DID document parsing
- `@atproto/lex` - Lexicon (schema) generation and validation
- `@atproto/syntax` - AT Protocol URI parsing
- `@atproto/tap` - Client library for TAP real-time sync

### 1.3 Install the Lexicon CLI Tool

```bash
npm install -g @atproto/lex
```

The Lexicon CLI tool can be run using the `lex` command, however this command might conflict with other binaries installed on your system. If that happens, you can also run the CLI using `ts-lex`.

---

## Part 2: Lexicons (Data Schema)

Lexicons define the schema for records in AT Protocol.

### 2.1 Install the Statusphere lexicon

```bash
ts-lex install xyz.statusphere.status
```

Note the downloaded lexicon file at `lib/lexicons/xyz.statusphere.status.json`.

### 2.2 Generate TypeScript Code

Add to `package.json` scripts for building the lexicon definitions into Typescript code:

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

The recommendation is to check the Lexicon schema files into git but not generated code into git. 

### 2.3 Update OAuth Scope

We're going to be working with records in the `xyz.statusphere.status` collection for our users, so let's update the `SCOPE` constant in `lib/auth/client.ts` to request access to this collection:

```typescript
export const SCOPE = "atproto repo:xyz.statusphere.status";
```

---

## Part 3: Database Schema

Add tables for statusphere-specific data.

### 3.1 Update Database Schema

Update `lib/db/index.ts` to add the new tables:

```typescript
export interface DatabaseSchema {
  auth_state: AuthStateTable;
  auth_session: AuthSessionTable;
  account: AccountTable;   // New
  status: StatusTable;     // New
}

// ... existing auth tables ...

export interface AccountTable {
  did: string;
  handle: string;
  active: 0 | 1; 
}

export interface StatusTable {
  uri: string;
  authorDid: string;
  status: string;
  createdAt: string;
  indexedAt: string;
  current: 0 | 1;
}
```

### 3.2 Add Migration

Update `lib/db/migrations.ts` to create the new tables:

```typescript
const migrations: Record<string, Migration> = {
  "001": {
    async up(db: Kysely<unknown>) {
      // ... existing auth tables ...

      await db.schema
        .createTable("account")
        .addColumn("did", "text", (col) => col.primaryKey())
        .addColumn("handle", "text", (col) => col.notNull())
        .addColumn("active", "integer", (col) => col.notNull().defaultTo(1))
        .execute();

      await db.schema
        .createTable("status")
        .addColumn("uri", "text", (col) => col.primaryKey())
        .addColumn("authorDid", "text", (col) => col.notNull())
        .addColumn("status", "text", (col) => col.notNull())
        .addColumn("createdAt", "text", (col) => col.notNull())
        .addColumn("indexedAt", "text", (col) => col.notNull())
        .addColumn("current", "integer", (col) => col.notNull().defaultTo(0))
        .execute();

      await db.schema
        .createIndex("status_current_idx")
        .on("status")
        .columns(["current", "indexedAt"])
        .execute();
    },
    // ... down migration ...
  },
};
```

### 3.3 Add Database Queries

Create `lib/db/queries.ts`:

```typescript
import { getDb, AccountTable, StatusTable } from ".";

export async function getRecentStatuses() {
  const db = getDb();
  return db
    .selectFrom("status")
    .innerJoin("account", "status.authorDid", "account.did")
    .selectAll()
    .where("current", "=", 1)
    .orderBy("createdAt", "desc")
    .limit(5)
    .execute();
}

export async function getAccountStatus(did: string) {
  const db = getDb();
  const status = await db
    .selectFrom("status")
    .selectAll()
    .where("authorDid", "=", did)
    .orderBy("createdAt", "desc")
    .limit(1)
    .executeTakeFirst();
  return status ?? null;
}

export async function insertStatus(data: StatusTable) {
  // Insert and update current status tracking
  getDb()
    .transaction()
    .execute(async (tx) => {
      await tx
        .insertInto("status")
        .values(data)
        .onConflict((oc) =>
          oc.column("uri").doUpdateSet({
            status: data.status,
            createdAt: data.createdAt,
            indexedAt: data.indexedAt,
          }),
        )
        .execute();
      // Mark this as current, unmark others
      await tx
        .updateTable("status")
        .set({ current: 0 })
        .where("authorDid", "=", data.authorDid)
        .where("current", "=", 1)
        .execute();
      await tx
        .updateTable("status")
        .set({ current: 1 })
        .where("uri", "=", data.uri)
        .execute();
    });
}

export async function upsertAccount(data: AccountTable) {
  await getDb()
    .insertInto("account")
    .values(data)
    .onConflict((oc) =>
      oc.column("did").doUpdateSet({
        handle: data.handle,
        active: data.active,
      }),
    )
    .execute();
}
```

Run migrations:

```bash
pnpm migrate
```

---

## Part 4: Status Submission

### 4.1 Status API Route

Create `app/api/status/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { Client } from "@atproto/lex";
import { getOAuthClient, getSession } from "@/lib/auth";
import { insertStatus, upsertAccount } from "@/lib/db/queries";
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

  // Save locally for immediate display
  await insertStatus({
    uri: res.uri,
    authorDid: session.did,
    status,
    createdAt,
    indexedAt: createdAt,
    current: 1,
  });

  // Cache account info
  await upsertAccount({
    did: session.did,
    handle: oauthSession.handle ?? session.did,
    active: 1,
  });

  return NextResponse.json({
    success: true,
    uri: res.uri,
  });
}
```

**What's happening:**
- Verify user is logged in
- Create a lex `Client` with their OAuth session
- Use generated lexicon to create a record on their PDS
- Save locally for immediate display

### 4.2 Status Picker Component

Create `components/StatusPicker.tsx`:

```typescript
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const EMOJIS = ["👍", "👎", "💙", "🔥", "😆", "😢", "🤔", "😴", "🎉", "🤩", "😭", "🥳", "😤", "💀", "✨", "👀", "🙏", "📚", "💻", "🍕", "🌴"];

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
      setSelected(currentStatus ?? null);
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

### 4.3 Update Home Page

Update `app/page.tsx` to show statuses:

```typescript
import { getSession } from "@/lib/auth";
import { getRecentStatuses, getAccountStatus } from "@/lib/db/queries";
import { LoginForm } from "@/components/LoginForm";
import { LogoutButton } from "@/components/LogoutButton";
import { StatusPicker } from "@/components/StatusPicker";

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
            <StatusPicker currentStatus={accountStatus?.status} />
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
                <li key={s.uri} className="flex items-center gap-3">
                  <span className="text-2xl">{s.status}</span>
                  <span className="text-zinc-600 dark:text-zinc-400 text-sm">
                    @{s.handle}
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

### Checkpoint: Test Status Submission

```bash
pnpm dev
```

1. Log in at http://127.0.0.1:3000
2. Click an emoji to set your status
3. The status should appear in the Recent feed

---

## Part 5: Real-time Sync with TAP

TAP (Taxon Appliance Protocol) provides real-time updates when any user sets a status.

### 5.1 TAP Client

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

### 5.2 Webhook Handler

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
  // Verify request is from our TAP server
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
        current: 1,
      });
    } else if (evt.action === "delete") {
      await deleteStatus(uri);
    }
  }

  return NextResponse.json({ success: true });
}
```

### 5.3 Environment Variables

Add to your environment:

```env
TAP_URL=https://your-tap-server.example.com
TAP_ADMIN_PASSWORD=your-shared-secret
```

The `TAP_ADMIN_PASSWORD` is a shared secret between your app and the TAP server to verify webhook authenticity.

---

## Summary

You've extended the OAuth tutorial with:

1. **Lexicons** - Custom schema for status records
2. **Status API** - Write records to user's PDS
3. **Local Storage** - Cache statuses for display
4. **TAP Integration** - Real-time updates from other users

The key AT Protocol concepts demonstrated:

- **Lexicons** define your data schema
- **Records** are stored in user repositories on their PDS
- **OAuth scopes** grant access to specific record types
- **TAP** provides real-time sync across the network

**Next steps:**
- Add "top statuses" aggregation
- Add profile links to Bluesky
- Deploy to production (see [RAILWAY_DEPLOY.md](./RAILWAY_DEPLOY.md))
