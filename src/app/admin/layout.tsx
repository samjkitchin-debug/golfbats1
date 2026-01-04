import Link from "next/link";
import { redirect } from "next/navigation";
import AdminNav from "./AdminNav";
import { createSupabaseServerClient } from "../lib/supabaseServer";
import { isEmailAdmin } from "../lib/auth";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    // Keep admin discoverable, but require sign-in
    redirect("/login?error=not_signed_in");
  }

  const email = data.user.email ?? null;

  if (!isEmailAdmin(email)) {
    // Signed in but not allowlisted
    redirect("/?error=not_admin");
  }

  return (
    <div className="min-h-dvh bg-gray-50">
      <header className="border-b bg-white">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-3">
          <div>
            <div className="text-sm font-semibold text-gray-900">GolfBats Admin</div>
            <div className="text-xs text-gray-500">{email}</div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/"
              className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-800"
            >
              Member view
            </Link>
            <Link
              href="/login"
              className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-800"
            >
              Account
            </Link>
          </div>
        </div>

        <div className="mx-auto w-full max-w-5xl px-4 pb-3">
          <AdminNav />
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl px-4 py-6">{children}</main>
    </div>
  );
}
