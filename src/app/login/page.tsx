"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function LoginForm() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/";
  const linkError = searchParams.get("error") === "link";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [usePassword, setUsePassword] = useState(false);
  const [status, setStatus] = useState<
    | { kind: "idle" }
    | { kind: "sending" }
    | { kind: "sent" }
    | { kind: "error"; message: string }
  >({ kind: "idle" });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus({ kind: "sending" });
    const supabase = createClient();

    if (usePassword) {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) {
        setStatus({ kind: "error", message: error.message });
      } else {
        window.location.assign(next);
      }
      return;
    }

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
        shouldCreateUser: false,
      },
    });
    if (error) {
      setStatus({ kind: "error", message: error.message });
    } else {
      setStatus({ kind: "sent" });
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-brand-50 to-brand-100 px-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-8 shadow-sm">
        <div className="mb-6">
          <div className="mb-1 text-2xl font-semibold text-brand-800">
            Tally Insights
          </div>
          <p className="text-sm text-muted">
            District sentiment intelligence for legislative teams. Sign in with
            your work email.
          </p>
        </div>

        {linkError && (
          <div className="mb-4 rounded-md border border-brand-300 bg-brand-50 px-3 py-2 text-sm text-brand-800">
            That sign in link was invalid or expired. Request a new one.
          </div>
        )}

        {status.kind === "sent" ? (
          <div className="rounded-md border border-brand-300 bg-brand-50 px-3 py-3 text-sm text-brand-800">
            Check your email. We sent a sign in link to{" "}
            <span className="font-medium">{email}</span>.
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <label className="block">
              <span className="mb-1 block text-sm font-medium">Email</span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
                placeholder="you@organization.org"
              />
            </label>

            {usePassword && (
              <label className="block">
                <span className="mb-1 block text-sm font-medium">Password</span>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
                />
              </label>
            )}

            {status.kind === "error" && (
              <p className="text-sm text-brand-800">
                Sign in failed: {status.message}
              </p>
            )}

            <button
              type="submit"
              disabled={status.kind === "sending"}
              className="w-full rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
            >
              {status.kind === "sending"
                ? "Working..."
                : usePassword
                  ? "Sign in"
                  : "Email me a sign in link"}
            </button>

            <button
              type="button"
              onClick={() => setUsePassword((v) => !v)}
              className="w-full text-center text-xs text-muted underline-offset-2 hover:underline"
            >
              {usePassword
                ? "Use an emailed sign in link instead"
                : "Sign in with a password instead"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
