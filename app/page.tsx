import { getSession } from "@/lib/auth";
import { LoginForm } from "@/components/LoginForm";
import { LogoutButton } from "@/components/LogoutButton";

export default async function Home() {
  const session = await getSession();
  console.log("SESSION: ", session);

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
          <div className="bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 p-6">
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
              <p className="text-zinc-600 dark:text-zinc-400 text-sm">
                You&apos;re logged in! Next step: add status functionality.
              </p>
            </div>
          </div>
        ) : (
          <div className="bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 p-6">
            <LoginForm />
          </div>
        )}
      </main>
    </div>
  );
}
