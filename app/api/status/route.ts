import { NextRequest, NextResponse } from "next/server";
import { Client } from "@atproto/lex";
import { getOAuthClient, getSession } from "@/lib/auth";

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

  const res = await lexClient.create(xyz.statusphere.status, {
    status,
    createdAt: new Date().toISOString(),
  });

  return NextResponse.json({
    success: true,
    status,
    uri: res.uri,
    cid: res.cid,
  });
}
