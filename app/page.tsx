import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { LoginForm } from "@/components/LoginForm";
import { LogoutButton } from "@/components/LogoutButton";
import { StatusPicker } from "@/components/StatusPicker";

async function getStatuses() {
  const statuses = await getDb()
    .selectFrom("status")
    .innerJoin("account", "status.authorDid", "account.did")
    .selectAll()
    .orderBy("indexedAt", "desc")
    .limit(20)
    .execute();
  return statuses;
}

async function getMyStatus(did: string) {
  const status = await getDb()
    .selectFrom("status")
    .selectAll()
    .where("authorDid", "=", did)
    .orderBy("indexedAt", "desc")
    .limit(1)
    .executeTakeFirst();
  return status ?? null;
}

export default async function Home() {
  const session = await getSession();
  const statuses = await getStatuses();
  const myStatus = session ? await getMyStatus(session.did) : null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-950">
      <main className="w-full max-w-md mx-auto p-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-100 mb-2">
            Statusphere
          </h1>
          <p className="text-zinc-600 dark:text-zinc-400">
            Set your status on the ATmosphere
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
                  {session.did}
                </p>
              </div>
              <LogoutButton />
            </div>

            <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800">
              <StatusPicker currentStatus={myStatus?.status} />
            </div>
          </div>
        ) : (
          <div className="bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 p-6 mb-6">
            <LoginForm />
          </div>
        )}

        <div className="bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 p-6">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-4">
            Recent Statuses
          </h2>
          {statuses.length === 0 ? (
            <p className="text-zinc-500 dark:text-zinc-400 text-sm">
              No statuses yet. Be the first!
            </p>
          ) : (
            <ul className="space-y-3">
              {statuses.map((s) => (
                <li key={s.uri} className="flex items-center gap-3 text-sm">
                  <span className="text-2xl">{s.status}</span>
                  <span className="text-zinc-600 dark:text-zinc-400 font-mono text-xs truncate">
                    {s.handle}
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
