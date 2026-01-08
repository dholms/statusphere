import { NextResponse } from "next/server";
import { getOAuthClient } from "@/lib/auth/client";

// GET /.well-known/jwks.json
// Serves the public keys for the OAuth client
// Required for confidential clients using private_key_jwt authentication

export async function GET() {
  const client = await getOAuthClient();
  return NextResponse.json(client.jwks);
}
