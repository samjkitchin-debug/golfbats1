import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "../lib/supabaseServer";
import { isEmailAdmin } from "../lib/auth";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Must be signed in
  if (!user) {
    redirect("/login?next=/admin");
  }

  // Admin if either:
  // - email is in ADMIN_EMAILS (bootstrap), or
  // - members row has is_admin = true
  const emailAdmin = isEmailAdmin(user.email);

  const { data: member } = await supabase
    .from("members")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();

  const isAdmin = emailAdmin || !!member?.is_admin;

  if (!isAdmin) {
    // Signed in, but not authorised for admin
    redirect("/login?error=not_admin");
  }

  // Top-level admin layout: Only handles auth checks
  // Each route handles its own UI structure:
  // - /admin/page.tsx renders its own minimal header
  // - /admin/g/[groupId]/layout.tsx renders its own group admin shell
  return <>{children}</>;
}
