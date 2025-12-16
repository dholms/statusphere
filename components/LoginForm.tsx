"use client";

import { useState } from "react";

export function LoginForm() {
  const [handle, setHandle] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/oauth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handle: handle.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Login failed");
      }

      // Redirect to the authorization server
      window.location.href = data.redirectUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4">
      <div>
        <label
          htmlFor="handle"
          className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1"
        >
          Handle
        </label>
        <input
          id="handle"
          type="text"
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
          placeholder="alice.bsky.social"
          required
          disabled={loading}
          className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-md
                     bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100
                     placeholder:text-zinc-400 dark:placeholder:text-zinc-500
                     focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                     disabled:opacity-50 disabled:cursor-not-allowed"
        />
      </div>

      {error && (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      <button
        type="submit"
        disabled={loading || !handle.trim()}
        className="w-full px-4 py-2 bg-blue-600 text-white font-medium rounded-md
                   hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
                   disabled:opacity-50 disabled:cursor-not-allowed
                   transition-colors"
      >
        {loading ? "Signing in..." : "Sign in with Bluesky"}
      </button>
    </form>
  );
}
