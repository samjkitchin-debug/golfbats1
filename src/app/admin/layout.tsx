import Link from "next/link";
import { redirect } from "next/navigation";
import SignOutButton from "../components/SignOutButton";
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

  return (
    <div className="min-h-dvh bg-gray-50">
      <header className="sticky top-0 z-20 border-b bg-white">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-sm font-semibold text-gray-900">
              GolfBats
            </Link>
            <span className="text-xs text-gray-400">/ admin</span>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/"
              className="rounded-md px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
            >
              Back to app
            </Link>
            <SignOutButton />
          </div>
        </div>

        <div className="mx-auto flex w-full max-w-5xl items-center gap-2 px-4 pb-3">
          <Link
            href="/admin"
            className="rounded-md px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
          >
            Trips
          </Link>
          <Link
            href="/admin/courses"
            className="rounded-md px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
          >
            Courses
          </Link>
          <Link
            href="/admin/members"
            className="rounded-md px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
          >
            Members
          </Link>
          <Link
            href="/admin/dev-notes"
            className="rounded-md px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
          >
            Dev Notes
          </Link>
        </div>

        <div className="h-0.5 w-full bg-brand-red" />
      </header>

      <main className="mx-auto w-full max-w-5xl px-4 py-6">{children}</main>
    </div>
  );
}
