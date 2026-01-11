import Link from "next/link";
import { redirect } from "next/navigation";
import SignOutButton from "../../../components/SignOutButton";
import MobileSignOutButton from "../../components/MobileSignOutButton";
import { createSupabaseServerClient } from "../../../lib/supabaseServer";
import { isEmailAdmin } from "../../../lib/auth";
import GroupSwitcher from "../../components/GroupSwitcher";
import AdminTabs from "../../components/AdminTabs";
import { GroupProvider } from "./GroupContext";

type GroupOption = {
  id: string;
  name: string;
  slug: string;
};

export default async function GroupAdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ groupSlug: string }>;
}) {
  const { groupSlug } = await params;
  const supabase = await createSupabaseServerClient();

  // Check if groupSlug looks like a UUID (backwards compatibility)
  // UUID format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidPattern.test(groupSlug)) {
    // It's a UUID - look up group by ID and redirect to slug URL
    const { data: groupById } = await supabase
      .from("groups")
      .select("slug")
      .eq("id", groupSlug)
      .eq("is_active", true)
      .single();

    if (groupById) {
      redirect(`/admin/g/${groupById.slug}`);
    } else {
      redirect("/admin?error=group_not_found");
    }
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 1) Auth: Must be signed in
  if (!user) {
    redirect(`/login?next=/admin/g/${encodeURIComponent(groupSlug)}`);
  }

  // Resolve slug to UUID: Query group by slug (normalize to lowercase for comparison)
  const { data: group } = await supabase
    .from("groups")
    .select("id, name, slug")
    .eq("slug", groupSlug.toLowerCase())
    .eq("is_active", true)
    .single();

  if (!group) {
    redirect("/admin?error=group_not_found");
  }

  const groupId = group.id;

  // Platform admin: only via isEmailAdmin (members.is_admin removed from authorization checks)
  const isPlatformAdmin = isEmailAdmin(user.email);

  // 2) Authorization: Check if user is APPROVED admin for this group OR platform admin
  const { data: groupMember } = await supabase
    .from("group_members")
    .select("role, status")
    .eq("group_id", groupId)
    .eq("user_id", user.id)
    .maybeSingle();

  const isGroupAdmin =
    isPlatformAdmin ||
    (groupMember && groupMember.role === "admin" && groupMember.status === "approved");

  if (!isGroupAdmin) {
    redirect("/admin?error=not_authorized");
  }

  // Fetch available groups for switcher
  let availableGroups: GroupOption[] = [];

  if (isPlatformAdmin) {
    // Platform admin: show all groups
    const { data: allGroups } = await supabase
      .from("groups")
      .select("id, name, slug")
      .eq("is_active", true)
      .order("name");

    availableGroups =
      allGroups?.map((g) => ({
        id: g.id,
        name: g.name,
        slug: g.slug,
      })) || [];
  } else {
    // Regular admin: show only groups where user is approved admin
    const { data: adminGroupMembers } = await supabase
      .from("group_members")
      .select("group_id")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .eq("status", "approved");

    const groupIds = adminGroupMembers?.map((gm) => gm.group_id) || [];

    if (groupIds.length > 0) {
      const { data: userGroups } = await supabase
        .from("groups")
        .select("id, name, slug")
        .in("id", groupIds)
        .eq("is_active", true)
        .order("name");

      availableGroups =
        userGroups?.map((g) => ({
          id: g.id,
          name: g.name,
          slug: g.slug,
        })) || [];
    }
  }

  const currentGroup: GroupOption = {
    id: group.id,
    name: group.name,
    slug: group.slug,
  };

  // Fetch pending approvals count
  const { count: pendingCount } = await supabase
    .from("group_members")
    .select("*", { count: "exact", head: true })
    .eq("group_id", groupId)
    .neq("status", "approved");

  // Fetch next trip date
  const todayYmd = new Date().toISOString().slice(0, 10);
  const { data: nextTrip } = await supabase
    .from("trips")
    .select("trip_date")
    .eq("group_id", groupId)
    .gte("trip_date", todayYmd)
    .order("trip_date", { ascending: true })
    .limit(1)
    .maybeSingle();

  // Format date: "16 Jan" or "16 Jan 2025" if different year
  function formatContextDate(dateStr: string | null | undefined): string | null {
    if (!dateStr) return null;
    try {
      const date = new Date(dateStr + "T00:00:00");
      const now = new Date();
      const isSameYear = date.getFullYear() === now.getFullYear();
      
      const day = date.getDate();
      const month = date.toLocaleDateString("en-US", { month: "short" });
      
      if (isSameYear) {
        return `${day} ${month}`;
      } else {
        return `${day} ${month} ${date.getFullYear()}`;
      }
    } catch {
      return null;
    }
  }

  const nextTripDateFormatted = formatContextDate(nextTrip?.trip_date);

  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-20 border-b bg-surface border-border">
        {/* Mobile header (<sm): Compact single row */}
        <div className="flex sm:hidden items-center justify-between px-3 py-2.5 gap-2">
          {/* Left: Empty space (was DayForeIt/Admin - hidden on mobile) */}
          <div className="w-10 flex-shrink-0" />
          
          {/* Center: Group switcher (flex-1, max-width, truncates) */}
          <div className="flex-1 min-w-0 max-w-[calc(100%-6rem)]">
            <GroupSwitcher currentGroup={currentGroup} availableGroups={availableGroups} />
          </div>

          {/* Right: Icon buttons */}
          <div className="flex items-center gap-1 flex-shrink-0">
            <Link
              href="/"
              className="rounded-md p-2 text-foreground hover:bg-background min-w-[44px] min-h-[44px] flex items-center justify-center"
              aria-label="Back to app"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
            </Link>
            <MobileSignOutButton />
          </div>
        </div>

        {/* Desktop header (>=sm): Full header */}
        <div className="hidden sm:flex mx-auto w-full max-w-5xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-sm font-semibold text-foreground">
              DayForeIt
            </Link>
            <span className="text-xs text-muted">Admin</span>
            <GroupSwitcher currentGroup={currentGroup} availableGroups={availableGroups} />
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/"
              className="rounded-md px-3 py-2 text-sm text-foreground hover:bg-background"
            >
              Back to app
            </Link>
            <SignOutButton />
          </div>
        </div>

        {/* Secondary row: Tabs */}
        <div className="mx-auto flex w-full max-w-5xl items-center gap-2 border-t border-border px-4 py-2">
          <AdminTabs groupSlug={group.slug} pendingCount={pendingCount ?? null} />
        </div>

        <div className="h-0.5 w-full bg-brand-green" />
      </header>

      {/* Context bar - Desktop only */}
      <div className="hidden md:block sticky top-[73px] z-10 border-b border-border bg-background/95 backdrop-blur-sm">
        <div className="mx-auto w-full max-w-5xl px-4 py-2">
          <div className="flex items-center gap-4 text-sm text-muted">
            <span className="font-medium text-foreground">{group.name}</span>
            {pendingCount !== null && pendingCount > 0 && (
              <>
                <span>·</span>
                <Link
                  href={`/admin/g/${group.slug}/members`}
                  className="hover:text-foreground transition-colors"
                >
                  {pendingCount} pending {pendingCount === 1 ? "approval" : "approvals"}
                </Link>
              </>
            )}
            {nextTripDateFormatted && (
              <>
                <span>·</span>
                <span>
                  Next trip: <span className="font-medium text-foreground">{nextTripDateFormatted}</span>
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      <main className="mx-auto w-full max-w-5xl px-4 py-6">
        <GroupProvider group={{ id: group.id, name: group.name, slug: group.slug }}>
          {children}
        </GroupProvider>
      </main>
    </div>
  );
}
