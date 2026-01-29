"use client";

/**
 * Temporary dev-only OAuth debug strip.
 * Shows origin and redirectTo so we can confirm auth never uses .com.
 * TODO: Remove after OAuth fix is confirmed (e.g. 48h).
 */

import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "../lib/supabaseBrowser";

export default function LoginDebugStrip() {
  const [session, setSession] = useState<boolean | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const supabase = createSupabaseBrowserClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(!!session);
    });
  }, [mounted]);

  if (!mounted || typeof window === "undefined") {
    return (
      <div className="mt-4 rounded border border-border bg-surface px-3 py-2 font-mono text-xs text-muted">
        Debug: loading…
      </div>
    );
  }

  const redirectTo = `${window.location.origin}/auth/callback`;

  return (
    <div className="mt-4 rounded border border-border bg-surface px-3 py-2 font-mono text-xs text-foreground space-y-1">
      <div><strong>origin</strong> {window.location.origin}</div>
      <div><strong>pathname</strong> {window.location.pathname}</div>
      <div><strong>session</strong> {session === null ? "…" : session ? "yes" : "no"}</div>
      <div><strong>redirectTo</strong> {redirectTo}</div>
    </div>
  );
}
