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

  // Require authenticated user - this is the only gate
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const isSignedIn = true;

  return (
    <div className="min-h-dvh bg-background">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-surface border-b border-border">
        <div className="mx-auto flex w-full max-w-md items-center justify-between px-4 py-3">
          <div className="flex w-16 justify-start">
            <MainNav />
          </div>

          <Link href="/" className="flex flex-1 justify-center">
            <Image
              src="/logo.png"
              alt="DayForeIt"
              width={132}
              height={66}
              className="h-auto w-auto max-h-[66px] object-contain"
              priority
            />
          </Link>

          <div className="flex w-16 justify-end">
            {isSignedIn ? (
              <SignOutButton />
            ) : (
              <Link
                href="/login"
                className="text-sm text-muted hover:text-foreground"
              >
                Sign in
              </Link>
            )}
          </div>
        </div>

        {/* brand accent */}
        <div className="h-0.5 w-full bg-brand-green" />
      </header>

      {/* Content */}
      <main className="mx-auto w-full max-w-md px-4 py-5">{children}</main>

      {/* Bottom navigation */}
      <BottomNav />
    </div>
  );
}
