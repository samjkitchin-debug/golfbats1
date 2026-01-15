import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "../../../../lib/supabaseServer";
import { isEmailAdmin } from "../../../../lib/auth";
import Link from "next/link";

export default async function GroupToolsPage({
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
    redirect(`/login?next=/admin/tools/g/${encodeURIComponent(groupSlug)}`);
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
      <h1 className="text-xl font-semibold text-foreground mb-2">{group.name}</h1>
      <p className="text-sm text-secondary mb-6">Advanced tools</p>

      <div className="space-y-3">
        <Link
          href={`/admin/tools/g/${groupSlug}/settings`}
          className="block rounded-lg border border-border bg-surface px-4 py-4 hover:bg-background transition-colors"
        >
          <div className="text-base font-medium text-foreground">Group settings</div>
        </Link>

        <Link
          href={`/admin/tools/g/${groupSlug}/audit`}
          className="block rounded-lg border border-border bg-surface px-4 py-4 hover:bg-background transition-colors"
        >
          <div className="text-base font-medium text-foreground">Audit</div>
        </Link>

        <Link
          href={`/admin/tools/g/${groupSlug}/hygiene`}
          className="block rounded-lg border border-border bg-surface px-4 py-4 hover:bg-background transition-colors"
        >
          <div className="text-base font-medium text-foreground">Data hygiene</div>
          <div className="text-xs text-secondary mt-1">Preview</div>
        </Link>

        <Link
          href={`/admin/tools/g/${groupSlug}/migrations`}
          className="block rounded-lg border border-border bg-surface px-4 py-4 hover:bg-background transition-colors"
        >
          <div className="text-base font-medium text-foreground">Cross-group migrations</div>
          <div className="text-xs text-secondary mt-1">Rare</div>
        </Link>
      </div>
    </div>
  );
}
