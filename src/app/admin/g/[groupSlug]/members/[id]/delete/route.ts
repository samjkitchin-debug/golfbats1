import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/app/lib/supabaseServer";
import { isEmailAdmin } from "@/app/lib/auth";

/**
 * DELETE /admin/g/[groupSlug]/members/[id]/delete
 * Delete a member from the group (or delete entire account if reject action).
 * Only accessible to group admins or platform admins.
 */
export async function DELETE(
  req: Request,
  context: { params: Promise<{ groupSlug: string; id: string }> | { groupSlug: string; id: string } }
) {
  try {
    const params = await Promise.resolve(context.params);
    const groupSlug = params.groupSlug;
    const memberId = params.id;

    if (!groupSlug || !memberId) {
      return NextResponse.json(
        { error: "Group slug and Member ID are required." },
        { status: 400 }
      );
    }

    const supabase = await createSupabaseServerClient();

    // Resolve slug to UUID
    const { data: group } = await supabase
      .from("groups")
      .select("id")
      .eq("slug", groupSlug.toLowerCase())
      .eq("is_active", true)
      .single();

    if (!group) {
      return NextResponse.json({ error: "Group not found or inactive." }, { status: 404 });
    }

    const groupId = group.id;

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user) {
      return NextResponse.json({ error: "Not signed in." }, { status: 401 });
    }

    // Platform admin: only via isEmailAdmin
    const isPlatformAdmin = isEmailAdmin(user.email);

    // Check group admin authorization
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
      return NextResponse.json(
        { error: "You must be an approved admin of this group." },
        { status: 403 }
      );
    }

    // Verify member exists in this group
    const { data: targetGroupMember } = await supabase
      .from("group_members")
      .select("user_id")
      .eq("group_id", groupId)
      .eq("user_id", memberId)
      .maybeSingle();

    if (!targetGroupMember) {
      return NextResponse.json(
        { error: "Member not found in this group." },
        { status: 404 }
      );
    }

    // Delete group membership
    const { error: deleteError } = await supabase
      .from("group_members")
      .delete()
      .eq("group_id", groupId)
      .eq("user_id", memberId);

    if (deleteError) {
      return NextResponse.json(
        { error: `Failed to delete member: ${deleteError.message}` },
        { status: 500 }
      );
    }

    // Check if user has any other group memberships
    const { data: otherMemberships } = await supabase
      .from("group_members")
      .select("group_id")
      .eq("user_id", memberId)
      .limit(1);

    // If no other memberships, delete profile photo from storage
    if (!otherMemberships || otherMemberships.length === 0) {
      const { data: member } = await supabase
        .from("members")
        .select("profile_photo_path")
        .eq("id", memberId)
        .single();

      if (member?.profile_photo_path) {
        // Extract bucket and path from profile_photo_path
        // Format: "profile-photos/{userId}/{filename}"
        const photoPath = member.profile_photo_path;
        const { error: storageError } = await supabase.storage
          .from("profile-photos")
          .remove([photoPath]);

        if (storageError) {
          console.warn("Failed to delete profile photo from storage:", storageError);
          // Continue - membership deletion is primary action
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    console.error("Delete member error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Server error." },
      { status: 500 }
    );
  }
}
