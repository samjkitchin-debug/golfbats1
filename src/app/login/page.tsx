"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "../lib/supabaseBrowser";

export default function LoginPage() {
  const params = useSearchParams();
  const error = useMemo(() => params.get("error"), [params]);

  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState<null | "magic" | "google" | "signout">(null);
  const [message, setMessage] = useState<string | null>(null);

  const configured =
    !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  async function signInMagicLink() {
    setMessage(null);
    setBusy("magic");

    try {
      const supabase = createSupabaseBrowserClient();
      const emailRedirectTo = `${window.location.origin}/auth/confirm?next=/`;

      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo },
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
      const supabase = createSupabaseBrowserClient();
      const redirectTo = `${window.location.origin}/auth/callback?next=/`;

      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo },
      });

      if (error) throw error;
      // OAuth redirects away.
    } catch (e: any) {
      setMessage(e?.message || "Failed to start Google sign-in.");
      setBusy(null);
    }
  }

  async function signOut() {
    setMessage(null);
    setBusy("signout");

    try {
      const supabase = createSupabaseBrowserClient();
      await supabase.auth.signOut();
      setMessage("Signed out.");
    } catch (e: any) {
      setMessage(e?.message || "Failed to sign out.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-md px-4 py-10">
      <h1 className="text-2xl font-semibold">Sign in</h1>
      <p className="mt-2 text-sm text-neutral-600">
        Sign in to GolfBats to RSVP, view trips, and access admin tools (if authorized).
      </p>

      {!configured ? (
        <div className="mt-4 rounded-lg border border-yellow-200 bg-yellow-50 px-3 py-2 text-sm text-yellow-800">
          Supabase is not configured. Check NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.
        </div>
      ) : null}

      {error ? (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          Sign-in error: <span className="font-medium">{error}</span>
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
          />
        </label>

        <button
          className="w-full rounded-lg bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          onClick={signInMagicLink}
          disabled={!configured || !email || busy !== null}
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
          disabled={!configured || busy !== null}
        >
          {busy === "google" ? "Opening Google…" : "Continue with Google"}
        </button>

        <button
          className="w-full rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm text-neutral-700 disabled:opacity-50"
          onClick={signOut}
          disabled={!configured || busy !== null}
        >
          {busy === "signout" ? "Signing out…" : "Sign out"}
        </button>

        <p className="pt-2 text-xs text-neutral-500">Admin access is restricted to approved emails.</p>
      </div>
    </div>
  );
}
