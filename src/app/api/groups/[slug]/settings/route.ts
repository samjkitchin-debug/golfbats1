import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../../lib/supabaseServer";

/**
 * GET /api/groups/[slug]/settings
 * Get group settings (including scenario presets)
 */
export async function GET(
  req: Request,
  context: { params: Promise<{ slug: string }> }
) {
  try {
    const supabase = await createSupabaseServerClient();
    
    // Get user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { slug } = await context.params;

    // Get group by slug
    const { data: group, error: groupError } = await supabase
      .from("groups")
      .select("id, name, slug, default_scenario_key, secondary_scenario_key")
      .eq("slug", slug)
      .eq("is_active", true)
      .maybeSingle();

    if (groupError) {
      console.error("Failed to fetch group:", groupError);
      return NextResponse.json({ error: "Failed to fetch group" }, { status: 500 });
    }

    if (!group) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }

    // Check if user is admin member of this group
    const { data: membership, error: membershipError } = await supabase
      .from("group_members")
      .select("role, status")
      .eq("group_id", group.id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (membershipError) {
      console.error("Failed to check membership:", membershipError);
      return NextResponse.json({ error: "Failed to check membership" }, { status: 500 });
    }

    if (!membership || membership.status !== "approved" || membership.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json({
      groupId: group.id,
      groupName: group.name,
      groupSlug: group.slug,
      defaultScenarioKey: group.default_scenario_key || null,
      secondaryScenarioKey: group.secondary_scenario_key || null,
    });
  } catch (error) {
    console.error("Error in GET /api/groups/[slug]/settings:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/groups/[slug]/settings
 * Update group settings (scenario presets)
 * Body: { defaultScenarioKey?: string | null, secondaryScenarioKey?: string | null }
 */
export async function PATCH(
  req: Request,
  context: { params: Promise<{ slug: string }> }
) {
  try {
    const supabase = await createSupabaseServerClient();
    
    // Get user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { slug } = await context.params;
    const body = await req.json().catch(() => ({}));
    const { defaultScenarioKey, secondaryScenarioKey } = body;

    // Get group by slug
    const { data: group, error: groupError } = await supabase
      .from("groups")
      .select("id")
      .eq("slug", slug)
      .eq("is_active", true)
      .maybeSingle();

    if (groupError) {
      console.error("Failed to fetch group:", groupError);
      return NextResponse.json({ error: "Failed to fetch group" }, { status: 500 });
    }

    if (!group) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }

    // Check if user is admin member of this group
    const { data: membership, error: membershipError } = await supabase
      .from("group_members")
      .select("role, status")
      .eq("group_id", group.id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (membershipError) {
      console.error("Failed to check membership:", membershipError);
      return NextResponse.json({ error: "Failed to check membership" }, { status: 500 });
    }

    if (!membership || membership.status !== "approved" || membership.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Validate scenario keys
    const allowedScenarioKeys = [
      "local_round", "carpool_round", "away_day", "overnight_trip",
      "organiser_booking", "cross_border_agent", "casual_round",
    ];

    const updateData: { default_scenario_key?: string | null; secondary_scenario_key?: string | null } = {};

    if (defaultScenarioKey !== undefined) {
      if (defaultScenarioKey === null || defaultScenarioKey === "") {
        updateData.default_scenario_key = null;
      } else if (typeof defaultScenarioKey === "string" && allowedScenarioKeys.includes(defaultScenarioKey)) {
        updateData.default_scenario_key = defaultScenarioKey;
      } else {
        return NextResponse.json(
          { error: `defaultScenarioKey must be one of: ${allowedScenarioKeys.join(", ")}, or null` },
          { status: 400 }
        );
      }
    }

    if (secondaryScenarioKey !== undefined) {
      if (secondaryScenarioKey === null || secondaryScenarioKey === "") {
        updateData.secondary_scenario_key = null;
      } else if (typeof secondaryScenarioKey === "string" && allowedScenarioKeys.includes(secondaryScenarioKey)) {
        updateData.secondary_scenario_key = secondaryScenarioKey;
      } else {
        return NextResponse.json(
          { error: `secondaryScenarioKey must be one of: ${allowedScenarioKeys.join(", ")}, or null` },
          { status: 400 }
        );
      }
    }

    // Update group
    const { error: updateError } = await supabase
      .from("groups")
      .update(updateData)
      .eq("id", group.id);

    if (updateError) {
      console.error("Failed to update group settings:", updateError);
      return NextResponse.json({ error: "Failed to update settings" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in PATCH /api/groups/[slug]/settings:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
