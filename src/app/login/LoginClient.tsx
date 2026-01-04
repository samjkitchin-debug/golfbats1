"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "../lib/supabaseBrowser";

function siteOrigin() {
  const env = process.env.NEXT_PUBLIC_SITE_URL;
  if (env && env.startsWith("http")) return env.replace(/\/$/, "");
  if (typeof window === "undefined") return "";
  return window.location.origin.replace(/\/$/, "");
}

function isValidEmail(v: string) {
  const s = v.trim();
  // Simple, pragmatic validation for UI only
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

export default function LoginClient() {
  const params = useSearchParams();

  const error = useMemo(() => params.get("error"), [params]);
  const msg = useMemo(() => params.get("msg"), [params]);

  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState<null | "magic" | "google">(null);
  const [message, setMessage] = useState<string | null>(null);

  // Create ONE browser client for this component lifecycle.
  // Helps avoid edge cases where multiple clients compete to manage PKCE/session state.
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  // If we land here with an error from callback/confirm, show it,
  // but also clear any previous success messages.
  useEffect(() => {
    if (error) setMessage(null);
  }, [error]);

  async function signInMagicLink() {
    setMessage(null);

    const cleaned = email.trim();
    if (!isValidEmail(cleaned)) {
      setMessage("Please enter a valid email address.");
      return;
    }

    setBusy("magic");

    try {
      const base = siteOrigin();
      if (!base) throw new Error("Site origin unavailable.");

      const emailRedirectTo = `${base}/auth/confirm?next=/`;

      const { error } = await supabase.auth.signInWithOtp({
        email: cleaned,
        options: {
          emailRedirectTo,
        },
      });

      if (error) throw error;

      setMessage("Magic link sent. Check your email.");
    } catch (e: any) {
      setMessage(e?.message || "Failed to send magic link.");
    } finally {
      setBusy(null);
    }
  }

  async function signInGoogle() {
    setMessage(null);
    setBusy("google");

    try {
      const base = siteOrigin();
      if (!base) throw new Error("Site origin unavailable.");

      // OAuth should always use the callback route (code exchange happens server-side).
      const redirectTo = `${base}/auth/callback?next=/`;

      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo,
          // Optional: keep it explicit; avoids ambiguity if you ever add more scopes.
          // scopes: "email profile",
        },
      });

      if (error) throw error;
      // Redirect happens automatically.
    } catch (e: any) {
      setMessage(e?.message || "Failed to start Google sign-in.");
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-md px-4 py-10">
      <h1 className="text-2xl font-semibold">Sign in</h1>
      <p className="mt-2 text-sm text-neutral-600">
        Sign in to GolfBats to RSVP, view trips, and access admin tools (if authorized).
      </p>

      {error ? (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          Sign-in error: <span className="font-medium">{error}</span>
          {msg ? <div className="mt-1 break-words text-xs text-red-700">{msg}</div> : null}
        </div>
      ) : null}

      {message ? (
        <div className="mt-4 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm">
          {message}
        </div>
      ) : null}

      <div className="mt-6 space-y-3">
        <label className="block">
          <span className="text-sm font-medium">Email</span>
          <input
            className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:ring"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@domain.com"
            autoComplete="email"
            inputMode="email"
          />
        </label>

        <button
          className="w-full rounded-lg bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          onClick={signInMagicLink}
          disabled={!isValidEmail(email) || busy !== null}
        >
          {busy === "magic" ? "Sending…" : "Send magic link"}
        </button>

        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-neutral-200" />
          <span className="text-xs text-neutral-500">or</span>
          <div className="h-px flex-1 bg-neutral-200" />
        </div>

        <button
          className="w-full rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium disabled:opacity-50"
          onClick={signInGoogle}
          disabled={busy !== null}
        >
          {busy === "google" ? "Opening Google…" : "Continue with Google"}
        </button>

        <p className="pt-2 text-xs text-neutral-500">Admin access is restricted to approved emails.</p>
      </div>
    </div>
  );
}
