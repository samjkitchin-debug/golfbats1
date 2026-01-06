import Link from "next/link";
import Image from "next/image";
import BottomNav from "../components/BottomNav";
import SignOutButton from "../components/SignOutButton";
import { createSupabaseServerClient } from "../lib/supabaseServer";
import MainNav from "../components/MainNav";

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

  return (
    <div className="min-h-dvh bg-gray-50">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-white">
        <div className="mx-auto flex w-full max-w-md items-center justify-between px-4 py-3">
          <div className="flex w-16 justify-start">
            <MainNav />
          </div>

          <Link href="/" className="flex flex-1 justify-center">
            <Image
              src="/logo.png"
              alt="GolfBats logo"
              width={86}
              height={86}
              className="h-[86px] w-[86px] rounded-md"
              priority
            />
          </Link>

          <div className="flex w-16 justify-end">
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
        </div>

        {/* brand accent */}
        <div className="h-0.5 w-full bg-brand-red" />
      </header>

      {/* Content */}
      <main className="mx-auto w-full max-w-md px-4 py-5">{children}</main>

      {/* Bottom navigation */}
      <BottomNav />
    </div>
  );
}
