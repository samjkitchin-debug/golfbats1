import Link from "next/link";
import { redirect } from "next/navigation";
import SignOutButton from "../../components/SignOutButton";
import { createSupabaseServerClient } from "../../lib/supabaseServer";
import { isEmailAdmin } from "../../lib/auth";
import GroupSwitcher from "../components/GroupSwitcher";

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
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 1) Auth: Must be signed in
  if (!user) {
    redirect(`/login?next=/admin/${encodeURIComponent(groupId)}`);
  }

  // Verify group exists
  const { data: group } = await supabase
    .from("groups")
    .select("id, name, slug")
    .eq("id", groupId)
    .eq("is_active", true)
    .single();

  if (!group) {
    redirect("/admin?error=group_not_found");
  }

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

  return (
    <div className="min-h-dvh bg-background">
      <div className="mx-auto w-full max-w-[480px]">
        <header className="sticky top-0 z-20 border-b bg-surface border-border">
          <div className="flex items-center justify-between px-5 py-3">
            <div className="flex items-center gap-3 min-w-0">
              <Link href="/" className="text-xs text-secondary hover:text-foreground whitespace-nowrap">
                Back to app
              </Link>
              <span className="text-xs text-secondary">·</span>
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-sm font-semibold text-foreground whitespace-nowrap">Admin</span>
                <GroupSwitcher currentGroup={currentGroup} availableGroups={availableGroups} />
              </div>
            </div>

            <div className="flex items-center gap-2">
              {currentGroup.slug && (
                <Link
                  href={`/admin/tools/g/${currentGroup.slug}/settings`}
                  className="text-xs text-secondary hover:text-foreground whitespace-nowrap"
                >
                  Group settings
                </Link>
              )}
              <SignOutButton />
            </div>
          </div>
        </header>

        <main className="px-5 py-6">{children}</main>
      </div>
    </div>
  );
}
