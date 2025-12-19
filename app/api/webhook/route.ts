import { NextRequest, NextResponse } from "next/server";
import { parseTapEvent } from "@atproto/tap";
import { AtUri } from "@atproto/syntax";
// import { Client } from "@atproto/lex";
// import { getOAuthClient, getSession } from "@/lib/auth";
import * as xyz from "@/lib/lexicons/xyz";
import { getDb } from "@/lib/db";
import { success } from "@atproto/lex";

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
    if (evt.action === "create" || evt.action === "update") {
      let record: xyz.statusphere.status.Main;
      try {
        record = xyz.statusphere.status.$parse(evt.record);
      } catch {
        return NextResponse.json({ success: false });
      }

      const uri = AtUri.make(evt.did, evt.collection, evt.rkey);
      const indexedAt = new Date().toISOString();
      await db
        .insertInto("status")
        .values({
          uri: uri.toString(),
          authorDid: evt.did,
          status: record.status,
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
    }
  }
  return NextResponse.json({
    success: true,
  });
}
