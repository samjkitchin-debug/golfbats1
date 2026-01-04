import { createBrowserClient } from "@supabase/ssr";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Browser Supabase client for Next.js App Router.
 * Uses cookie-based auth storage via @supabase/ssr.
 *
 * Important:
 * - Create the client once per component lifecycle (useMemo) where possible.
 * - Avoid global singletons that can introduce cross-tab / stale state bugs.
 */
export function createSupabaseBrowserClient() {
  if (!url || !anonKey) {
    throw new Error(
      "Supabase is not configured. Check NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY."
    );
  }

  return createBrowserClient(url, anonKey, {
    // Keep defaults; @supabase/ssr uses cookie-based storage in Next.
    // auth: { persistSession: true } is default behavior, but we leave explicit config out
    // to avoid version mismatch issues.
  });
}
