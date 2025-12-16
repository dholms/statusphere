import { cookies } from "next/headers";
import { getOAuthClient } from "./client";
import type { OAuthSession } from "@atproto/oauth-client-node";

// Get the current user's session (for server components/routes)
// Returns null if not logged in

export async function getSession(): Promise<OAuthSession | null> {
  const cookieStore = await cookies();
  const did = cookieStore.get("did")?.value;

  console.log("getSession - did from cookie:", did);

  if (!did) {
    return null;
  }

  try {
    const client = getOAuthClient();
    // Restore the session from the store
    // This will refresh the token if needed
    const session = await client.restore(did);
    console.log("getSession - restored session:", !!session);
    return session;
  } catch (error) {
    console.error("Failed to restore session:", error);
    return null;
  }
}

// Get just the DID without restoring the full session
// Useful for quick checks
export async function getDid(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get("did")?.value ?? null;
}
