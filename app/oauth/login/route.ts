import { NextRequest, NextResponse } from "next/server";
import { getOAuthClient } from "@/lib/auth/client";

// POST /oauth/login
// Body: { handle: "alice.bsky.social" }
// Returns: { redirectUrl: "https://..." }

export async function POST(request: NextRequest) {
  try {
    const { handle } = await request.json();

    if (!handle || typeof handle !== "string") {
      return NextResponse.json(
        { error: "Handle is required" },
        { status: 400 },
      );
    }

    const client = getOAuthClient();
    console.log("GOT CLIENT");

    // This resolves the handle, finds their authorization server,
    // and returns the URL to redirect the user to
    const authUrl = await client.authorize(handle, {
      scope: "atproto transition:generic",
      // Optional: pass state that will be returned in the callback
      // state: "your-custom-state",
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
