import { NextResponse } from "next/server";

// This endpoint serves the OAuth client metadata
// The URL of this endpoint IS your client_id
// Authorization servers fetch this to learn about your app

const PUBLIC_URL = process.env.PUBLIC_URL || "http://localhost:3000";

export async function GET() {
  return NextResponse.json({
    // The client_id MUST be this URL itself
    client_id: `${PUBLIC_URL}/oauth-client-metadata.json`,
    client_name: "Statusphere",
    client_uri: PUBLIC_URL,
    logo_uri: `${PUBLIC_URL}/logo.png`,
    tos_uri: `${PUBLIC_URL}/tos`,
    policy_uri: `${PUBLIC_URL}/policy`,
    jwks_uri: `${PUBLIC_URL}/.well-known/jwks.json`,
    redirect_uris: [`${PUBLIC_URL}/oauth/callback`],
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    scope: "atproto repo:xyz.statusphere.status",
    token_endpoint_auth_method: "private_key_jwt",
    application_type: "web",
    dpop_bound_access_tokens: true,
  });
}
