import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import BottomNav from "../components/BottomNav";
import { createSupabaseServerClient } from "../lib/supabaseServer";
import MainNav from "../components/MainNav";
import ActiveGameDayChip from "./components/ActiveGameDayChip";

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

  return (
    <div className="min-h-dvh app-background-theme">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-surface border-b border-border relative">
        {/* Subtle vertical gradient overlay (sunrise warmth) */}
        <div 
          className="absolute inset-0 pointer-events-none header-warmth-gradient"
        />
        <div className="mx-auto flex w-full max-w-md items-center justify-between px-4 pt-3 pb-2 relative">
          <div className="flex w-16 justify-start">
            <MainNav />
          </div>

          <Link href="/" className="flex flex-1 justify-center">
            <Image
              src="/logo.png"
              alt="DayForeIt"
              width={160}
              height={80}
              className="h-auto w-auto max-h-[80px] object-contain"
              style={{ width: "auto" }}
              priority
            />
          </Link>

          <div className="flex w-16 justify-end" />
        </div>

        {/* brand accent */}
        <div className="h-0.5 w-full bg-brand-green" />
      </header>

      {/* Content */}
      <main className="mx-auto w-full max-w-md px-4 pt-6 pb-5">{children}</main>

      {/* Active GameDay chip */}
      <ActiveGameDayChip />

      {/* Bottom navigation */}
      <BottomNav />
    </div>
  );
}
