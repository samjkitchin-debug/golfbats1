import Link from "next/link";
import { redirect } from "next/navigation";
import SignOutButton from "../components/SignOutButton";
import { createSupabaseServerClient } from "../lib/supabaseServer";

function parseAdminEmails(raw: string | undefined) {
  return (raw ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Must be signed in
  if (!user) {
    redirect("/login?next=/admin");
  }

  // Must be in ADMIN_EMAILS
  const adminEmails = parseAdminEmails(process.env.ADMIN_EMAILS);
  const email = (user.email ?? "").toLowerCase();
  const isAdmin = !!email && adminEmails.includes(email);

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
        </div>

        <div className="h-0.5 w-full bg-brand-red" />
      </header>

      <main className="mx-auto w-full max-w-5xl px-4 py-6">{children}</main>
    </div>
  );
}
