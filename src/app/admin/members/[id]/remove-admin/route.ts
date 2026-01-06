import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/app/lib/supabaseServer";
import { isEmailAdmin } from "@/app/lib/auth";

/**
 * POST /admin/members/[id]/remove-admin
 * Remove admin flag from a member (is_admin = false).
 * Only accessible to existing admins.
 */
export async function POST(
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

    // Check admin status via env allowlist OR existing is_admin flag
    const emailAdmin = isEmailAdmin(user.email);

    const { data: selfMember } = await supabase
      .from("members")
      .select("is_admin")
      .eq("id", user.id)
      .maybeSingle();

    const isAdmin = emailAdmin || !!selfMember?.is_admin;

    if (!isAdmin) {
      return NextResponse.json({ error: "Admin access required." }, { status: 403 });
    }

    const memberId = params.id;

    if (!memberId) {
      return NextResponse.json({ error: "Member ID is required." }, { status: 400 });
    }

    // Prevent an admin from removing their own admin flag (to avoid lockout)
    if (memberId === user.id) {
      return NextResponse.json(
        { error: "You cannot remove admin status from your own account." },
        { status: 400 }
      );
    }

    // Verify target member exists
    const { data: member, error: memberError } = await supabase
      .from("members")
      .select("id,is_admin")
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

    const { error: updateError } = await supabase
      .from("members")
      .update({ is_admin: false })
      .eq("id", memberId);

    if (updateError) {
      return NextResponse.json(
        { error: `Failed to remove admin status: ${updateError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    console.error("Remove admin error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Server error." },
      { status: 500 }
    );
  }
}


