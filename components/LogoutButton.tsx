"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function LogoutButton() {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleLogout() {
    setLoading(true);

    try {
      await fetch("/oauth/logout", { method: "POST" });
      router.refresh();
    } catch (err) {
      console.error("Logout failed:", err);
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleLogout}
      disabled={loading}
      className="px-3 py-1.5 text-sm text-zinc-600 dark:text-zinc-400
                 hover:text-zinc-900 dark:hover:text-zinc-100
                 disabled:opacity-50 disabled:cursor-not-allowed
                 transition-colors"
    >
      {loading ? "Signing out..." : "Sign out"}
    </button>
  );
}
