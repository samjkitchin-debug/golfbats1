/**
 * GolfCourseAPI SEA baseline ingest
 *
 * POST only. Same ADMIN_INGEST_SECRET + x-admin-secret protection.
 * Focused on Singapore, Indonesia, Malaysia, Thailand.
 * Reuses runGolfCourseApiIngest; returns summary + byCountry breakdown.
 */

export const runtime = "nodejs";
export const maxDuration = 900; // 15 min for long-running SEA ingest

import { NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/app/lib/supabaseServer";
import { runGolfCourseApiIngest } from "@/app/lib/providers/golfcourseapi/ingest";

const SEA_QUERIES = [
  // Singapore
  "singapore",
  "sentosa",
  "changi",
  "punggol",
  "woodlands",
  "jurong",
  "seletar",
  "simei",
  "tampines",
  "bukit timah",
  "orchard",
  // Indonesia
  "indonesia",
  "jakarta",
  "bali",
  "batam",
  "bintan",
  "surabaya",
  "bandung",
  "medan",
  "lombok",
  "yogyakarta",
  "makassar",
  // Malaysia
  "malaysia",
  "kuala lumpur",
  "selangor",
  "johor",
  "penang",
  "ipoh",
  "malacca",
  "sabah",
  "sarawak",
  "kota kinabalu",
  "langkawi",
  // Thailand
  "thailand",
  "bangkok",
  "phuket",
  "chiang mai",
  "pattaya",
  "hua hin",
  "krabi",
  "samui",
  "rayong",
  // Golf-anchoring terms
  "golf",
  "golf club",
  "country club",
  "links",
  "national",
  "royal",
  "hills",
  "valley",
  "park",
];

function requireAdminSecret(req: Request): boolean {
  const secret = process.env.ADMIN_INGEST_SECRET;
  if (!secret) return false;
  const provided = req.headers.get("x-admin-secret");
  return !!provided && provided === secret;
}

export async function POST(req: Request) {
  console.log("[ingest-sea] route config", { runtime: "nodejs", maxDuration: 900, at: new Date().toISOString() });

  if (!requireAdminSecret(req)) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  let body: { extraQueries?: string[]; force?: boolean } = {};
  try {
    const raw = await req.text();
    if (raw) body = JSON.parse(raw);
  } catch {
    // Empty body is fine
  }

  const force =
    body.force === true ||
    new URL(req.url).searchParams.get("force") === "1";
  const extraQueries = body.extraQueries ?? [];
  const seedQueries = [...new Set([...SEA_QUERIES])];

  const routeErrors: Array<{ stage: string; message?: string }> = [];

  try {
  const summary = await runGolfCourseApiIngest({
    extraQueries,
    force,
    seedQueries,
  });

  const supabase = await createSupabaseServiceClient();
  const { data: byCountryRows, error: byCountryErr } = await supabase
    .from("courses")
    .select("country")
    .eq("data_source", "golfcourseapi");

  let byCountryArray: Array<{ country: string; count: number }>;
  if (byCountryErr) {
    routeErrors.push({ stage: "byCountry", message: byCountryErr.message });
    byCountryArray = [{ country: "Unknown", count: 0 }];
  } else {
    const countryMap = new Map<string, number>();
    for (const row of byCountryRows ?? []) {
      const c = (row.country ?? "").toString().trim() || "Unknown";
      countryMap.set(c, (countryMap.get(c) ?? 0) + 1);
    }
    byCountryArray = [...countryMap.entries()]
      .map(([country, count]) => ({ country, count }))
      .sort((a, b) => b.count - a.count);
    if (byCountryArray.length === 0) {
      byCountryArray = [{ country: "Unknown", count: 0 }];
    }
  }

  const mergedErrors = [...summary.errors, ...routeErrors];
  const errorsCount = mergedErrors.length;

  return NextResponse.json({
    ...summary,
    errors_count: errorsCount,
    errors: mergedErrors.slice(0, 50),
    byCountry: byCountryArray,
  });
  } catch (e) {
    const err = e as Error;
    if (err.message?.includes("Healthcheck")) {
      return NextResponse.json(
        { error: "GolfCourseAPI healthcheck failed", details: err.message },
        { status: 502 }
      );
    }
    return NextResponse.json(
      { error: "Ingest failed", details: err.message },
      { status: 500 }
    );
  }
}
