import "server-only";

import { createSupabaseServiceClient } from "@/app/lib/supabaseServer";
import {
  getHealthcheck,
  searchCourses,
  getCourseById,
} from "./client";

const PROVIDER = "golfcourseapi";
// 500ms delay = ~2 requests/sec. Safe for most basic tiers.
const RATE_LIMIT_DELAY_MS = 500;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function assertNoDbError(op: string, error: unknown): void {
  if (!error) return;
  const msg = error && typeof error === "object" && "message" in error
    ? String((error as { message?: unknown }).message)
    : String(error);
  throw new Error(`[db] ${op} failed: ${msg}`);
}

export type RunSummary = {
  runId: string;
  status: "success" | "partial" | "failed";
  discovered_total: number;
  discovered_new: number;
  hydrated_attempted: number;
  hydrated_success: number;
  errors_count: number;
  errors: Array<{ provider_course_id: string; error: string }>;
};

export type RunGolfCourseApiIngestOptions = {
  extraQueries: string[];
  force: boolean;
  seedQueries: string[];
  hydrateLimit?: number;
};

const HYDRATE_LIMIT_DEFAULT = 200;
const STALE_DAYS = 30;
const HYDRATION_DELAY_MS = 250;

export async function runGolfCourseApiIngest(
  options: RunGolfCourseApiIngestOptions
): Promise<RunSummary> {
  const { extraQueries, force, seedQueries } = options;
  const allQueries = [...new Set([...seedQueries, ...extraQueries])];

  const supabase = await createSupabaseServiceClient();

  const { data: runRow, error: runInsertErr } = await supabase
    .from("provider_ingest_runs")
    .insert({
      provider: PROVIDER,
      status: "running",
      notes: `extraQueries: ${extraQueries.length}, force: ${force}`,
    })
    .select("id")
    .single();

  if (runInsertErr || !runRow) {
    throw new Error(`Failed to start run: ${runInsertErr?.message ?? "unknown"}`);
  }

  const runId = runRow.id;

  const finishRun = async (
    status: "success" | "partial" | "failed",
    notes?: string
  ) => {
    await supabase
      .from("provider_ingest_runs")
      .update({
        finished_at: new Date().toISOString(),
        status,
        notes: notes ?? undefined,
      })
      .eq("id", runId);
  };

  await getHealthcheck().catch((e) => {
    finishRun("failed", `Healthcheck failed: ${(e as Error).message}`);
    throw e;
  });

  // --- Discovery Phase ---
  const discoveredIdsBefore = new Set<string>();
  const { data: existingDiscovery } = await supabase
    .from("provider_course_discovery")
    .select("provider_course_id")
    .eq("provider", PROVIDER);
  for (const r of existingDiscovery ?? []) {
    discoveredIdsBefore.add(r.provider_course_id);
  }

  const discoveredIds = new Set<string>();
  for (const query of allQueries) {
    try {
      await delay(RATE_LIMIT_DELAY_MS); // Throttle
      const { courses } = await searchCourses(query);
      for (const c of courses) {
        const id = String(c.id);
        discoveredIds.add(id);
        await supabase
          .from("provider_course_discovery")
          .upsert(
            {
              provider: PROVIDER,
              provider_course_id: id,
              discovered_via: "search",
              discovered_query: query,
            },
            { onConflict: "provider,provider_course_id" }
          );
      }
    } catch (e) {
      console.warn(`[ingest] Search "${query}" failed:`, (e as Error).message);
    }
  }

  const discoveredTotal = discoveredIds.size;
  const discoveredNew = [...discoveredIds].filter((id) => !discoveredIdsBefore.has(id)).length;

  // --- Hydration Phase: explicit backlog (independent of discovered_new) ---
  const hydrateLimit = options.hydrateLimit ?? HYDRATE_LIMIT_DEFAULT;

  const { data: discoveryRows, error: discErr } = await supabase
    .from("provider_course_discovery")
    .select("provider_course_id")
    .eq("provider", PROVIDER)
    .order("discovered_at", { ascending: false })
    .limit(hydrateLimit);

  if (discErr) {
    await finishRun("failed", `Discovery query failed: ${discErr.message}`);
    throw new Error(`Discovery query failed: ${discErr.message}`);
  }

  const backlogIds = (discoveryRows ?? []).map((r) => r.provider_course_id);

  // Fetch raw rows to decide which need hydration (no schema change: use last_success_at, last_error_at)
  const { data: rawRows } = await supabase
    .from("provider_courses_raw")
    .select("provider_course_id, last_success_at, last_error_at")
    .eq("provider", PROVIDER)
    .in("provider_course_id", backlogIds.length > 0 ? backlogIds : ["__none__"]);

  const rawByPid = new Map(
    (rawRows ?? []).map((r) => [r.provider_course_id, r])
  );

  const staleCutoff = new Date();
  staleCutoff.setDate(staleCutoff.getDate() - STALE_DAYS);

  const idsToHydrate: string[] = [];
  for (const pid of backlogIds) {
    if (force) {
      idsToHydrate.push(pid);
      continue;
    }
    const raw = rawByPid.get(pid);
    if (!raw) {
      idsToHydrate.push(pid);
      continue;
    }
    if (raw.last_success_at == null) {
      idsToHydrate.push(pid);
      continue;
    }
    if (raw.last_error_at != null) {
      idsToHydrate.push(pid);
      continue;
    }
    const lastSuccess = new Date(raw.last_success_at);
    if (lastSuccess < staleCutoff) {
      idsToHydrate.push(pid);
    }
  }

  let hydratedOk = 0;
  const errors: Array<{ provider_course_id: string; error: string }> = [];

  for (let i = 0; i < idsToHydrate.length; i++) {
    const pid = idsToHydrate[i];
    await delay(RATE_LIMIT_DELAY_MS);

    try {
      if ((i + 1) % 10 === 0) {
        console.log(`[ingest] getCourseById start ${pid} (${i + 1}/${idsToHydrate.length})`);
      }
      const details = await getCourseById(pid);
      if ((i + 1) % 10 === 0) {
        console.log(`[ingest] getCourseById done ${pid} (${i + 1}/${idsToHydrate.length})`);
      }
      const payload = details as unknown as Record<string, unknown>;

      const { error: rawErr } = await supabase.from("provider_courses_raw").upsert(
        {
          provider: PROVIDER,
          provider_course_id: pid,
          payload,
          fetched_at: new Date().toISOString(),
          last_success_at: new Date().toISOString(),
          last_error_at: null,
          last_error: null,
        },
        { onConflict: "provider,provider_course_id" }
      );
      assertNoDbError("provider_courses_raw upsert", rawErr);

      const courseName =
        (details.course_name as string | undefined) ||
        ((details as any).name as string | undefined) ||
        (details.club_name as string | undefined) ||
        `Unknown Course (${pid})`;

      const loc = details.location ?? {};
      const address = [loc.address, loc.city, loc.state, loc.country]
        .filter(Boolean)
        .join(", ") || null;

      const { data: existingMap } = await supabase
        .from("provider_course_map")
        .select("course_id")
        .eq("provider", PROVIDER)
        .eq("provider_course_id", pid)
        .single();

      let courseId: string;
      if (existingMap) {
        courseId = existingMap.course_id;
        const { error: courseUpdateErr } = await supabase.from("courses").update({
          name: courseName,
          club_name: details.club_name ?? null,
          address,
          city: (loc.city as string) ?? null,
          state: (loc.state as string) ?? null,
          country: (loc.country as string) ?? null,
          latitude: (loc.latitude as number) ?? null,
          longitude: (loc.longitude as number) ?? null,
          data_source: PROVIDER,
          updated_at: new Date().toISOString(),
        }).eq("id", courseId);
        assertNoDbError("courses update", courseUpdateErr);
      } else {
        const newCourseId = crypto.randomUUID();
        const { error: courseInsertErr } = await supabase.from("courses").insert({
          id: newCourseId,
          name: courseName,
          club_name: details.club_name ?? null,
          address,
          city: (loc.city as string) ?? null,
          state: (loc.state as string) ?? null,
          country: (loc.country as string) ?? null,
          latitude: (loc.latitude as number) ?? null,
          longitude: (loc.longitude as number) ?? null,
          data_source: PROVIDER,
        });
        assertNoDbError("courses insert", courseInsertErr);
        const { error: mapInsertErr } = await supabase.from("provider_course_map").insert({
          provider: PROVIDER,
          provider_course_id: pid,
          course_id: newCourseId,
        });
        assertNoDbError("provider_course_map insert", mapInsertErr);
        courseId = newCourseId;
      }

      // Map Tees
      const maleTees = details.tees?.male ?? [];
      const femaleTees = details.tees?.female ?? [];
      const allTees = [
        ...maleTees.map((t) => ({ ...t, _gender: "male" as const })),
        ...femaleTees.map((t) => ({ ...t, _gender: "female" as const })),
      ];

      // Replace old tees
      const { data: existingTees } = await supabase.from("tees").select("id").eq("course_id", courseId);
      if (existingTees?.length) {
        await supabase.from("tee_holes").delete().in("tee_id", existingTees.map(t => t.id));
        await supabase.from("tees").delete().eq("course_id", courseId);
      }

      for (let teeIdx = 0; teeIdx < allTees.length; teeIdx++) {
        const tee = allTees[teeIdx];
        const teeId = crypto.randomUUID();
        const rawLabel = ((tee.tee_name ?? (tee as any).label ?? "") as string).toString().trim();
        const labelBase = rawLabel || `Tee ${teeIdx + 1}`;
        const label = teeIdx > 0 ? `${labelBase} (${teeIdx + 1})` : labelBase;

        const totalYards =
          (tee as any).total_yards ??
          (tee.total_meters ? Math.round(tee.total_meters / 0.9144) : null);
        const totalMeters =
          tee.total_meters ??
          (totalYards ? Math.round(totalYards * 0.9144) : null);

        const metersRequired = Number.isFinite(totalMeters as number) ? (totalMeters as number) : 0;
        const parRequired =
          Number.isFinite((tee as any).par_total) ? (tee as any).par_total :
          Number.isFinite((tee as any).par) ? (tee as any).par :
          72;
        const slopeRequired =
          Number.isFinite((tee as any).slope_rating) ? (tee as any).slope_rating :
          Number.isFinite((tee as any).slope) ? (tee as any).slope :
          113;

        const { error: teeInsertErr } = await supabase.from("tees").insert({
          id: teeId,
          course_id: courseId,
          label,
          tee_name: tee.tee_name ?? null,
          gender: tee._gender,
          meters: metersRequired,
          yards: totalYards ?? null,
          par: parRequired,
          slope: slopeRequired,
          rating: tee.course_rating ?? null,
          data_source: PROVIDER,
        });
        assertNoDbError("tees insert", teeInsertErr);

        const holes = tee.holes ?? [];
        for (let i = 0; i < holes.length; i++) {
          const h = holes[i];
          const { error: holeInsertErr } = await supabase.from("tee_holes").insert({
            tee_id: teeId,
            hole_number: i + 1,
            par: h.par ?? null,
            yards: h.yardage ?? null,
            meters: h.yardage ? Math.round(h.yardage * 0.9144) : null,
            stroke_index: h.handicap ?? null,
          });
          assertNoDbError("tee_holes insert", holeInsertErr);
        }
      }

      hydratedOk++;
      if ((i + 1) % 10 === 0) {
        console.log(`[ingest] hydrated progress: ${i + 1}/${idsToHydrate.length}`);
      }
    } catch (e) {
      const errMsg = (e as Error).message;
      errors.push({ provider_course_id: pid, error: errMsg });
      const { error: errRawErr } = await supabase
        .from("provider_courses_raw")
        .upsert(
          {
            provider: PROVIDER,
            provider_course_id: pid,
            payload: { _hydration_error: errMsg },
            fetched_at: new Date().toISOString(),
            last_error_at: new Date().toISOString(),
            last_error: errMsg,
          },
          { onConflict: "provider,provider_course_id" }
        );
      if (errRawErr) {
        console.warn(`[ingest] Failed to record error for ${pid}:`, errRawErr.message);
      }
    }
    await delay(HYDRATION_DELAY_MS); // Conservative per-request delay (success or fail)
  }

  const status = errors.length === 0 ? "success" : "partial";
  await finishRun(status, `Discovered: ${discoveredTotal}, Hydrated: ${hydratedOk}, Errors: ${errors.length}`);

  return {
    runId,
    status,
    discovered_total: discoveredTotal,
    discovered_new: discoveredNew,
    hydrated_attempted: idsToHydrate.length,
    hydrated_success: hydratedOk,
    errors_count: errors.length,
    errors: errors.slice(0, 20),
  };
}
