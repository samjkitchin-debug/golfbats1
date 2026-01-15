import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../../../../lib/supabaseServer";
import { requireAuthedUser, requireMemberIdForUser, isGroupAdmin } from "../../../../../../lib/serverAuth";
import { isEmailAdmin } from "../../../../../../lib/auth";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ groupSlug: string }> }
) {
  try {
    const { groupSlug } = await params;
    const supabase = await createSupabaseServerClient();

    // 1) Authenticated user
    const { userId } = await requireAuthedUser();

    // 2) Resolve member id
    const memberId = await requireMemberIdForUser(userId, supabase);

    // 3) Resolve group
    const { data: group, error: groupError } = await supabase
      .from("groups")
      .select("id, slug")
      .eq("slug", groupSlug)
      .eq("is_active", true)
      .maybeSingle();

    if (groupError || !group) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }

    // 4) Verify requester is APPROVED admin
    const { data: { user } } = await supabase.auth.getUser();
    const isPlatformAdmin = user?.email ? isEmailAdmin(user.email) : false;

    if (!isPlatformAdmin) {
      const adminCheck = await isGroupAdmin({
        supabase,
        userId,
        groupId: group.id,
      });

      if (!adminCheck) {
        return NextResponse.json({ error: "Not authorized" }, { status: 403 });
      }
    }

    // 5) Require request body with confirmText and expectedSlug
    const body = await request.json();
    const { confirmText, expectedSlug } = body;

    if (!confirmText || typeof confirmText !== "string") {
      return NextResponse.json({ error: "Missing confirmText" }, { status: 400 });
    }

    if (!expectedSlug || typeof expectedSlug !== "string") {
      return NextResponse.json({ error: "Missing expectedSlug" }, { status: 400 });
    }

    if (confirmText !== group.slug || expectedSlug !== group.slug) {
      return NextResponse.json({ error: "Slug mismatch" }, { status: 400 });
    }

    // 6) Prevent deletion if requester is sole admin (data integrity)
    const { count } = await supabase
      .from("group_members")
      .select("*", { count: "exact", head: true })
      .eq("group_id", group.id)
      .eq("role", "admin")
      .eq("status", "approved")
      .neq("user_id", userId);

    if (count === 0) {
      return NextResponse.json(
        { error: "Cannot delete group. You are the only admin. Assign another admin first." },
        { status: 400 }
      );
    }

    // 7) Delete the group
    const { error: deleteError } = await supabase
      .from("groups")
      .delete()
      .eq("id", group.id);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (err.message === "MEMBER_NOT_FOUND") {
      return NextResponse.json({ error: "Member not found" }, { status: 403 });
    }
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
