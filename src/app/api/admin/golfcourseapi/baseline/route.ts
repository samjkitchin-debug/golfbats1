/**
 * GolfCourseAPI baseline coverage
 *
 * GET only. Protected by ADMIN_INGEST_SECRET + x-admin-secret header.
 * Returns counts: discovered, hydrated_success, errors_recent.
 */

import { NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/app/lib/supabaseServer";

const PROVIDER = "golfcourseapi";

function requireAdminSecret(req: Request): boolean {
  const secret = process.env.ADMIN_INGEST_SECRET;
  if (!secret) return false;
  const provided = req.headers.get("x-admin-secret");
  return !!provided && provided === secret;
}

export async function GET(req: Request) {
  if (!requireAdminSecret(req)) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const supabase = await createSupabaseServiceClient();

  const { data: discoveryRows } = await supabase
    .from("provider_course_discovery")
    .select("provider_course_id")
    .eq("provider", PROVIDER);

  const discovered = discoveryRows?.length ?? 0;

  const { data: rawRows } = await supabase
    .from("provider_courses_raw")
    .select("last_success_at, last_error_at")
    .eq("provider", PROVIDER);

  let hydratedSuccess = 0;
  let errorsRecent = 0;
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  for (const r of rawRows ?? []) {
    if (r.last_success_at) hydratedSuccess++;
    if (r.last_error_at && r.last_error_at >= oneDayAgo) errorsRecent++;
  }

  const { data: lastRun } = await supabase
    .from("provider_ingest_runs")
    .select("started_at, finished_at, status")
    .eq("provider", PROVIDER)
    .order("started_at", { ascending: false })
    .limit(1)
    .single();

  return NextResponse.json({
    provider: PROVIDER,
    discovered,
    hydrated_success: hydratedSuccess,
    errors_recent: errorsRecent,
    last_run: lastRun
      ? {
          started_at: lastRun.started_at,
          finished_at: lastRun.finished_at,
          status: lastRun.status,
        }
      : null,
  });
}
