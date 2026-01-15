import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "../../../../../lib/supabaseServer";
import { isEmailAdmin } from "../../../../../lib/auth";

export default async function HygienePage({
  params,
}: {
  params: Promise<{ groupSlug: string }>;
}) {
  const { groupSlug } = await params;
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?next=/admin/tools/g/${encodeURIComponent(groupSlug)}/hygiene`);
  }

  // Verify group exists
  const { data: group } = await supabase
    .from("groups")
    .select("id, name, slug")
    .eq("slug", groupSlug)
    .eq("is_active", true)
    .maybeSingle();

  if (!group) {
    redirect("/admin/tools?error=group_not_found");
  }

  // Platform admin: only via isEmailAdmin
  const isPlatformAdmin = isEmailAdmin(user.email);

  // Authorization: Check if user is APPROVED admin for this group OR platform admin
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
    redirect("/admin/tools?error=not_authorized");
  }

  return (
    <div>
      <h1 className="text-xl font-semibold text-foreground mb-2">Data hygiene</h1>
      <p className="text-sm text-secondary mb-6">
        Tools for cleaning and maintaining group data integrity. This is a rare tool and not part
        of the daily admin workshop.
      </p>

      <div className="rounded-lg border border-border bg-surface px-4 py-6 text-center">
        <p className="text-sm text-secondary">Coming soon</p>
      </div>
    </div>
  );
}
