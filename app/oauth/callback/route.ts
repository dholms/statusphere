import { NextRequest, NextResponse } from "next/server";
import { getOAuthClient } from "@/lib/auth/client";

// GET /oauth/callback?code=...&state=...&iss=...
// This is where the authorization server redirects after user approves

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;

    const client = getOAuthClient();

    // Exchange the authorization code for a session
    // This also validates the state and PKCE
    const { session } = await client.callback(params);

    // Redirect to home page after successful login
    const response = NextResponse.redirect(new URL("http://127.0.0.1:3000/"));

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

    return NextResponse.redirect(new URL("http://127.0.0.1:3000/?error=login_failed"));
  }
}
