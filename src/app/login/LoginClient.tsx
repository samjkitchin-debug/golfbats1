"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "../lib/supabaseBrowser";

function currentOrigin() {
  // IMPORTANT:
  // During domain migrations, OAuth PKCE verifier is stored for the origin that initiated the flow.
  // If redirectTo uses a different origin, callback exchange fails with "PKCE code verifier not found".
  //
  // Therefore: in the browser, always use window.location.origin.
  if (typeof window !== "undefined") return window.location.origin.replace(/\/$/, "");

  // Fallback (should not be used in this client component, but safe)
  const env = process.env.NEXT_PUBLIC_SITE_URL;
  if (env && env.startsWith("http")) return env.replace(/\/$/, "");
  return "";
}

function isValidEmail(v: string) {
  const s = v.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

export default function LoginClient() {
  const params = useSearchParams();
  const error = params.get("error");
  const msg = params.get("msg");

  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState<null | "magic" | "google">(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (error) {
      const detail = msg ? `: ${decodeURIComponent(msg)}` : "";
      setMessage(`Sign-in error: ${error}${detail}`);
    }
  }, [error, msg]);

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
      const base = currentOrigin();
      if (!base) throw new Error("Site origin unavailable.");

      // Keep the redirect on the SAME origin that initiated the auth request.
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
      const base = currentOrigin();
      if (!base) throw new Error("Site origin unavailable.");

      // OAuth should always use the callback route (code exchange happens server-side).
      // Keep redirectTo on the SAME origin to avoid PKCE verifier mismatch.
      const redirectTo = `${base}/auth/callback?next=/`;

      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo,
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

      {message ? (
        <div className="mt-4 rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-800">
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
          disabled={busy !== null}
        >
          {busy === "magic" ? "Sending…" : "Send magic link"}
        </button>

        <div className="flex items-center gap-3 py-2">
          <div className="h-px flex-1 bg-neutral-200" />
          <div className="text-xs text-neutral-500">or</div>
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
