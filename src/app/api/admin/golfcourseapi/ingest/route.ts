/**
 * GolfCourseAPI ingestion: discovery + hydration + normalisation
 *
 * POST only. Protected by ADMIN_INGEST_SECRET + x-admin-secret header.
 *
 * Body: { extraQueries?: string[], force?: boolean }
 * Query: ?force=1
 *
 * Without a bulk-list endpoint, we build "all discoverable via our seeds" baseline.
 */

import { NextResponse } from "next/server";
import { runGolfCourseApiIngest } from "@/app/lib/providers/golfcourseapi/ingest";

const SEED_QUERIES = [
  "golf",
  "club",
  "links",
  "country",
  "national",
  "royal",
  "park",
  "hills",
  "valley",
  "mount",
  "lake",
  "river",
  "beach",
  ...Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i)),
];

function requireAdminSecret(req: Request): boolean {
  const secret = process.env.ADMIN_INGEST_SECRET;
  if (!secret) return false;
  const provided = req.headers.get("x-admin-secret");
  return !!provided && provided === secret;
}

export async function POST(req: Request) {
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

  try {
    const summary = await runGolfCourseApiIngest({
      extraQueries,
      force,
      seedQueries: SEED_QUERIES,
    });
    return NextResponse.json({
      runId: summary.runId,
      status: summary.status,
      discovery: {
        discovered_total: summary.discovered_total,
        discovered_new: summary.discovered_new,
      },
      hydration: {
        hydrated_attempted: summary.hydrated_attempted,
        hydrated_success: summary.hydrated_success,
        errors: summary.errors_count,
      },
      errors: summary.errors,
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
