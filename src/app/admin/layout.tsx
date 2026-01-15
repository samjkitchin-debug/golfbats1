import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "../lib/supabaseServer";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Must be signed in
  if (!user) {
    redirect("/login?next=/admin");
  }

  // Note: Group admin authorization is checked in individual pages
  // This layout only ensures the user is authenticated
  // Platform admins and group admins are both allowed

  // Top-level admin layout: Minimal wrapper matching member surfaces
  // Admin uses same visual language as member surfaces (paper background, ink text)
  return (
    <div className="min-h-dvh app-background-theme">
      {children}
    </div>
  );
}
