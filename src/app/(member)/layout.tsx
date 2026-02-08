import Link from "next/link";
import Image from "next/image";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import BottomNav from "../components/BottomNav";
import { createSupabaseServerClient } from "../lib/supabaseServer";
import MainNav from "../components/MainNav";
import ActiveGameDayChip from "./components/ActiveGameDayChip";

export default async function MemberLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const pathname = (await headers()).get("x-pathname") || "";
  const { count, error } = await supabase
    .from("group_members")
    .select("group_id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("status", "approved");
  const approvedCount = error ? 1 : (count ?? 0);
  const allowedWhenNoGroups = pathname === "/start" || pathname.startsWith("/groups/create");
  if (approvedCount === 0) {
    if (!allowedWhenNoGroups) redirect("/start");
  } else {
    if (pathname === "/start") redirect("/");
  }

  return (
    <div className="min-h-dvh app-background-theme">
      {/* Header */}
      <header
        className="sticky top-0 z-50 border-b border-border relative"
        style={{ backgroundColor: "rgb(var(--header-bg))" }}
      >
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
              src="/brand/logo-app.png"
              alt="DayForeIt"
              width={102}
              height={51}
              className="h-auto w-auto max-h-[51px] object-contain"
              style={{ width: "auto" }}
              priority
            />
          </Link>

          <div className="flex w-16 justify-end" />
        </div>

        {/* brand accent */}
        <div className="h-0.5 w-full bg-anticipation/20" />
      </header>

      {/* Content */}
      {/* Header height: pt-3 (12px) + pb-2 (8px) + logo max 51px + brand accent 2px = 73px */}
      {/* Using 81px total (73px header + 8px clearance) with safe-area support for notch */}
      <main className="mx-auto w-full max-w-md px-4 pt-[calc(env(safe-area-inset-top,0px)+40px)] pb-5">{children}</main>

      {/* Active GameDay chip */}
      <ActiveGameDayChip />

      {/* Bottom navigation */}
      <BottomNav />
    </div>
  );
}
