import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
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

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Gate: must have at least 1 approved membership
  const { data: memberships, error } = await supabase
    .from("group_members")
    .select("group_id, role, status")
    .eq("user_id", user.id)
    .eq("status", "approved")
    .limit(1);

  if (error) {
    // Fail closed: if we can't confirm access, do not render member area
    redirect("/join");
  }

  if (!memberships || memberships.length === 0) {
    redirect("/join");
  }

  const isSignedIn = true;

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
