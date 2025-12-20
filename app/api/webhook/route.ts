import { NextRequest, NextResponse } from "next/server";
import { parseTapEvent } from "@atproto/tap";
import { AtUri } from "@atproto/syntax";
import * as xyz from "@/lib/lexicons/xyz";
import {
  upsertAccount,
  insertStatus,
  deleteStatus,
  deleteAccount,
} from "@/lib/db/queries";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const evt = parseTapEvent(body);
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

      await insertStatus({
        uri: uri.toString(),
        authorDid: evt.did,
        status: record.status,
        current: 0,
        createdAt: record.createdAt,
        indexedAt: indexedAt,
      });
    } else {
      await deleteStatus(uri);
    }
  }
  return NextResponse.json({
    success: true,
  });
}
