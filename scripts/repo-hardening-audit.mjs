import fs from "fs";
import path from "path";

const ROOT = process.cwd();
const SRC_DIR = path.join(ROOT, "src");

const bannedRouteRefs = [
  'href="/admin"',
  "href='/admin'",
  "router.push('/admin",
  "router.replace('/admin",
  "router.push(\"/admin",
  "router.replace(\"/admin",
  'redirect("/admin"',
  "redirect('/admin'",
];

const riskyGameDayPatterns = [
  // heuristic: constructing gameday route from trip id variables (common regression pattern)
  "/gameday/${trip.id}",
  "/gameday/${tripId}",
  "href={`/gameday/${trip.id}`",
  "href={`/gameday/${tripId}`",
  "router.push(`/gameday/${trip.id}`",
  "router.push(`/gameday/${tripId}`",
  "router.replace(`/gameday/${trip.id}`",
  "router.replace(`/gameday/${tripId}`",
];

const complianceBannedTokens = [
  "docsComplete",
  "missingDocsFields",
  "hasPassportPhoto",
  "member_passports",
  "passportsByUserId",
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

function scanFile(file, patterns) {
  const text = fs.readFileSync(file, "utf8");
  const lines = text.split("\n");
  const hits = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Skip comment lines (// and /* */)
    const trimmed = line.trim();
    if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) {
      continue;
    }
    
    // Check for patterns in non-comment lines
    for (const pat of patterns) {
      if (line.includes(pat)) {
        hits.push({ pattern: pat, line: i + 1 });
      }
    }
  }
  
  return hits;
}

// A) Trip groupId contract check
function checkTripGroupIdContract() {
  const tripActionsPath = path.join(SRC_DIR, "app", "lib", "tripActions.ts");
  if (!fs.existsSync(tripActionsPath)) {
    console.error(`DTO CONTRACT BREACH: Trip.groupId not preserved (tripActions.ts) - file not found`);
    return 1;
  }

  const content = fs.readFileSync(tripActionsPath, "utf8");
  let failures = 0;

  // Check Trip type includes groupId
  // Look for "export type Trip" followed by groupId within the type definition
  const tripTypeIndex = content.indexOf('export type Trip');
  if (tripTypeIndex === -1) {
    console.error(`DTO CONTRACT BREACH: Trip.groupId not preserved (tripActions.ts) - Trip type not found`);
    failures++;
  } else {
    // Extract a reasonable chunk after "export type Trip" to search for groupId
    const typeChunk = content.substring(tripTypeIndex, Math.min(tripTypeIndex + 2000, content.length));
    const hasTripTypeWithGroupId = /groupId/.test(typeChunk);
    if (!hasTripTypeWithGroupId) {
      console.error(`DTO CONTRACT BREACH: Trip.groupId not preserved (tripActions.ts) - Trip type missing groupId`);
      failures++;
    }
  }

  // Check normalizeTrip preserves groupId
  // Look for "function normalizeTrip" and ensure "groupId:" appears in the return object
  const normalizeTripMatch = content.match(/(?:function|const)\s+normalizeTrip\s*\([^)]*\)\s*:\s*Trip\s*\{/);
  if (!normalizeTripMatch) {
    // Try without return type annotation
    const normalizeTripMatchAlt = content.match(/(?:function|const)\s+normalizeTrip\s*\(/);
    if (!normalizeTripMatchAlt) {
      console.error(`DTO CONTRACT BREACH: Trip.groupId not preserved (tripActions.ts) - normalizeTrip() function not found`);
      failures++;
    } else {
      // Check if groupId: appears within 10000 characters after function start (should be enough)
      const normalizeTripIndex = normalizeTripMatchAlt.index;
      const functionChunk = content.substring(normalizeTripIndex, Math.min(normalizeTripIndex + 10000, content.length));
      const hasNormalizeTripGroupId = /groupId\s*:/.test(functionChunk);
      if (!hasNormalizeTripGroupId) {
        console.error(`DTO CONTRACT BREACH: Trip.groupId not preserved (tripActions.ts) - normalizeTrip() missing groupId assignment`);
        failures++;
      }
    }
  } else {
    // Function found with return type, check for groupId in return object
    const normalizeTripIndex = normalizeTripMatch.index;
    const functionChunk = content.substring(normalizeTripIndex, Math.min(normalizeTripIndex + 10000, content.length));
    const hasNormalizeTripGroupId = /groupId\s*:\s*\(t\s+as\s+any\)/.test(functionChunk);
    if (!hasNormalizeTripGroupId) {
      console.error(`DTO CONTRACT BREACH: Trip.groupId not preserved (tripActions.ts) - normalizeTrip() missing groupId assignment`);
      failures++;
    }
  }

  return failures;
}

// B) TripDetail compliance leakage check
function checkTripDetailCompliance() {
  const tripDetailPath = path.join(SRC_DIR, "app", "api", "trips", "[id]", "route.ts");
  if (!fs.existsSync(tripDetailPath)) {
    // File might not exist, skip check
    return 0;
  }

  const content = fs.readFileSync(tripDetailPath, "utf8");
  const lines = content.split("\n");
  let failures = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    // Skip comment lines
    if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) {
      continue;
    }

    for (const token of complianceBannedTokens) {
      if (line.includes(token)) {
        console.error(`${tripDetailPath}:${i + 1}: COMPLIANCE BREACH: TripDetail includes travel-doc derived fields (trips/[id]/route.ts) - found: ${token}`);
        failures++;
        break; // Only report once per line
      }
    }
  }

  return failures;
}

