import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/app/lib/supabaseServer";
import { isEmailAdmin } from "@/app/lib/auth";

/**
 * GET /admin/g/[groupSlug]/members/[id]/passport
 * Get passport details for a member.
 * Only accessible to group admins or platform admins.
 */
export async function GET(
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

    // Fetch passport details
    const { data: passport, error: passportError } = await supabase
      .from("member_passports")
      .select(
        "passport_full_name, passport_number, passport_country, passport_expiry_date, passport_photo_path"
      )
      .eq("user_id", memberId)
      .maybeSingle();

    if (passportError) {
      return NextResponse.json(
        { error: `Failed to fetch passport: ${passportError.message}` },
        { status: 500 }
      );
    }

    if (!passport) {
      return NextResponse.json(
        {
          passport_full_name: null,
          passport_number: null,
          passport_country: null,
          passport_expiry_date: null,
          passport_photo_url: null,
        },
        { status: 200 }
      );
    }

    // Get signed URL for passport photo if exists
    let passportPhotoUrl: string | null = null;
    if (passport.passport_photo_path) {
      const { data: signedUrlData } = await supabase.storage
        .from("passport-photos")
        .createSignedUrl(passport.passport_photo_path, 3600);

      if (signedUrlData) {
        passportPhotoUrl = signedUrlData.signedUrl;
      }
    }

    return NextResponse.json({
      passport_full_name: passport.passport_full_name,
      passport_number: passport.passport_number,
      passport_country: passport.passport_country,
      passport_expiry_date: passport.passport_expiry_date,
      passport_photo_url: passportPhotoUrl,
    });
  } catch (e: unknown) {
    console.error("Get passport error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Server error." },
      { status: 500 }
    );
  }
}
