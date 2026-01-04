import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Next.js App Router note:
 * - In newer Next versions, cookies() is async and returns a ReadonlyRequestCookies.
 * - In Route Handlers / Server Actions it is mutable and supports .set().
 * - In Server Components it is read-only (no .set()).
 *
 * We support both by:
 * - awaiting cookies()
 * - reading via getAll()
 * - setting only if cookieStore.set exists
 */
export async function createSupabaseServerClient() {
  if (!url || !anonKey) {
    throw new Error(
      "Supabase is not configured. Check NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY."
    );
  }

  const cookieStore = await cookies();

  const getAll = () => {
    const fn = (cookieStore as any).getAll;
    return typeof fn === "function" ? fn.call(cookieStore) : [];
  };

  const setAll = (cookiesToSet: Array<{ name: string; value: string; options: any }>) => {
    const setFn = (cookieStore as any).set;
    if (typeof setFn !== "function") {
      // Server Components: cannot set cookies; that's OK.
      return;
    }

    for (const { name, value, options } of cookiesToSet) {
      setFn.call(cookieStore, name, value, options);
    }
  };

  return createServerClient(url, anonKey, {
    cookies: {
      getAll,
      setAll,
    },
  });
}
