import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/app/lib/supabaseServer";

/**
 * DELETE /admin/members/[id]/delete
 * Delete a member and all associated data.
 * Only accessible to admins.
 */
export async function DELETE(
  req: Request,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const params = await Promise.resolve(context.params);
    const supabase = await createSupabaseServerClient();

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user) {
      return NextResponse.json({ error: "Not signed in." }, { status: 401 });
    }

    // Check admin status
    const adminEmails = (process.env.ADMIN_EMAILS || "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
    const email = (user.email ?? "").toLowerCase();
    if (!adminEmails.includes(email)) {
      return NextResponse.json({ error: "Admin access required." }, { status: 403 });
    }

    const memberId = params.id;

    if (!memberId) {
      return NextResponse.json({ error: "Member ID is required." }, { status: 400 });
    }

    // Prevent admins from deleting themselves
    if (memberId === user.id) {
      return NextResponse.json(
        { error: "You cannot delete your own account." },
        { status: 400 }
      );
    }

    // Verify member exists
    const { data: member, error: memberError } = await supabase
      .from("members")
      .select("id")
      .eq("id", memberId)
      .maybeSingle();

    if (memberError) {
      return NextResponse.json(
        { error: `Failed to verify member: ${memberError.message}` },
        { status: 500 }
      );
    }

    if (!member) {
      return NextResponse.json({ error: "Member not found." }, { status: 404 });
    }

    // Delete member from members table
    // Related data should cascade:
    // - member_passports has ON DELETE CASCADE on user_id
    // - trip_attendees has member_id reference (check if CASCADE exists)
    // - passport_access_audit has target_user_id with ON DELETE CASCADE

    const { error: deleteError } = await supabase
      .from("members")
      .delete()
      .eq("id", memberId);

    if (deleteError) {
      return NextResponse.json(
        { error: `Failed to delete member: ${deleteError.message}` },
        { status: 500 }
      );
    }

    // Delete trip_attendees records (manual deletion as FK may not have CASCADE)
    const { error: attendeesError } = await supabase
      .from("trip_attendees")
      .delete()
      .eq("member_id", memberId);

    if (attendeesError) {
      console.warn("Failed to delete trip attendees:", attendeesError);
      // Continue - member deletion is primary action
    }

    // Delete dev_notes (if any)
    const { error: notesError } = await supabase
      .from("dev_notes")
      .delete()
      .eq("user_id", memberId);

    if (notesError) {
      console.warn("Failed to delete dev notes:", notesError);
      // Continue - not critical
    }

    // Best-effort cleanup of profile and passport images for this member
    try {
      // Remove profile photo (single known path pattern)
      const { data: memberProfile } = await supabase
        .from("members")
        .select("profile_photo_path")
        .eq("id", memberId)
        .maybeSingle();

      const profilePath =
        memberProfile && typeof memberProfile.profile_photo_path === "string"
          ? memberProfile.profile_photo_path
          : null;

      if (profilePath && profilePath.startsWith("profile-photos/")) {
        const relativePath = profilePath.replace("profile-photos/", "");
        const { error: removeProfileError } = await supabase.storage
          .from("profile-photos")
          .remove([relativePath]);
        if (removeProfileError) {
          console.warn("Failed to delete profile photo for member:", removeProfileError);
        }
      }

      // Remove any passport images under this user folder
      const { data: passportFiles, error: listError } = await supabase.storage
        .from("passport-images")
        .list(memberId, { limit: 100 });

      if (!listError && passportFiles && passportFiles.length > 0) {
        const filesToDelete = passportFiles.map((f) => `${memberId}/${f.name}`);
        const { error: removePassportsError } = await supabase.storage
          .from("passport-images")
          .remove(filesToDelete);
        if (removePassportsError) {
          console.warn("Failed to delete passport images for member:", removePassportsError);
        }
      }
    } catch (storageCleanupError) {
      console.warn("Member storage cleanup error:", storageCleanupError);
      // Non-fatal – continue.
    }

    // Note: We cannot delete the auth.users record directly via Supabase client
    // This would need to be done via the Supabase Admin API or Dashboard
    // The member row deletion is the main action, and related data cascades

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    console.error("Delete member error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Server error." },
      { status: 500 }
    );
  }
}

