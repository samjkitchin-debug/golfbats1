import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

/**
 * Authenticated Supabase client (anon key + cookies)
 * - Used when we care about the current signed-in user.
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

/**
 * Service-role Supabase client (no cookies, server-only)
 * - Used in API routes that need to read/write trips and attendees
 *   without being restricted by RLS/policies.
 * - MUST NEVER be exposed to the browser.
 */
export async function createSupabaseServiceClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    // Service role key is server-only; ensure it is defined in the environment.
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        getAll() {
          return [];
        },
        setAll() {
          // No-op – we do not rely on cookies for service-role operations.
        },
      },
    }
  );
}
