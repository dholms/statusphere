import { NextRequest, NextResponse } from "next/server";
import { Client } from "@atproto/lex";
import { getOAuthClient, getSession } from "@/lib/auth";
import { Database, getDb } from "@/lib/db";

import * as xyz from "@/lib/lexicons/xyz";

// POST /api/status
// Body: { status: "😊" }

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { status } = await request.json();

  if (!status || typeof status !== "string") {
    return NextResponse.json({ error: "Status is required" }, { status: 400 });
  }

  const oauthSession = await getOAuthClient().restore(session.did);
  const lexClient = new Client(oauthSession);

  const createdAt = new Date().toISOString();
  const res = await lexClient.create(xyz.statusphere.status, {
    status,
    createdAt,
  });

  // Optimistic write to local DB
  const db = getDb();
  await db.transaction().execute(async (tx) => {
    await tx
      .insertInto("status")
      .values({
        uri: res.uri,
        authorDid: session.did,
        status,
        current: 0,
        createdAt,
        indexedAt: new Date().toISOString(),
      })
      .onConflict((oc) =>
        oc.column("uri").doUpdateSet({
          status,
          createdAt,
          indexedAt: new Date().toISOString(),
        }),
      )
      .execute();
    await setCurrStatus(tx, session.did);
  });

  return NextResponse.json({
    success: true,
    status,
    uri: res.uri,
    cid: res.cid,
  });
}

const setCurrStatus = async (tx: Database, did: string) => {
  await tx
    .updateTable("status")
    .set({ current: 0 })
    .where("authorDid", "=", did)
    .where("current", "=", 1)
    .execute();
  await tx
    .updateTable("status")
    .set({ current: 1 })
    .where("uri", "=", (db) =>
      db
        .selectFrom("status")
        .select("uri")
        .where("authorDid", "=", did)
        .orderBy("createdAt", "desc")
        .limit(1),
    )
    .execute();
};
