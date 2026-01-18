import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

type Body = {
  full_name?: unknown;
  display_name?: unknown;
  nationality?: unknown;
  declared_handicap?: unknown;
  handicap_type?: unknown;
};

function asTrimmedString(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function asNullableNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const n = Number(v.trim());
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export async function POST(req: Request) {
  try {
    const cookieStore = await cookies();

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) => {
                cookieStore.set(name, value, options);
              });
            } catch {
              // In some runtimes, setting cookies can throw; ignore.
            }
          },
        },
      }
    );

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user) {
      return NextResponse.json(
        { error: "Not signed in." },
        { status: 401 }
      );
    }

    const json = (await req.json()) as Body;

    const full_name = asTrimmedString(json.full_name);
    const display_name = asTrimmedString(json.display_name);
    const nationality = asTrimmedString(json.nationality);
    const handicap_type = typeof json.handicap_type === "string" && 
      (json.handicap_type === "declared_starter" || 
       json.handicap_type === "declared_established" || 
       json.handicap_type === "dayforeit_official")
      ? json.handicap_type
      : "declared_starter";

    // Strict profile requirements:
    // - Full name required
    // - Display name required
    // - Nationality required
    if (!full_name) {
      return NextResponse.json(
        { error: "Please provide your full name." },
        { status: 400 }
      );
    }

    if (!display_name) {
      return NextResponse.json(
        { error: "Please provide a display name." },
        { status: 400 }
      );
    }

    if (!nationality) {
      return NextResponse.json(
        { error: "Please provide your nationality." },
        { status: 400 }
      );
    }

    // First check if member exists and load current handicap_type
    const { data: existingMember } = await supabase
      .from("members")
      .select("id, handicap_type")
      .eq("id", user.id)
      .maybeSingle();

    const now = new Date().toISOString();

    // If current handicap_type is 'dayforeit_official', lock handicap fields
    const handicapLocked = existingMember?.handicap_type === "dayforeit_official";

    const declared_handicap = asNullableNumber(json.declared_handicap);
    
    // Only validate handicap if not locked
    if (!handicapLocked) {
      if (
        declared_handicap !== null &&
        (declared_handicap < 0 || declared_handicap > 36)
      ) {
        return NextResponse.json(
          { error: "Declared handicap must be a number between 0 and 36." },
          { status: 400 }
        );
      }
    }

    if (existingMember) {
      // Update existing member
      const updatePayload: Record<string, unknown> = {
        full_name,
        display_name,
        nationality,
        last_seen: now,
      };

      // Only include handicap fields if not locked
      if (!handicapLocked) {
        updatePayload.declared_handicap = declared_handicap;
        updatePayload.handicap_type = handicap_type;
      }

      const { error: upErr } = await supabase
        .from("members")
        .update(updatePayload)
        .eq("id", user.id);

      if (upErr) {
        return NextResponse.json({ error: upErr.message }, { status: 400 });
      }
    } else {
      // Create new member row (status defaults to 'pending' for new members)
      const { error: insErr } = await supabase
        .from("members")
        .insert({
          id: user.id,
          email: user.email || "",
          full_name,
          display_name,
          nationality,
          declared_handicap,
          handicap_type,
          last_seen: now,
          created_at: now,
          status: "pending",
        });

      if (insErr) {
        return NextResponse.json({ error: insErr.message }, { status: 400 });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Server error." },
      { status: 500 }
    );
  }
}