// C) Lifecycle illegal canonical check
function checkLifecycleIllegalCanonicals() {
  const lifecycleEnginePath = path.join(SRC_DIR, "app", "lib", "domain", "lifecycle", "lifecycleEngine.ts");
  const tripPhasePath = path.join(SRC_DIR, "app", "lib", "tripPhase.ts");
  let failures = 0;

  const filesToCheck = [];
  if (fs.existsSync(lifecycleEnginePath)) {
    filesToCheck.push(lifecycleEnginePath);
  }
  if (fs.existsSync(tripPhasePath)) {
    filesToCheck.push(tripPhasePath);
  }

  for (const filePath of filesToCheck) {
    const content = fs.readFileSync(filePath, "utf8");
    const lines = content.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      // Skip comment lines
      if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) {
        continue;
      }

      // Allow LEGACY constant definitions
      if (trimmed.includes('const LEGACY') || trimmed.includes('LEGACY =') || trimmed.includes('["scheduled","draft"]') || trimmed.includes('["draft","scheduled"]')) {
        continue;
      }

      // Allow warning strings that mention LEGACY
      if (trimmed.includes('"LEGACY') || trimmed.includes("'LEGACY") || trimmed.includes("LEGACY STATUS")) {
        continue;
      }

      // Check for illegal use of "scheduled" or "draft" in type definitions or assignments
      const hasIllegalScheduled = 
        /type.*["']scheduled["']/.test(line) ||
        /\|.*["']scheduled["']/.test(line) ||
        /state\s*=\s*["']scheduled["']/.test(line) ||
        /return\s+["']scheduled["']/.test(line) ||
        /phaseOverride.*["']scheduled["']/.test(line);

      const hasIllegalDraft = 
        /type.*["']draft["']/.test(line) ||
        /\|.*["']draft["']/.test(line) ||
        /state\s*=\s*["']draft["']/.test(line) ||
        /return\s+["']draft["']/.test(line);

      if (hasIllegalScheduled || hasIllegalDraft) {
        const status = hasIllegalScheduled ? "scheduled" : "draft";
        console.error(`${filePath}:${i + 1}: LIFECYCLE CONTRACT BREACH: illegal canonical status used (scheduled/draft) - found: ${status}`);
        failures++;
      }
    }
  }

  return failures;
}

const files = walk(SRC_DIR);
let failures = 0;

// Existing checks
for (const file of files) {
  const routeHits = scanFile(file, bannedRouteRefs);
  const gamedayHits = scanFile(file, riskyGameDayPatterns);

  for (const hit of routeHits) {
    console.error(`${file}:${hit.line}: banned reference: ${hit.pattern}`);
    failures++;
  }
  for (const hit of gamedayHits) {
    console.error(`${file}:${hit.line}: risky gameday construction: ${hit.pattern}`);
    failures++;
  }
}

// New contract checks
failures += checkTripGroupIdContract();
failures += checkTripDetailCompliance();
failures += checkLifecycleIllegalCanonicals();

if (failures > 0) {
  console.error(`Hardening audit failed: ${failures} issue(s).`);
  process.exit(1);
}

console.log("Hardening audit passed.");

/*
 * HARDENING AUDIT RULES DOCUMENTATION
 * 
 * This script enforces contract preservation and prevents incident-class regressions.
 * 
 * === EXISTING RULES ===
 * 
 * 1. Banned route references (/admin)
 *    - Protects against: Accidental admin route exposure
 *    - If fails: Remove or replace /admin references with proper admin mode toggle
 * 
 * 2. Risky GameDay route construction
 *    - Protects against: Broken GameDay navigation from template literal construction
 *    - If fails: Use proper route helpers or constants instead of template literals
 * 
 * === NEW CONTRACT RULES ===
 * 
 * 3. Trip groupId contract preservation (checkTripGroupIdContract)
 *    - Protects against: DTO contract breach where groupId is dropped during normalisation,
 *      causing role resolution to fail and BaseCamp access to be denied on hard refresh.
 *    - Checks:
 *      a) Trip type includes groupId field
 *      b) normalizeTrip() function preserves groupId from input
 *    - If fails:
 *      - Ensure Trip type includes: groupId?: string | null; group_id?: string | null;
 *      - Ensure normalizeTrip() assigns: groupId: (t as any).groupId ?? (t as any).group_id ?? null
 *      - See: docs/audits/post-incident-ddd-role-policy-phase-audit.md
 * 
 * 4. TripDetail compliance leakage (checkTripDetailCompliance)
 *    - Protects against: Compliance data (passport/travel-doc fields) leaking into public
 *      TripDetail DTO, violating privacy and compliance-safety rules.
 *    - Checks: trips/[id]/route.ts for banned tokens:
 *      - docsComplete, missingDocsFields, hasPassportPhoto
 *      - member_passports, passportsByUserId
 *    - If fails:
 *      - Remove compliance fields from TripDetail attendee mapping
 *      - Use separate /api/trips/[id]/compliance endpoint for organiser-only data
 *      - See: docs/v1.md "Compliance & Travel Documents" section
 * 
 * 5. Lifecycle illegal canonical status (checkLifecycleIllegalCanonicals)
 *    - Protects against: Reintroduction of deprecated statuses ("scheduled", "draft") as
 *      canonical values, causing phase vocabulary drift and breaking lifecycle derivation.
 *    - Checks: lifecycleEngine.ts and tripPhase.ts for illegal use of "scheduled" or "draft"
 *      outside LEGACY constant definitions or warning strings.
 *    - If fails:
 *      - Replace "scheduled" with "forming" in type definitions and return statements
 *      - Ensure "scheduled" and "draft" only appear in LEGACY constant arrays
 *      - See: docs/v1.md "Canonical Coordination Status Set" section
 * 
 * All rules exit with code 1 on violation to prevent builds with contract breaches.
 */
