import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

/**
 * Next 16: cookies() can be async and cookie writes can throw
 * unless you're in a Route Handler / Server Action.
 *
 * So:
 * - await cookies()
 * - swallow cookieStore.set errors
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Not in a Route Handler / Server Action; ignore.
          }
        },
      },
    }
  );
}
