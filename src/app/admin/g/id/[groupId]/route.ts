import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "../../../../lib/supabaseServer";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ groupId: string }> }
) {
  const { groupId } = await params;
  const supabase = await createSupabaseServerClient();

  // Look up group by UUID
  const { data: group } = await supabase
    .from("groups")
    .select("slug")
    .eq("id", groupId)
    .eq("is_active", true)
    .single();

  if (!group) {
    // Group not found, redirect to admin picker
    redirect("/admin?error=group_not_found");
  }

  // Extract path after /admin/g/id/[groupId]
  const url = new URL(request.url);
  const pathAfter = url.pathname.replace(`/admin/g/id/${groupId}`, "");

  // Redirect to slug URL, preserving the remainder path
  redirect(`/admin/g/${group.slug}${pathAfter}`);
}
