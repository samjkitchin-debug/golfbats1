"use client";

import { useMemo, useState } from "react";
import { createSupabaseBrowserClient } from "../lib/supabaseBrowser";

export default function LoginClient() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"sign_in" | "sign_up">("sign_in");
  const [isResetting, setIsResetting] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);
  const [busy, setBusy] = useState<null | "email" | "google" | "facebook" | "reset">(null);
  const [error, setError] = useState<string | null>(null);

  // Get canonical origin (prefer env var, fallback to current origin)
  function getCanonicalOrigin(): string {
    const canonical = process.env.NEXT_PUBLIC_SITE_URL;
    if (canonical) {
      return canonical.replace(/\/$/, "");
    }
    return window.location.origin.replace(/\/$/, "");
  }

  async function handleEmailAuth() {
    setError(null);
    setResetSuccess(false);

    if (!email.trim()) {
      setError("Enter your email.");
      return;
    }

    if (!password) {
      setError("Enter your password.");
      return;
    }

    setBusy("email");

    try {
      if (mode === "sign_in") {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
        });

        if (error) throw error;
      }

      // Force full navigation to ensure SSR sees the cookie/session immediately
      window.location.assign("/");
    } catch (e: any) {
      const errorMessage = e?.message?.toLowerCase() || "";
      
      if (mode === "sign_in") {
        // Check for unconfirmed email
        if (errorMessage.includes("confirm") && errorMessage.includes("email")) {
          setError("Check your email to confirm your account before signing in.");
        } else {
          // Generic sign-in error - optionally suggest OAuth
          setError("Couldn't sign you in. Check your details and try again.");
        }
      } else {
        // Sign-up mode: check for email already in use
        if (
          errorMessage.includes("already") ||
          errorMessage.includes("registered") ||
          errorMessage.includes("exists")
        ) {
          setError("An account already exists for this email. Sign in instead.");
        } else {
          setError("Couldn't create your account. Try a different email or password.");
        }
      }
    } finally {
      setBusy(null);
    }
  }

  async function handleResetPassword() {
    setError(null);
    setResetSuccess(false);

    if (!email.trim()) {
      setError("Enter your email.");
      return;
    }

    setBusy("reset");

    try {
      const origin = getCanonicalOrigin();
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${origin}/reset-password`,
      });

      if (error) throw error;
      setResetSuccess(true);
    } catch (e: any) {
      setError("Couldn't send the reset email. Try again.");
    } finally {
      setBusy(null);
    }
  }

  async function signInOAuth(provider: "google" | "facebook") {
    setError(null);
    setBusy(provider);

    try {
      const origin = getCanonicalOrigin();
      const redirectTo = `${origin}/auth/callback?next=/`;

      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo },
      });

      if (error) throw error;
    } catch (e: any) {
      const providerName = provider === "google" ? "Google" : "Facebook";
      setError(e?.message ?? `Unable to sign in with ${providerName}.`);
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col items-center">
      {error && (
        <div className="mb-4 w-full rounded-lg border border-border bg-surface px-3 py-2 text-center text-sm text-foreground">
          {error}
        </div>
      )}
      {resetSuccess && (
        <div className="mb-4 w-full rounded-lg border border-border bg-surface px-3 py-2 text-center text-sm text-foreground">
          Check your email for a password reset link.
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
          onClick={() => signInOAuth("facebook")}
          disabled={busy !== null}
          className="flex w-full items-center justify-center gap-3 rounded-xl border border-border bg-surface px-4 py-4 text-base font-medium text-foreground hover:bg-background disabled:opacity-50"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path
              d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"
              fill="currentColor"
            />
          </svg>
          {busy === "facebook" ? "Opening Facebook…" : "Continue with Facebook"}
        </button>

        {/* Email block */}
        <div className="mt-6 flex w-full flex-col gap-3">
          <label className="text-sm text-muted">Email</label>
          <input
            type="email"
            placeholder="name@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-xl border border-border bg-surface px-3 py-4 text-base text-foreground placeholder:text-muted outline-none"
          />
          {!isResetting ? (
            <>
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border border-border bg-surface px-3 py-4 text-base text-foreground placeholder:text-muted outline-none"
              />
              <button
                onClick={handleEmailAuth}
                disabled={busy !== null}
                className="w-full rounded-xl btn-anticipation px-4 py-4 text-base font-medium disabled:opacity-50"
              >
                {busy === "email" ? (mode === "sign_in" ? "Signing in…" : "Creating account…") : mode === "sign_in" ? "Continue with email" : "Create account"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsResetting(true);
                  setError(null);
                  setResetSuccess(false);
                }}
                className="text-center text-[11px] text-muted hover:text-foreground hover:underline"
              >
                Forgot password?
              </button>
              <button
                type="button"
                onClick={() => setMode(mode === "sign_in" ? "sign_up" : "sign_in")}
                className="text-center text-xs text-muted hover:text-foreground hover:underline"
              >
                {mode === "sign_in" ? "New here? Create an account" : "Already have an account? Sign in"}
              </button>
            </>
          ) : (
            <>
              <button
                onClick={handleResetPassword}
                disabled={busy !== null}
                className="w-full rounded-xl btn-anticipation px-4 py-4 text-base font-medium disabled:opacity-50"
              >
                {busy === "reset" ? "Sending…" : "Send reset email"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsResetting(false);
                  setError(null);
                  setResetSuccess(false);
                }}
                className="text-center text-xs text-muted hover:text-foreground hover:underline"
              >
                Back to sign in
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
