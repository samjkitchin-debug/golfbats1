"use client";

import { useMemo, useState } from "react";
import { createSupabaseBrowserClient } from "../lib/supabaseBrowser";

export default function LoginClient() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState<null | "magic" | "google">(null);
  const [message, setMessage] = useState<string | null>(null);

  async function signInMagicLink() {
    setMessage(null);
    setBusy("magic");

    try {
      const origin = window.location.origin.replace(/\/$/, "");
      const emailRedirectTo = `${origin}/auth/confirm?next=/`;

      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo },
      });

      if (error) throw error;
      setMessage("Check your email for the sign-in link.");
    } catch (e: any) {
      setMessage(e?.message ?? "Unable to send sign-in link.");
    } finally {
      setBusy(null);
    }
  }

  async function signInGoogle() {
    setMessage(null);
    setBusy("google");

    try {
      const origin = window.location.origin.replace(/\/$/, "");
      const redirectTo = `${origin}/auth/callback?next=/`;

      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo },
      });

      if (error) throw error;
    } catch (e: any) {
      setMessage(e?.message ?? "Unable to sign in with Google.");
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col items-center">
      <h2 className="mb-6 text-center text-xl font-semibold text-foreground">
        Sign in
      </h2>

      {message && (
        <div className="mb-4 w-full rounded-lg border border-border bg-surface px-3 py-2 text-center text-sm text-foreground">
          {message}
        </div>
      )}

      <div className="flex w-full flex-col gap-4">
        {/* Google */}
        <button
          onClick={signInGoogle}
          disabled={busy !== null}
          className="w-full rounded-xl border border-border bg-surface px-4 py-4 text-base font-medium text-foreground hover:bg-background disabled:opacity-50"
        >
          {busy === "google" ? "Opening Google…" : "Continue with Google"}
        </button>

        {/* Divider */}
        <div className="text-center text-sm text-muted">or</div>

        {/* Email */}
        <input
          type="email"
          placeholder="Email address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-xl border border-border bg-surface px-3 py-4 text-base text-foreground placeholder:text-muted outline-none"
        />

        <button
          onClick={signInMagicLink}
          disabled={busy !== null || !email}
          className="w-full rounded-xl bg-brand-green px-4 py-4 text-base font-medium text-white disabled:opacity-50"
        >
          {busy === "magic" ? "Sending link…" : "Email me a sign-in link"}
        </button>
      </div>
    </div>
  );
}
