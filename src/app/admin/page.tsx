import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "../lib/supabaseServer";
import { isEmailAdmin } from "../lib/auth";
import Link from "next/link";
import SignOutButton from "../components/SignOutButton";

type GroupOption = {
  id: string;
  name: string;
  slug: string;
};

export default async function AdminPage() {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Must be signed in
  if (!user) {
    redirect("/login?next=/admin");
  }

  // Platform admin: only via isEmailAdmin (members.is_admin removed from authorization checks)
  const isPlatformAdmin = isEmailAdmin(user.email);

  // Find groups where user is an APPROVED admin
  const { data: adminGroupMembers } = await supabase
    .from("group_members")
    .select("group_id")
    .eq("user_id", user.id)
    .eq("role", "admin")
    .eq("status", "approved");

  const groupIds = adminGroupMembers?.map((gm) => gm.group_id) || [];
  
  let userAdminGroups: GroupOption[] = [];
  if (groupIds.length > 0) {
    const { data: groups } = await supabase
      .from("groups")
      .select("id, name, slug")
      .in("id", groupIds)
      .eq("is_active", true)
      .order("name");

    userAdminGroups =
      groups?.map((g) => ({
        id: g.id,
        name: g.name,
        slug: g.slug,
      })) || [];
  }

  // If platform admin, also fetch all groups
  let allGroups: GroupOption[] = [];
  if (isPlatformAdmin) {
    const { data: allGroupsData } = await supabase
      .from("groups")
      .select("id, name, slug")
      .eq("is_active", true)
      .order("name");

    allGroups =
      allGroupsData?.map((g) => ({
        id: g.id,
        name: g.name,
        slug: g.slug,
      })) || [];
  }

  // Determine which groups to show
  const groupsToShow = isPlatformAdmin ? allGroups : userAdminGroups;

  // Redirect if exactly one group (use slug URL)
  if (groupsToShow.length === 1) {
    redirect(`/admin/g/${groupsToShow[0].slug}`);
  }

  // If no groups, show message
  if (groupsToShow.length === 0) {
    return (
      <div className="min-h-dvh bg-background">
        <header className="sticky top-0 z-20 border-b bg-surface border-border">
          <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-3">
            <div className="flex items-center gap-3">
              <Link href="/" className="text-sm font-semibold text-foreground">
                DayForeIt
              </Link>
              <span className="text-xs text-muted">/ admin</span>
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
        </header>

        <main className="mx-auto w-full max-w-5xl px-4 py-6">
          <div className="rounded-xl border bg-surface p-8 text-center">
            <h1 className="text-xl font-semibold text-foreground mb-2">Admin access</h1>
            <p className="text-sm text-muted">
              You don't have admin access to any groups.
            </p>
          </div>
        </main>
      </div>
    );
  }

  // Multiple groups - show selector
  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-20 border-b bg-surface border-border">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-sm font-semibold text-foreground">
              DayForeIt
            </Link>
            <span className="text-xs text-muted">/ admin</span>
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
      </header>

      <main className="mx-auto w-full max-w-5xl px-4 py-6">
        <div className="rounded-xl border bg-surface p-8">
          <h1 className="text-xl font-semibold text-foreground mb-2">Select a group to manage</h1>
          <p className="text-sm text-muted mb-6">
            Choose a group from the list below to access its admin dashboard.
          </p>
          <ul className="space-y-2">
            {groupsToShow.map((group) => (
              <li key={group.id}>
                <Link
                  href={`/admin/g/${group.slug}`}
                  className="block rounded-lg border border-border bg-surface px-4 py-3 text-sm font-medium text-foreground hover:bg-background transition-colors"
                >
                  <div className="font-semibold">{group.name}</div>
                  <div className="text-xs text-muted mt-0.5">Code: {group.slug}</div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </main>
    </div>
  );
}
