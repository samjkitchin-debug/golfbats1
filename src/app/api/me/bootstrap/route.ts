import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/app/lib/supabaseServer";

/**
 * GET /api/me/bootstrap
 * Returns a consolidated bootstrap payload for member pages to avoid multiple client-side queries.
 * Includes: user info, member profile, approved group memberships, and computed values.
 */
export async function GET(req: Request) {
  try {
    const supabase = await createSupabaseServerClient();

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Fetch member profile and approved memberships in parallel
    const [memberResult, membershipsResult] = await Promise.all([
      // Member profile query
      supabase
        .from("members")
        .select("id, full_name, display_name, nationality, profile_photo_path, last_active_group_id, declared_handicap")
        .eq("id", user.id)
        .maybeSingle(),
      // Approved group memberships with group details
      supabase
        .from("group_members")
        .select("group_id, role, groups(id, slug, name, is_active)")
        .eq("user_id", user.id)
        .eq("status", "approved"),
    ]);

    const member = memberResult.data;
    const memberships = membershipsResult.data || [];

    // Compute isProfileComplete
    const isProfileComplete = !!(
      member?.full_name &&
      member?.display_name &&
      member?.nationality
    );

    // Filter to only active groups and extract group data
    // Note: Supabase returns groups as an object (not array) for foreign key relationships
    const approvedGroups = memberships
      .filter((gm) => {
        const group = gm.groups;
        // Handle both object and array cases (though foreign key should be object)
        if (Array.isArray(group)) {
          return group.length > 0 && group[0]?.is_active === true;
        }
        return group && typeof group === "object" && (group as any).is_active === true;
      })
      .map((gm) => {
        // Extract group data (handle both object and array cases)
        const groupData = Array.isArray(gm.groups) ? gm.groups[0] : gm.groups;
        const group = groupData as { id: string; slug: string; name: string; is_active: boolean };
        return {
          id: group.id,
          slug: group.slug,
          name: group.name,
          role: gm.role as string,
        };
      });

    // Compute activeGroupId
    let activeGroupId: string | null = null;
    if (member?.last_active_group_id) {
      // Check if last_active_group_id is in approvedGroups
      const isInApproved = approvedGroups.some((g) => g.id === member.last_active_group_id);
      if (isInApproved) {
        activeGroupId = member.last_active_group_id;
      }
    }
    // If not set yet, use first approved group or null
    if (!activeGroupId && approvedGroups.length > 0) {
      activeGroupId = approvedGroups[0].id;
    }

    const hasApprovedGroup = approvedGroups.length > 0;

    // Build response
    return NextResponse.json({
      userId: user.id,
      member: member
        ? {
            full_name: member.full_name,
            display_name: member.display_name,
            nationality: member.nationality,
            profile_photo_path: member.profile_photo_path,
            last_active_group_id: member.last_active_group_id,
            declared_handicap: member.declared_handicap,
          }
        : null,
      isProfileComplete,
      approvedGroups,
      activeGroupId,
      hasApprovedGroup,
    });
  } catch (error) {
    console.error("[bootstrap API] Error:", error);
    return NextResponse.json(
      { error: "An error occurred while loading bootstrap data." },
      { status: 500 }
    );
  }
}
