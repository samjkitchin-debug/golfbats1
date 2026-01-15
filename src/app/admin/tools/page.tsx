import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "../../lib/supabaseServer";
import Link from "next/link";

type GroupOption = {
  id: string;
  name: string;
  slug: string;
};

export default async function ToolsPage() {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/admin/tools");
  }

  // Fetch member id
  const { data: member } = await supabase
    .from("members")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  if (!member) {
    redirect("/login?next=/admin/tools");
  }

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

  if (userAdminGroups.length === 0) {
    return (
      <div>
        <h1 className="text-xl font-semibold text-foreground mb-2">Advanced tools</h1>
        <p className="text-sm text-secondary mb-6">
          No groups with admin tools access.
        </p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-xl font-semibold text-foreground mb-2">Advanced tools</h1>
      <p className="text-sm text-secondary mb-6">
        Rare tools for group configuration and repair.
      </p>

      <div className="space-y-3">
        {userAdminGroups.map((group) => (
          <div
            key={group.id}
            className="rounded-lg border border-border bg-surface px-4 py-4 space-y-3"
          >
            <div>
              <div className="text-base font-medium text-foreground">{group.name}</div>
              <div className="text-xs text-secondary mt-0.5">
                Rare tools for group configuration and repair
              </div>
            </div>
            <Link
              href={`/admin/tools/g/${group.slug}`}
              className="block w-full rounded-lg btn-primary px-4 py-2.5 text-sm font-medium text-white text-center hover:opacity-90 transition-opacity"
            >
              Open tools
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}
