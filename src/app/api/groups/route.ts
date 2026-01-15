import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/app/lib/supabaseServer";

type Body = {
  name?: unknown;
};

function asTrimmedString(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/**
 * Slugify a string: lowercase, replace non-alphanumeric with hyphens, collapse hyphens, trim
 */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Check if a slug is reserved
 */
function isReservedSlug(slug: string): boolean {
  const reserved = [
    "admin",
    "api",
    "join",
    "groups",
    "gameday",
    "results",
    "me",
    "home",
    "trips",
    "courses",
    "tools",
    "app",
    "auth",
    "callback",
    "login",
    "logout",
    "privacy",
    "about",
    "terms",
    "settings",
    "profile",
    "clubhouse",
    "course",
    "trip",
    "round",
    "rounds",
    "g",
  ];
  return reserved.includes(slug);
}

/**
 * Check if text contains blocked terms
 * Uses token matching to reduce false positives
 */
function containsBlockedTerm(text: string): boolean {
  const blocked = [
    "fuck",
    "shit",
    "asshole",
    "bitch",
    "damn",
    "crap",
  ];
  const lower = text.toLowerCase();
  
  // Split into tokens using non-alphanumeric separators
  const tokens = lower.split(/[^a-z0-9]+/).filter(Boolean);
  
  // Check tokens against blocked list (exact match)
  if (blocked.some((term) => tokens.includes(term))) {
    return true;
  }
  
  // Also check the slugified form tokens
  const slugified = slugify(text);
  const slugTokens = slugified.split("-").filter(Boolean);
  
  return blocked.some((term) => slugTokens.includes(term));
}

/**
 * Generate a random 4-character suffix
 */
function generateSuffix(): string {
  // Use crypto.randomUUID if available, else fallback
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID().slice(0, 4).replace(/-/g, "");
  }
  // Fallback: use Math.random
  return Math.random().toString(36).slice(2, 6);
}

/**
 * POST /api/groups
 * Create a new group and add the creator as an admin member
 * Body: { name: string }
 * Slug is generated server-side from name
 */
export async function POST(req: Request) {
  try {
    const supabase = await createSupabaseServerClient();

    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const json = (await req.json()) as Body;

    const name = asTrimmedString(json.name);

    // Validate inputs
    if (!name) {
      return NextResponse.json(
        { error: "Group name is required." },
        { status: 400 }
      );
    }

    // Check for blocked terms
    if (containsBlockedTerm(name)) {
      return NextResponse.json(
        { error: "That group name isn't allowed. Pick something you'd be happy sharing with the group." },
        { status: 400 }
      );
    }

    // Validate length limits
    if (name.length > 60) {
      return NextResponse.json(
        { error: "Group name must be 60 characters or fewer." },
        { status: 400 }
      );
    }

    // Generate slug base
    let base = slugify(name);
    
    // If base is empty, reserved, or contains blocked terms, use "group"
    if (!base || isReservedSlug(base) || containsBlockedTerm(base)) {
      base = "group";
    }

    // Truncate to max 24 chars (before suffix)
    if (base.length > 24) {
      base = base.slice(0, 24);
    }

    const now = new Date().toISOString();

    // Attempt to insert with unique slug (up to 8 attempts)
    let group = null;
    let groupErr = null;
    let attempts = 0;
    const maxAttempts = 8;

    while (attempts < maxAttempts && !group) {
      const suffix = generateSuffix();
      const candidate = `${base}-${suffix}`;

      const { data, error } = await supabase
        .from("groups")
        .insert({
          slug: candidate,
          name,
          created_by: user.id,
          is_active: true,
        })
        .select("id, slug, name")
        .single();

      if (!error) {
        group = data;
        break;
      }

      // Check for unique constraint violation
      const isUniqueViolation =
        error.code === "23505" || error.message?.includes("unique");

      if (!isUniqueViolation) {
        // Non-unique error - fail immediately
        groupErr = error;
        break;
      }

      // Unique violation - retry with new suffix
      attempts++;
    }

    if (groupErr) {
      return NextResponse.json(
        { error: groupErr.message || "Failed to create group." },
        { status: 400 }
      );
    }

    if (!group) {
      return NextResponse.json(
        { error: "Failed to create group. Please try again." },
        { status: 500 }
      );
    }

    // Add creator as admin member with approved status
    const { error: memberErr } = await supabase.from("group_members").insert({
      group_id: group.id,
      user_id: user.id,
      role: "admin",
      status: "approved",
      approved_at: now,
      approved_by: user.id,
    });

    if (memberErr) {
      console.error("[groups API] Failed to add creator as admin member:", memberErr);
      // Group was created but membership failed - attempt to rollback by deleting the group
      const { error: rollbackErr } = await supabase.from("groups").delete().eq("id", group.id);
      if (rollbackErr) {
        console.error("[groups API] Rollback delete failed (may be due to RLS or other constraint):", rollbackErr);
      }
      return NextResponse.json(
        { error: "Failed to create group." },
        { status: 500 }
      );
    }

    // Update members.last_active_group_id to the newly created group
    const { data: updateData, error: updateActiveGroupErr } = await supabase
      .from("members")
      .update({ last_active_group_id: group.id })
      .eq("id", user.id)
      .select("id");

    if (updateActiveGroupErr) {
      // If column doesn't exist, log warning but don't fail the request
      // The group and membership are already created successfully
      if (updateActiveGroupErr.message?.includes("column") && updateActiveGroupErr.message?.includes("does not exist")) {
        console.warn("[groups API] last_active_group_id column missing - migration needed:", updateActiveGroupErr);
      } else {
        console.error("[groups API] Failed to update last_active_group_id:", updateActiveGroupErr);
        // Non-critical error - group and membership are created, so continue
      }
    } else if (!updateData || updateData.length === 0) {
      // No rows were updated - member profile row may be missing
      console.warn("[groups API] member profile row missing; cannot set last_active_group_id");
      // Non-critical error - group and membership are created, so continue
    }

    return NextResponse.json({
      group: {
        id: group.id,
        slug: group.slug,
        name: group.name,
      },
      redirectGroupId: group.id,
    });
  } catch (error) {
    console.error("Create group error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "An error occurred." },
      { status: 500 }
    );
  }
}
