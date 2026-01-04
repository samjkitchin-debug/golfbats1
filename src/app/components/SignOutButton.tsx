"use client";

import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabaseClient";

export default function SignOutButton() {
  const router = useRouter();

  async function onSignOut() {
    if (!supabase) {
      // If Supabase isn't configured, just bounce to login.
      router.push("/login");
      router.refresh();
      return;
    }

    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <button
      onClick={onSignOut}
      className="text-sm text-gray-600 hover:text-gray-900"
      type="button"
    >
      Sign out
    </button>
  );
}
