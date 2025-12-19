import { NextRequest, NextResponse } from "next/server";
import { parseTapEvent } from "@atproto/tap";
import { AtUri } from "@atproto/syntax";
import * as xyz from "@/lib/lexicons/xyz";
import { Database, getDb } from "@/lib/db";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const evt = parseTapEvent(body);
  const db = getDb();
  if (evt.type === "identity") {
    if (evt.status === "deleted") {
      await db.transaction().execute(async (tx) => {
        await tx.deleteFrom("account").where("did", "=", evt.did).execute();
        await tx
          .deleteFrom("status")
          .where("authorDid", "=", evt.did)
          .execute();
      });
    } else {
      await db
        .insertInto("account")
        .values({
          did: evt.did,
          handle: evt.handle,
          active: evt.isActive ? 1 : 0,
        })
        .onConflict((oc) =>
          oc.column("did").doUpdateSet({
            handle: evt.handle,
            active: evt.isActive ? 1 : 0,
          }),
        )
        .execute();
    }
  }
  if (evt.type === "record") {
    const uri = AtUri.make(evt.did, evt.collection, evt.rkey);
    const indexedAt = new Date().toISOString();
    if (evt.action === "create" || evt.action === "update") {
      let record: xyz.statusphere.status.Main;
      try {
        record = xyz.statusphere.status.$parse(evt.record);
      } catch {
        return NextResponse.json({ success: false });
      }

      await db.transaction().execute(async (tx) => {
        await tx
          .insertInto("status")
          .values({
            uri: uri.toString(),
            authorDid: evt.did,
            status: record.status,
            current: 0,
            createdAt: record.createdAt,
            indexedAt: indexedAt,
          })
          .onConflict((oc) =>
            oc.column("uri").doUpdateSet({
              status: record.status,
              createdAt: record.createdAt,
              indexedAt: indexedAt,
            }),
          )
          .execute();
        await setCurrStatus(tx, evt.did);
      });
    } else {
      await db.transaction().execute(async (tx) => {
        await tx
          .deleteFrom("status")
          .where("uri", "=", uri.toString())
          .execute();
        await setCurrStatus(tx, evt.did);
      });
    }
  }
  return NextResponse.json({
    success: true,
  });
}

// expected to be called within tx
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
        .orderBy("createdAt")
        .limit(1),
    )
    .execute();
};
