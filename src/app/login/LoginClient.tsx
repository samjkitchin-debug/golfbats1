"use client";

import { useMemo, useState } from "react";
import { createSupabaseBrowserClient } from "../lib/supabaseBrowser";

export default function LoginClient() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState<null | "magic" | "google" | "apple" | "facebook">(null);
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

  async function signInOAuth(provider: "google" | "apple" | "facebook") {
    setMessage(null);
    setBusy(provider);

    try {
      const origin = window.location.origin.replace(/\/$/, "");
      const redirectTo = `${origin}/auth/callback?next=/`;

      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo },
      });

      if (error) throw error;
    } catch (e: any) {
      const providerName = provider === "google" ? "Google" : provider === "apple" ? "Apple" : "Facebook";
      setMessage(e?.message ?? `Unable to sign in with ${providerName}.`);
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col items-center">
      {message && (
        <div className="mb-4 w-full rounded-lg border border-border bg-surface px-3 py-2 text-center text-sm text-foreground">
          {message}
        </div>
      )}

      <div className="flex w-full flex-col gap-3">
        {/* OAuth buttons */}
        <button
          onClick={() => signInOAuth("google")}
          disabled={busy !== null}
          className="flex w-full items-center justify-center gap-3 rounded-xl border border-border bg-surface px-4 py-4 text-base font-medium text-foreground hover:bg-background disabled:opacity-50"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              fill="#4285F4"
            />
            <path
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              fill="#34A853"
            />
            <path
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              fill="#FBBC05"
            />
            <path
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              fill="#EA4335"
            />
          </svg>
          {busy === "google" ? "Opening Google…" : "Continue with Google"}
        </button>

        <button
          disabled
          className="flex w-full items-center justify-center gap-3 rounded-xl border border-border bg-surface px-4 py-4 text-base font-medium text-foreground opacity-50 cursor-not-allowed"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
            <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zm-5.02-13.03c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
          </svg>
          Continue with Apple
        </button>

        <button
          disabled
          className="flex w-full items-center justify-center gap-3 rounded-xl border border-border bg-surface px-4 py-4 text-base font-medium text-foreground opacity-50 cursor-not-allowed"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path
              d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"
              fill="currentColor"
            />
          </svg>
          Continue with Facebook
        </button>

        {/* Divider */}
        <div className="my-1 flex items-center gap-3">
          <div className="flex-1 border-t border-border"></div>
          <span className="text-sm text-muted">or</span>
          <div className="flex-1 border-t border-border"></div>
        </div>

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
          {busy === "magic" ? "Sending link…" : "Send sign-in link"}
        </button>

        <p className="mt-1 text-center text-xs text-muted">
          We'll email you a secure sign-in link — no password needed.
        </p>
      </div>
    </div>
  );
}
