"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "../../lib/supabaseBrowser";

export default function MobileSignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  async function onSignOut() {
    if (busy) return;
    setBusy(true);

    try {
      await supabase.auth.signOut();
    } catch {
      // Non-fatal
    } finally {
      router.replace("/login");
      router.refresh();
      setBusy(false);
    }
  }

  return (
    <button
      onClick={onSignOut}
      className="rounded-md p-2 text-muted hover:text-foreground hover:bg-background disabled:opacity-50 min-w-[44px] min-h-[44px] flex items-center justify-center"
      type="button"
      disabled={busy}
      aria-label="Sign out"
    >
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
      </svg>
    </button>
  );
}
