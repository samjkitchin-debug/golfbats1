"use client";

import { useMemo, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "../lib/supabaseBrowser";
import { InlineNotice } from "../components/InlineNotice";
import Link from "next/link";

export default function ResetPasswordPage() {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [hasValidSession, setHasValidSession] = useState<boolean | null>(null);

  useEffect(() => {
    async function checkSession() {
      const { data: { session } } = await supabase.auth.getSession();
      setHasValidSession(!!session);
    }
    checkSession();
  }, [supabase]);

  async function handleUpdatePassword() {
    setError(null);
    setSuccess(false);

    if (!newPassword) {
      setError("Enter a new password.");
      return;
    }

    if (!confirmPassword) {
      setError("Confirm your password.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setBusy(true);

    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) throw error;
      setSuccess(true);
    } catch (e: any) {
      setError("Couldn't update your password. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (hasValidSession === null) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background px-4">
        <div className="w-full max-w-md">
          <div className="text-center text-sm text-muted">Loading…</div>
        </div>
      </div>
    );
  }

  if (!hasValidSession) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background px-4">
        <div className="w-full max-w-md">
          <InlineNotice
            variant="warning"
            title="This reset link is no longer valid"
            body="Request a new one from the sign-in page."
          />
          <div className="mt-4">
            <Link href="/login" className="btn-ghost w-full text-center">
              Back to sign in
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        <h1 className="mb-6 text-center text-2xl font-semibold text-foreground">
          Set a new password
        </h1>

        {error && (
          <div className="mb-4 w-full rounded-lg border border-border bg-surface px-3 py-2 text-center text-sm text-foreground">
            {error}
          </div>
        )}

        {success && (
          <div className="mb-4 w-full rounded-lg border border-border bg-surface px-3 py-2 text-center text-sm text-foreground">
            Password updated.
          </div>
        )}

        <div className="flex w-full flex-col gap-3">
          <div>
            <label className="text-sm text-muted">New password</label>
            <input
              type="password"
              placeholder="••••••••"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="mt-1 w-full rounded-xl border border-border bg-surface px-3 py-4 text-base text-foreground placeholder:text-muted outline-none"
            />
          </div>
          <div>
            <label className="text-sm text-muted">Confirm password</label>
            <input
              type="password"
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="mt-1 w-full rounded-xl border border-border bg-surface px-3 py-4 text-base text-foreground placeholder:text-muted outline-none"
            />
          </div>
          <button
            onClick={success ? () => router.push("/") : handleUpdatePassword}
            disabled={busy}
            className="w-full rounded-xl btn-anticipation px-4 py-4 text-base font-medium disabled:opacity-50"
          >
            {busy ? "Updating…" : success ? "Continue" : "Update password"}
          </button>
        </div>
      </div>
    </div>
  );
}
