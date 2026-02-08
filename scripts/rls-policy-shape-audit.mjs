/**
 * RLS policy-shape audit: structure-only validation of phase_security_1 migration.
 * Does NOT hit Supabase (no network). Asserts migration file content:
 * - ENABLE RLS on all listed catalog + restricted tables
 * - CREATE POLICY FOR SELECT for catalog tables only
 * - No CREATE POLICY for restricted tables
 */
import fs from "fs";
import path from "path";

const ROOT = process.cwd();
const MIGRATION_PATH = path.join(ROOT, "docs", "sql", "migrations", "phase_security_1_rls_public_tables.sql");

const CATALOG_TABLES = ["clubs", "courses", "tees", "tee_holes", "provider_course_map"];
const RESTRICTED_TABLES = [
  "result_rows",
  "member_handicap_index",
  "trip_flight_exports",
  "gameday_round_participants",
  "gameday_flight_rounds",
  "gameday_hole_commits",
  "handicap_rounds",
];

let failCount = 0;

if (!fs.existsSync(MIGRATION_PATH)) {
  console.error(`RLS policy-shape audit FAIL: migration file not found: ${MIGRATION_PATH}`);
  process.exit(1);
}

const content = fs.readFileSync(MIGRATION_PATH, "utf8");

// 1) Each catalog table must have ENABLE ROW LEVEL SECURITY
for (const table of CATALOG_TABLES) {
  const enablePattern = `ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`;
  if (!content.includes(enablePattern)) {
    console.error(`RLS policy-shape audit FAIL: missing "${enablePattern}" in migration.`);
    failCount++;
  }
}

// 2) Each catalog table must have a CREATE POLICY ... FOR SELECT
for (const table of CATALOG_TABLES) {
  const policyPattern = `ON public.${table}`;
  const selectPolicy = `FOR SELECT`;
  if (!content.includes(policyPattern) || !content.includes(selectPolicy)) {
    console.error(`RLS policy-shape audit FAIL: catalog table "${table}" must have CREATE POLICY ... FOR SELECT ... ON public.${table} in migration.`);
    failCount++;
  }
}

// 3) Each restricted table must have ENABLE ROW LEVEL SECURITY
for (const table of RESTRICTED_TABLES) {
  const enablePattern = `ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`;
  if (!content.includes(enablePattern)) {
    console.error(`RLS policy-shape audit FAIL: missing "${enablePattern}" in migration.`);
    failCount++;
  }
}

// 4) Restricted tables must NOT have any CREATE POLICY (no ON public.<restricted> policy)
for (const table of RESTRICTED_TABLES) {
  const policyOnTable = `ON public.${table}`;
  if (content.includes(policyOnTable)) {
    console.error(`RLS policy-shape audit FAIL: restricted table "${table}" must not have CREATE POLICY in migration (found "${policyOnTable}").`);
    failCount++;
  }
}

if (failCount > 0) {
  console.error(`RLS policy-shape audit: ${failCount} violation(s).`);
  process.exit(1);
}

console.log("RLS policy-shape audit OK: migration file structure matches expected RLS posture.");
