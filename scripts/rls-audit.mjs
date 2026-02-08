/**
 * RLS-01: Restricted tables must never be queried by browser client.
 * Static scan: flag any file that both (1) uses a browser Supabase client and
 * (2) references a restricted table in .from("table") / .from('table').
 * Single source of truth for restricted vs catalog tables below.
 */
import fs from "fs";
import path from "path";

const ROOT = process.cwd();
const SRC_DIR = path.join(ROOT, "src");

// Restricted tables: server/service-only; no policies (deny all client access).
const RESTRICTED_TABLES = [
  "result_rows",
  "member_handicap_index",
  "trip_flight_exports",
  "gameday_round_participants",
  "gameday_flight_rounds",
  "gameday_hole_commits",
  "handicap_rounds",
];

// Catalog tables: browser SELECT allowed; writes not allowed (for reference only).
const CATALOG_TABLES = [
  "clubs",
  "courses",
  "tees",
  "tee_holes",
  "provider_course_map",
];

const BROWSER_CLIENT_PATTERNS = [
  "createSupabaseBrowserClient",
  "createBrowserClient",
  "createClientComponentClient",
];

function walk(dir) {
  const out = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...walk(p));
    else if (ent.isFile() && (p.endsWith(".ts") || p.endsWith(".tsx") || p.endsWith(".js") || p.endsWith(".mjs"))) out.push(p);
  }
  return out;
}

function hasBrowserClientContext(content) {
  return BROWSER_CLIENT_PATTERNS.some((pat) => content.includes(pat));
}

function referencesRestrictedTable(content, table) {
  // .from("table") or .from('table')
  const double = `.from("${table}")`;
  const single = `.from('${table}')`;
  return content.includes(double) || content.includes(single);
}

const files = walk(SRC_DIR);
let failCount = 0;

for (const file of files) {
  const content = fs.readFileSync(file, "utf8");
  if (!hasBrowserClientContext(content)) continue;

  for (const table of RESTRICTED_TABLES) {
    if (referencesRestrictedTable(content, table)) {
      const rel = path.relative(ROOT, file);
      console.error(`RLS-01 FAIL: restricted table "${table}" referenced in ${rel} with browser client context.`);
      failCount++;
    }
  }
}

if (failCount > 0) {
  console.error(`RLS-01: ${failCount} violation(s). Restricted tables must only be accessed via server/service client (e.g. API routes with createSupabaseServiceClient).`);
  process.exit(1);
}

console.log("RLS-01 OK: no restricted table referenced in browser client context.");
