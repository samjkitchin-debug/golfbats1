import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/app/lib/supabaseServer";

/**
 * GET /api/admin/passport-statuses
 * Get passport statuses for all members (admin only).
 * Uses server-side client to bypass RLS if needed.
 */
export async function GET(req: Request) {
  try {
    const supabase = await createSupabaseServerClient();

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user) {
      return NextResponse.json({ error: "Not signed in." }, { status: 401 });
    }

    // Check admin status (using env fallback + DB is_admin)
    const adminEmails = (process.env.ADMIN_EMAILS || "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
    const email = (user.email ?? "").toLowerCase();
    const isEnvAdmin = adminEmails.includes(email);

    // Also check DB is_admin flag
    const { data: member } = await supabase
      .from("members")
      .select("is_admin")
      .eq("id", user.id)
      .maybeSingle();

    const isAdmin = isEnvAdmin || !!member?.is_admin;

    if (!isAdmin) {
      return NextResponse.json({ error: "Admin access required." }, { status: 403 });
    }

    // Fetch all passport data (server-side client may bypass RLS depending on setup)
    const { data: passports, error: passportError } = await supabase
      .from("member_passports")
      .select("user_id,passport_full_name,passport_number_encrypted,passport_country,passport_expiry_date,passport_photo_path");

    if (passportError) {
      console.error("Passport status fetch error:", passportError);
      return NextResponse.json(
        { error: `Failed to fetch passport statuses: ${passportError.message}` },
        { status: 500 }
      );
    }

    // Build status map
    const statuses: Record<string, { memberId: string; hasPassport: boolean; isComplete: boolean }> = {};
    if (passports) {
      for (const passport of passports) {
        const hasPassport = true;
        const isComplete =
          !!passport.passport_full_name &&
          !!passport.passport_number_encrypted &&
          !!passport.passport_country &&
          !!passport.passport_expiry_date;

        statuses[passport.user_id] = { memberId: passport.user_id, hasPassport, isComplete };
      }
    }

    return NextResponse.json({ statuses });
  } catch (e: any) {
    console.error("Passport statuses error:", e);
    return NextResponse.json(
      { error: e?.message || "Server error." },
      { status: 500 }
    );
  }
}


