import Link from "next/link";
import { redirect } from "next/navigation";
import SignOutButton from "../../../components/SignOutButton";
import { createSupabaseServerClient } from "../../../lib/supabaseServer";
import { isEmailAdmin } from "../../../lib/auth";
import GroupSwitcher from "../../components/GroupSwitcher";
import AdminTabs from "../../components/AdminTabs";

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

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 1) Auth: Must be signed in
  if (!user) {
    redirect(`/login?next=/admin/g/${encodeURIComponent(groupSlug)}`);
  }

  // Verify group exists
  const { data: group } = await supabase
    .from("groups")
    .select("id, name, slug")
    .eq("slug", groupSlug)
    .eq("is_active", true)
    .maybeSingle();

  if (!group) {
    redirect("/admin?error=group_not_found");
  }

  // Platform admin: only via isEmailAdmin (members.is_admin removed from authorization checks)
  const isPlatformAdmin = isEmailAdmin(user.email);

  // 2) Authorization: Check if user is APPROVED admin for this group OR platform admin
  const { data: groupMember } = await supabase
    .from("group_members")
    .select("role, status")
    .eq("group_id", group.id)
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

  // Fetch pending member count for Members tab badge
  const { count: pendingCount } = await supabase
    .from("group_members")
    .select("*", { count: "exact", head: true })
    .eq("group_id", group.id)
    .eq("status", "pending");

  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-20 border-b bg-surface border-border">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-sm font-semibold text-foreground">
              DayForeIt
            </Link>
            <span className="text-xs text-muted">/ admin</span>
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

        <div className="mx-auto flex w-full max-w-5xl items-center gap-2 px-4 pb-3">
          <AdminTabs groupSlug={groupSlug} pendingCount={pendingCount || 0} />
        </div>

        <div className="h-0.5 w-full bg-brand-green" />
      </header>

      <main className="mx-auto w-full max-w-5xl px-4 py-6">{children}</main>
    </div>
  );
}
