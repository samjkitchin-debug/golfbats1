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

  // Fetch member id
  const { data: member } = await supabase
    .from("members")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  if (!member) {
    redirect("/login?next=/admin");
  }

  // Platform admin: only via isEmailAdmin
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

  // If no groups, show calm empty state
  if (groupsToShow.length === 0) {
    return (
      <>
        <header className="sticky top-0 z-20 border-b bg-surface border-border">
          <div className="mx-auto flex w-full max-w-md items-center justify-between px-4 pt-3 pb-2">
            <div className="flex items-center gap-3">
              <Link href="/" className="text-sm font-semibold text-foreground">
                DayForeIt
              </Link>
              <span className="text-xs text-muted">/ admin</span>
            </div>

            <div className="flex items-center gap-2">
              <SignOutButton />
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-md px-5 pt-6 pb-24">
          <h1 className="text-xl font-semibold text-foreground mb-2">Admin</h1>
          <p className="text-sm text-secondary mb-6">
            You don't have admin access to any groups.
          </p>
          <Link
            href="/me"
            className="inline-block rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground hover:bg-background transition-colors"
          >
            Back to profile
          </Link>
        </main>
      </>
    );
  }

  // Show workshop landing with groups
  return (
    <>
      <header className="sticky top-0 z-20 border-b bg-surface border-border">
        <div className="mx-auto flex w-full max-w-md items-center justify-between px-4 pt-3 pb-2">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-sm font-semibold text-foreground">
              DayForeIt
            </Link>
            <span className="text-xs text-muted">/ admin</span>
          </div>

          <div className="flex items-center gap-2">
            <SignOutButton />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-md px-5 pt-6 pb-24">
        <h1 className="text-xl font-semibold text-foreground mb-2">Admin</h1>
        <p className="text-sm text-secondary mb-6">
          Approvals, roles, and publishing.
        </p>

        <div className="space-y-3">
          {groupsToShow.map((group) => (
            <div
              key={group.id}
              className="rounded-lg border border-border bg-surface px-4 py-4 space-y-3"
            >
              <div>
                <div className="text-base font-medium text-foreground">{group.name}</div>
                <div className="text-xs text-secondary mt-0.5">Governance & publishing</div>
              </div>
              <Link
                href={`/admin/g/${group.slug}/members`}
                className="block w-full rounded-lg btn-primary px-4 py-2.5 text-sm font-medium text-white text-center hover:opacity-90 transition-opacity"
              >
                Open admin
              </Link>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-secondary">
                <Link
                  href={`/admin/tools/g/${group.slug}/settings`}
                  className="hover:text-foreground underline"
                >
                  Group settings
                </Link>
                <Link
                  href={`/admin/tools/g/${group.slug}/hygiene`}
                  className="hover:text-foreground underline"
                >
                  Data hygiene
                </Link>
                <Link
                  href={`/admin/tools/g/${group.slug}/audit`}
                  className="hover:text-foreground underline"
                >
                  Audit
                </Link>
                <Link
                  href={`/admin/tools/g/${group.slug}/migrations`}
                  className="hover:text-foreground underline"
                >
                  Migrations <span className="text-muted">(rare)</span>
                </Link>
              </div>
            </div>
          ))}
        </div>
      </main>
    </>
  );
}
