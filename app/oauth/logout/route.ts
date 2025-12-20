import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getOAuthClient } from "@/lib/auth/client";

// POST /oauth/logout
// Revokes the session and clears the cookie

export async function POST() {
  try {
    const cookieStore = await cookies();
    const did = cookieStore.get("did")?.value;

    if (did) {
      const client = getOAuthClient();
      // Revoke the session (tells the PDS to invalidate tokens)
      await client.revoke(did);
    }

    // Clear the cookie
    cookieStore.delete("did");

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Logout error:", error);

    // Still clear the cookie even if revoke fails
    const cookieStore = await cookies();
    cookieStore.delete("did");

    return NextResponse.json({ success: true });
  }
}
