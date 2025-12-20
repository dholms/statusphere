import { getSession } from "@/lib/auth";
import { LoginForm } from "@/components/LoginForm";
import { LogoutButton } from "@/components/LogoutButton";
import { StatusPicker } from "@/components/StatusPicker";
import { timeAgo } from "@/lib/util";
import {
  getAccountHandle,
  getAccountStatus,
  getRecentStatuses,
  getTopStatuses,
} from "@/lib/db/queries";

export default async function Home() {
  const session = await getSession();
  const statuses = await getRecentStatuses();
  const topStatuses = await getTopStatuses();
  const accntStatus = session ? await getAccountStatus(session.did) : null;
  const accntHandle = session ? await getAccountHandle(session.did) : null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-950">
      <main className="w-full max-w-md mx-auto p-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-100 mb-2">
            Statusphere
          </h1>
          <p className="text-zinc-600 dark:text-zinc-400">
            Set your status on the Atmosphere
          </p>
        </div>

        {session ? (
          <div className="bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  Signed in as
                </p>
                <p className="font-mono text-sm text-zinc-900 dark:text-zinc-100 break-all">
                  {accntHandle}
                </p>
              </div>
              <LogoutButton />
            </div>

            <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800">
              <StatusPicker currentStatus={accntStatus?.status} />
            </div>
          </div>
        ) : (
          <div className="bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 p-6 mb-6">
            <LoginForm />
          </div>
        )}

        <div className="bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 p-6">
          {topStatuses.length > 0 && (
            <div className="mb-4 pb-4 border-b border-zinc-200 dark:border-zinc-800">
              <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-400 mb-2">
                Top
              </h3>
              <div className="flex flex-wrap gap-2">
                {topStatuses.map((s) => (
                  <div
                    key={s.status}
                    className="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-800 rounded-full px-2 py-0.5"
                  >
                    <span className="text-base">{s.status}</span>
                    <span className="text-zinc-500 dark:text-zinc-400 text-xs">
                      {String(s.count)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-400 mb-3">
            Recent
          </h3>
          {statuses.length === 0 ? (
            <p className="text-zinc-500 dark:text-zinc-400 text-sm">
              No statuses yet. Be the first!
            </p>
          ) : (
            <ul className="space-y-3">
              {statuses.map((s) => (
                <li key={s.uri} className="flex items-center gap-3 text-sm">
                  <span className="text-2xl">{s.status}</span>
                  <span className="text-zinc-600 dark:text-zinc-400 font-mono text-xs truncate flex-1">
                    {s.handle}
                  </span>
                  <span className="text-zinc-400 dark:text-zinc-500 text-xs">
                    {timeAgo(s.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </div>
  );
}
