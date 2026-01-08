import { NextRequest, NextResponse } from "next/server";
import { getOAuthClient } from "@/lib/auth/client";

const PUBLIC_URL = process.env.PUBLIC_URL || "http://localhost:3000";

// GET /oauth/callback?code=...&state=...&iss=...
// This is where the authorization server redirects after user approves

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;

    const client = await getOAuthClient();

    // Exchange the authorization code for a session
    // This also validates the state and PKCE
    const { session } = await client.callback(params);

    // Redirect to home page after successful login
    const response = NextResponse.redirect(new URL("/", PUBLIC_URL));

    // Set the DID cookie on the response
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
