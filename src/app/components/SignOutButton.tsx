"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "../lib/supabaseBrowser";

export default function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  async function onSignOut() {
    if (busy) return;
    setBusy(true);

    try {
      // Sign out from Supabase (clears cookie session)
      await supabase.auth.signOut();
    } catch {
      // Non-fatal: still navigate to login to avoid trapping user
    } finally {
      // Replace prevents going "back" into admin pages.
      router.replace("/login");
      router.refresh();
      setBusy(false);
    }
  }

  return (
    <button
      onClick={onSignOut}
      className="text-sm text-gray-600 hover:text-gray-900 disabled:opacity-50"
      type="button"
      disabled={busy}
      aria-disabled={busy}
    >
      {busy ? "Signing out…" : "Sign out"}
    </button>
  );
}
