import Link from "next/link";
import Image from "next/image";
import BottomNav from "../components/BottomNav";
import SignOutButton from "../components/SignOutButton";
import { createSupabaseServerClient } from "../lib/supabaseServer";

function parseAdminEmails(raw: string | undefined) {
  return (raw ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export default async function MemberLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isSignedIn = !!user;
  const adminEmails = parseAdminEmails(process.env.ADMIN_EMAILS);
  const email = (user?.email ?? "").toLowerCase();
  const isAdmin = !!email && adminEmails.includes(email);

  return (
    <div className="min-h-dvh bg-gray-50">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-white">
        <div className="mx-auto flex w-full max-w-md items-center justify-between px-4 py-3">
          <Link href="/" className="flex items-center gap-3">
            <Image
              src="/logo.png"
              alt="GolfBats logo"
              width={36}
              height={36}
              className="h-9 w-9 rounded-md"
              priority
            />
            <div className="flex flex-col leading-tight">
              <span className="text-lg font-semibold tracking-tight text-gray-900">
                GolfBats
              </span>
              <span className="text-xs tracking-wide text-gray-500">club board</span>
            </div>
          </Link>

          {isSignedIn ? (
            <SignOutButton />
          ) : (
            <Link
              href="/login"
              className="text-sm text-gray-600 hover:text-gray-900"
            >
              Sign in
            </Link>
          )}
        </div>

        {/* brand accent */}
        <div className="h-0.5 w-full bg-brand-red" />
      </header>

      {/* Content */}
      <main className="mx-auto w-full max-w-md px-4 py-5">{children}</main>

      {/* Footer */}
      <footer className="mx-auto w-full max-w-md px-4 pb-24">
        <div className="mt-8 flex items-center justify-between border-t pt-4 text-xs text-gray-500">
          <span>© {new Date().getFullYear()} GolfBats</span>

          {isAdmin ? (
            <Link href="/admin" className="hover:text-brand-black">
              Admin
            </Link>
          ) : (
            <span />
          )}
        </div>
      </footer>

      {/* Bottom navigation */}
      <BottomNav />
    </div>
  );
}
