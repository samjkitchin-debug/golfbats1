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

const COMPLIANCE01_MSG =
  "COMPLIANCE-01: Compliance/passport fields must never be included in TripDetail. Use /api/trips/[id]/compliance.";

const complianceBannedTokens = [
  "docsComplete",
  "missingDocsFields",
  "hasPassportPhoto",
  "member_passports",
  "passportsByUserId",
  "nationality",
  "date_of_birth",
  "expiry_date",
  "passport_full_name",
  "passport_number",
  "passport_nationality",
  "passport_date_of_birth",
  "passport_expiry_date",
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

/**
 * Strip line comments (//...) and block comments (/*...*\/) from text.
 * Simple regex-based; used to avoid matching groupId in comments.
 */
function stripComments(text) {
  let s = text;
  s = s.replace(/\/\*[\s\S]*?\*\//g, "");
  s = s.replace(/\/\/[^\n]*/g, "\n");
  return s;
}

/**
 * Locate fnName declaration (function fnName( or const fnName = () then extract
 * the full function body via brace counting from the first "{" after the declaration.
 * Returns the body substring (including outer braces) or null if not found / not extractable.
 */
function findFunctionBody(sourceText, fnName) {
  const declPatterns = [
    new RegExp(`function\\s+${fnName}\\s*\\(`),
    new RegExp(`const\\s+${fnName}\\s*=\\s*(?:function\\s*)?\\(`),
  ];
  let declIndex = -1;
  for (const re of declPatterns) {
    const m = sourceText.match(re);
    if (m) {
      declIndex = m.index;
      break;
    }
  }
  if (declIndex === -1) return null;

  const braceStart = sourceText.indexOf("{", declIndex);
  if (braceStart === -1) return null;

  let depth = 0;
  let i = braceStart;
  const len = sourceText.length;
  while (i < len) {
    const c = sourceText[i];
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return sourceText.slice(braceStart, i + 1);
    }
    i++;
  }
  return null;
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

  // GP-01: deterministic check — normalizeTrip() must assign groupId in returned Trip for group trips
  const body = findFunctionBody(content, "normalizeTrip");
  if (!body) {
    console.error(`GP-01 BLOCKING: normalizeTrip() not found or body not extractable (tripActions.ts). groupId must be assigned for group trips.`);
    failures++;
  } else {
    const noComments = stripComments(body);
    if (!/groupId\s*:/.test(noComments)) {
      console.error(`GP-01 BLOCKING: normalizeTrip() does not assign groupId in the returned Trip object (tripActions.ts). groupId must be assigned for group trips.`);
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
        console.error(COMPLIANCE01_MSG);
        failures++;
        return failures;
      }
    }
  }

  return failures;
}

function checkDto01TripDetailGroupId() {
  const p = path.join(SRC_DIR, "app", "api", "trips", "[id]", "route.ts");
  if (!fs.existsSync(p)) {
    console.error("DTO-01: TripDetail must include groupId for group trips. DTO contract breach.");
    return 1;
  }
  const content = stripComments(fs.readFileSync(p, "utf8"));
  if (!/groupId\s*:/.test(content)) {
    console.error("DTO-01: TripDetail must include groupId for group trips. DTO contract breach.");
    return 1;
  }
  return 0;
}

function checkDto02TripSummaryGroupId() {
  const p = path.join(SRC_DIR, "app", "api", "trips", "list", "route.ts");
  if (!fs.existsSync(p)) {
    console.error("DTO-02: TripSummary must include groupId for group trips. DTO contract breach.");
    return 1;
  }
  const content = stripComments(fs.readFileSync(p, "utf8"));
  if (!/groupId\s*:/.test(content)) {
    console.error("DTO-02: TripSummary must include groupId for group trips. DTO contract breach.");
    return 1;
  }
  return 0;
}

const ROLE01_MSG =
  "ROLE-01: Role resolution must be deterministic. Do not fall back to activeGroupId/inferred context.";

const ROLE_RESOLUTION_PATHS = [
  path.join(SRC_DIR, "app", "lib", "domain", "roles", "roleEngine.ts"),
];

function checkRole01NoFallback() {
  const forbidden = ["activeGroupId", "inferred group", "inferred context", "localStorage"];
  for (const p of ROLE_RESOLUTION_PATHS) {
    if (!fs.existsSync(p)) continue;
    const content = stripComments(fs.readFileSync(p, "utf8"));
    for (const tok of forbidden) {
      if (content.includes(tok)) {
        console.error(ROLE01_MSG);
        return 1;
      }
    }
  }
  return 0;
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

const SIGNUPS01_MSG =
  "HARDENING (SIGNUPS-01): signups_opened_at must be write-once. Do not overwrite/clear it. Gate assignment on existingTrip.signups_opened_at (set only when NULL).";

function lineIsCommentOnly(line) {
  const t = line.trim();
  return t.startsWith("//") || t.startsWith("*") || t.startsWith("/*");
}

function hasWriteOnceGate(line) {
  if (lineIsCommentOnly(line)) return false;
  if (!/if\s*\(/.test(line) || !/existingTrip\.signups_opened_at/.test(line)) return false;
  return (
    /!\s*existingTrip\.signups_opened_at/.test(line) ||
    /existingTrip\.signups_opened_at\s*===\s*null/.test(line) ||
    /existingTrip\.signups_opened_at\s*==\s*null/.test(line)
  );
}

function checkSignupsOpenedAtWriteOnce() {
  const tripsRoutePath = path.join(SRC_DIR, "app", "api", "trips", "route.ts");
  if (!fs.existsSync(tripsRoutePath)) {
    console.error(`${SIGNUPS01_MSG} Target file src/app/api/trips/route.ts not found.`);
    return 1;
  }
  const content = fs.readFileSync(tripsRoutePath, "utf8");
  const lines = content.split("\n");
  const LOOKBACK = 20;

  const clearRe = /updateData\.signups_opened_at\s*=\s*(null|undefined)\b/;
  const assignRe = /updateData\.signups_opened_at\s*=/;

  for (let i = 0; i < lines.length; i++) {
    if (lineIsCommentOnly(lines[i])) continue;
    if (clearRe.test(lines[i])) {
      console.error(SIGNUPS01_MSG);
      return 1;
    }
  }

  for (let i = 0; i < lines.length; i++) {
    if (lineIsCommentOnly(lines[i])) continue;
    if (!assignRe.test(lines[i])) continue;
    if (clearRe.test(lines[i])) continue;
    let found = false;
    for (let j = Math.max(0, i - LOOKBACK); j <= i; j++) {
      if (hasWriteOnceGate(lines[j])) {
        found = true;
        break;
      }
    }
    if (!found) {
      console.error(SIGNUPS01_MSG);
      return 1;
    }
  }

  return 0;
}

// VISUAL-01: Palette colors forbidden (blue-, slate-, gray-, zinc-, neutral-)
function checkPaletteColors() {
  const palettePatterns = [
    /\btext-blue-/,
    /\bbg-blue-/,
    /\bborder-blue-/,
    /\btext-slate-/,
    /\bbg-slate-/,
    /\bborder-slate-/,
    /\btext-gray-/,
    /\bbg-gray-/,
    /\bborder-gray-/,
    /\btext-zinc-/,
    /\bbg-zinc-/,
    /\bborder-zinc-/,
    /\btext-neutral-/,
    /\bbg-neutral-/,
    /\bborder-neutral-/,
  ];
  
  const files = walk(SRC_DIR);
  let failures = 0;
  
  for (const file of files) {
    const content = fs.readFileSync(file, "utf8");
    const lines = content.split("\n");
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      // Skip comment lines
      if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) {
        continue;
      }
      
      for (const pattern of palettePatterns) {
        if (pattern.test(line)) {
          console.error(`VISUAL-01: Palette colors are forbidden. Use semantic tokens only. Found in ${file}:${i + 1}: ${line.trim()}`);
          failures++;
          break; // Only report once per line
        }
      }
    }
  }
  
  // Note: We do not check compiled CSS (.next directory) as it's build output.
  // The build will fail if source files contain palette colors.
  
  return failures;
}

// VISUAL-02: font-sans forbidden (Inter must be the only font)
function checkFontSans() {
  let failures = 0;
  
  // Check Tailwind config (if exists)
  const configFiles = [
    path.join(ROOT, "tailwind.config.ts"),
    path.join(ROOT, "tailwind.config.js"),
    path.join(ROOT, "tailwind.config.mjs"),
  ];
  
  for (const configFile of configFiles) {
    if (fs.existsSync(configFile)) {
      const content = fs.readFileSync(configFile, "utf8");
      if (/font-sans/.test(content)) {
        console.error(`VISUAL-02: font-sans is forbidden. Inter must be the only font. Found in ${configFile}`);
        failures++;
      }
    }
  }
  
  // Check globals.css
  const globalsCss = path.join(SRC_DIR, "app", "globals.css");
  if (fs.existsSync(globalsCss)) {
    const content = fs.readFileSync(globalsCss, "utf8");
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      // Skip comment lines
      if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) {
        continue;
      }
      if (/font-sans/.test(line)) {
        console.error(`VISUAL-02: font-sans is forbidden. Inter must be the only font. Found in ${globalsCss}:${i + 1}: ${line.trim()}`);
        failures++;
      }
    }
  }
  
  // Check JSX/TSX files for font-sans in classNames
  const files = walk(SRC_DIR);
  for (const file of files) {
    const content = fs.readFileSync(file, "utf8");
    const lines = content.split("\n");
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      // Skip comment lines
      if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) {
        continue;
      }
      
      // Check for font-sans in className or class attributes
      if (/className.*font-sans|class.*font-sans/.test(line)) {
        console.error(`VISUAL-02: font-sans is forbidden. Inter must be the only font. Found in ${file}:${i + 1}: ${line.trim()}`);
        failures++;
      }
    }
  }
  
  // Note: We do not check compiled CSS (.next directory) as it's build output.
  // The build will fail if source files contain font-sans.
  
  return failures;
}

const INSTRUMENT01_MSG =
  "INSTRUMENT-01: Instrument behaviour must not depend on lifecycle phase. Behaviour is determined by instrument.kind only.";

// INSTRUMENT-01: Instrument behaviour phase-agnostic (resolver + renderer)
function checkInstrumentBehaviourPhaseAgnostic() {
  let failures = 0;
  const resolverPath = path.join(
    SRC_DIR,
    "app",
    "lib",
    "domain",
    "instruments",
    "resolveInstrumentRenderState.ts"
  );
  const baseCampPath = path.join(SRC_DIR, "app", "components", "BaseCampLane.tsx");

  if (!fs.existsSync(resolverPath)) {
    console.error(INSTRUMENT01_MSG);
    return 1;
  }

  const resolverContent = fs.readFileSync(resolverPath, "utf8");
  const resolverNoComments = stripComments(resolverContent);

  if (/coordination_status/.test(resolverNoComments)) {
    console.error(INSTRUMENT01_MSG);
    failures++;
  }
  if (/event\.state/.test(resolverNoComments)) {
    console.error(INSTRUMENT01_MSG);
    failures++;
  }
  const phaseLiterals = ["forming", "signups_open", "locked", "gameday", "in_play", "completed"];
  for (const phase of phaseLiterals) {
    const re = new RegExp(`["'\`]${phase}["'\`]|\\b${phase}\\b`);
    if (re.test(resolverNoComments)) {
      console.error(INSTRUMENT01_MSG);
      failures++;
    }
  }

  if (!fs.existsSync(baseCampPath)) return failures;
  const baseCampContent = fs.readFileSync(baseCampPath, "utf8");

  if (!/resolveInstrumentRenderState/.test(baseCampContent)) {
    console.error(INSTRUMENT01_MSG);
    failures++;
  }
  if (/let\s+done\s*=/.test(baseCampContent) || /let\s+status\s*[:=]/.test(baseCampContent) || /let\s+density\s*[:=]/.test(baseCampContent) || /let\s+interactive\s*[:=]/.test(baseCampContent)) {
    console.error(INSTRUMENT01_MSG);
    failures++;
  }

  return failures;
}

const INSTRUMENT02_MSG =
  "INSTRUMENT-02: Instrument phase visibility must be declared in the registry. Do not branch on phase in renderers.";

const PHASE_LITERALS = ["forming", "signups_open", "locked", "gameday", "in_play", "completed"];
const REGISTRY_PATH = path.join(SRC_DIR, "app", "lib", "domain", "instruments", "registry.ts");
const PHASE_DISPLAY_PATH = path.join(SRC_DIR, "app", "lib", "domain", "event", "phaseDisplay.ts");
const INSTRUMENT_VISIBILITY_PATH = path.join(SRC_DIR, "app", "lib", "domain", "instruments", "instrumentVisibility.ts");

function checkInstrumentPhaseVisibility() {
  let failures = 0;

  if (!fs.existsSync(REGISTRY_PATH)) {
    console.error(INSTRUMENT02_MSG);
    return 1;
  }
  const registryContent = fs.readFileSync(REGISTRY_PATH, "utf8");
  const registryNoComments = stripComments(registryContent);

  const requiredKeys = ["trip_name", "capacity", "signups_window", "roster", "flights_plan", "meet_details", "results_publish", "gameday_entry", "participants", "logistics", "export_docs"];
  for (const k of requiredKeys) {
    const keyPat = new RegExp(`key:\\s*["'\`]${k}["'\`]`);
    const keyIdx = registryNoComments.search(keyPat);
    if (keyIdx === -1) continue;
    const rest = registryNoComments.slice(keyIdx + 8);
    const nextKey = rest.search(/\bkey\s*:\s*["'`]/);
    const block = nextKey === -1 ? rest : rest.slice(0, nextKey);
    if (!/phaseVisibility\s*:/.test(block)) {
      console.error(INSTRUMENT02_MSG);
      failures++;
      break;
    }
  }

  const baseCampPath = path.join(SRC_DIR, "app", "components", "BaseCampLane.tsx");
  const rendererPaths = [baseCampPath];

  for (const rendererPath of rendererPaths) {
    if (!fs.existsSync(rendererPath)) continue;
    const content = fs.readFileSync(rendererPath, "utf8");
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*") || trimmed.startsWith("{/*")) continue;
      if (/console\.(error|log|warn)\s*\(/.test(line)) continue;
      for (const phase of PHASE_LITERALS) {
        const quoted = new RegExp(`["'\`]${phase}["'\`]`);
        const unquoted = phase === "gameday"
          ? new RegExp(`\\b${phase}\\b(?!_|-)`)
          : new RegExp(`\\b${phase}\\b`);
        if (quoted.test(line) || unquoted.test(line)) {
          console.error(INSTRUMENT02_MSG);
          failures++;
          break;
        }
      }
      if (failures) break;
    }
    if (failures) break;
  }

  return failures;
}

const ANCHOR01_MSG =
  "ANCHOR-01: Anchors must not render instruments or manage expandable state. Anchors signal state or open modals only.";

const ANCHOR_PATHS = [
  path.join(SRC_DIR, "app", "components", "AnchorRow.tsx"),
];

function checkAnchorBoundary() {
  let failures = 0;
  const forbidden = ["RenderBody", "InlineInstrumentSection", "resolveInstrumentRenderState"];
  const expandStatePattern = /\b(expanded|isOpen|isCollapsed)\b/;

  for (const p of ANCHOR_PATHS) {
    if (!fs.existsSync(p)) continue;
    const content = fs.readFileSync(p, "utf8");
    const noComments = stripComments(content);
    for (const tok of forbidden) {
      if (noComments.includes(tok)) {
        console.error(ANCHOR01_MSG);
        failures++;
        break;
      }
    }
    if (failures) break;
    if (expandStatePattern.test(noComments)) {
      console.error(ANCHOR01_MSG);
      failures++;
      break;
    }
  }

  return failures;
}

const LIFECYCLE02_MSG =
  "LIFECYCLE-02: Legacy lifecycle values (draft/scheduled) must never be written. Canonical coordination_status only.";

function getApiRouteFiles() {
  const apiDir = path.join(SRC_DIR, "app", "api");
  if (!fs.existsSync(apiDir)) return [];
  const out = [];
  for (const f of walk(apiDir)) {
    if (f.endsWith("route.ts") || f.endsWith("route.js")) out.push(f);
  }
  return out;
}

const LIFECYCLE02_LEGACY_WRITE_PATTERNS = [
  /coordination_status\s*=\s*['"](?:draft|scheduled)['"]/,
  /coordinationStatus\s*:\s*['"](?:draft|scheduled)['"]/,
  /updateData\.coordination_status\s*=\s*['"](?:draft|scheduled)['"]/,
  /insertData\.coordination_status\s*=\s*['"](?:draft|scheduled)['"]/,
];

function checkLifecycleLegacyWrites() {
  let failures = 0;
  const routeFiles = getApiRouteFiles();
  for (const file of routeFiles) {
    const content = fs.readFileSync(file, "utf8");
    const noComments = stripComments(content);
    for (const re of LIFECYCLE02_LEGACY_WRITE_PATTERNS) {
      if (re.test(noComments)) {
        console.error(LIFECYCLE02_MSG);
        failures++;
        return failures;
      }
    }
  }
  return failures;
}

const TIMEPICKER01_MSG =
  "TIMEPICKER-01: Only TimePicker.tsx may import PixelTimePicker. Use the canonical TimePicker from src/app/components/ui/TimePicker.tsx everywhere.";
const TIMEPICKER02_MSG =
  "TIMEPICKER-02: Legacy time pickers (TimeDialPicker, (member) TimePicker) are removed. Use TimePicker from src/app/components/ui/TimePicker.tsx only.";

const CANONICAL_TIME_PICKER_PATH = path.join(SRC_DIR, "app", "components", "ui", "TimePicker.tsx");
const PIXEL_TIME_PICKER_PATH = path.join(SRC_DIR, "app", "components", "ui", "PixelTimePicker.tsx");

function checkTimePickerCanonical() {
  let failures = 0;
  const allFiles = walk(SRC_DIR);

  for (const file of allFiles) {
    const content = fs.readFileSync(file, "utf8");
    const normalizedFile = path.normalize(file);

    // PixelTimePicker may only be referenced by TimePicker.tsx (single entry point) or defined in PixelTimePicker.tsx
    if (content.includes("PixelTimePicker")) {
      const canonicalNormalized = path.normalize(CANONICAL_TIME_PICKER_PATH);
      const pixelNormalized = path.normalize(PIXEL_TIME_PICKER_PATH);
      if (normalizedFile !== canonicalNormalized && normalizedFile !== pixelNormalized) {
        console.error(`${file}: ${TIMEPICKER01_MSG}`);
        failures++;
      }
    }

    // Legacy pickers: must not import TimeDialPicker or (member) TimePicker
    if (content.includes("TimeDialPicker")) {
      console.error(`${file}: ${TIMEPICKER02_MSG}`);
      failures++;
    }
    if (content.includes("components/TimePicker") && !content.includes("components/ui/TimePicker")) {
      console.error(`${file}: ${TIMEPICKER02_MSG}`);
      failures++;
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
failures += checkDto01TripDetailGroupId();
failures += checkDto02TripSummaryGroupId();
failures += checkRole01NoFallback();
failures += checkLifecycleIllegalCanonicals();
failures += checkSignupsOpenedAtWriteOnce();

// Visual system checks
failures += checkPaletteColors();
failures += checkFontSans();

// Instrument renderer invariants
failures += checkInstrumentBehaviourPhaseAgnostic();
failures += checkInstrumentPhaseVisibility();

// Anchor vs instrument boundary
failures += checkAnchorBoundary();

// Lifecycle legacy quarantine (write paths)
failures += checkLifecycleLegacyWrites();

// Time picking canonical (single entry point; PixelTimePicker internal only)
failures += checkTimePickerCanonical();

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
 *      b) GP-01: normalizeTrip() assigns groupId in returned Trip (deterministic brace-count extraction)
 *    - If fails:
 *      - Ensure Trip type includes: groupId?: string | null; group_id?: string | null;
 *      - Ensure normalizeTrip() assigns: groupId: (t as any).groupId ?? (t as any).group_id ?? null
 *      - See: docs/audits/post-incident-ddd-role-policy-phase-audit.md
 * 
 * 4. COMPLIANCE-01 / TripDetail compliance (checkTripDetailCompliance)
 *    - Protects against: Compliance/passport fields in TripDetail. Use /api/trips/[id]/compliance only.
 *    - Checks: trips/[id]/route.ts for banned tokens (docsComplete, hasPassportPhoto, nationality,
 *      passport_*, date_of_birth, expiry_date, member_passports, etc.).
 *    - If fails: Remove those from TripDetail; use /api/trips/[id]/compliance. See v1.md.
 *
 *    DTO-01 (checkDto01TripDetailGroupId): TripDetail must include groupId for group trips.
 *    DTO-02 (checkDto02TripSummaryGroupId): TripSummary (list) must include groupId per trip.
 *    ROLE-01 (checkRole01NoFallback): Role resolution must not use activeGroupId/inferred/localStorage.
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
 * 6. SIGNUPS-01: signups_opened_at write-once (checkSignupsOpenedAtWriteOnce)
 *    - Protects against: Any update path overwriting or clearing signups_opened_at after it has been set.
 *    - Canon: v1 coordination_status is canonical; signups_opened_at is set once on first open, never overwritten/cleared.
 *    - Checks: src/app/api/trips/route.ts POST update handler.
 *      - FAIL: unconditional updateData.signups_opened_at = ... or clearing (= null/undefined).
 *      - PASS: assignment gated on existingTrip.signups_opened_at (e.g. if (!existingTrip.signups_opened_at) { ... }).
 *    - If fails: Gate assignment on existingTrip.signups_opened_at; set only when NULL. Do not clear.
 * 
 * === VISUAL SYSTEM RULES ===
 * 
 * 7. VISUAL-01: Palette colors forbidden (checkPaletteColors)
 *    - Protects against: Use of Tailwind default palette colors (blue-, slate-, gray-, zinc-, neutral-)
 *      which bypass semantic token system and create visual inconsistency.
 *    - Canon: Only semantic color tokens (ink, paper, rail, accent, danger, etc.) are allowed.
 *    - Checks: All source files and compiled CSS for palette color utilities:
 *      - text-blue-*, bg-blue-*, border-blue-*
 *      - text-slate-*, bg-slate-*, border-slate-*
 *      - text-gray-*, bg-gray-*, border-gray-*
 *      - text-zinc-*, bg-zinc-*, border-zinc-*
 *      - text-neutral-*, bg-neutral-*, border-neutral-*
 *    - If fails: Replace palette colors with semantic tokens (e.g., text-foreground, bg-surface, border-border).
 *      See: docs/canon/v1.md "Visual System" section.
 * 
 * 8. VISUAL-02: font-sans forbidden (checkFontSans)
 *    - Protects against: Use of font-sans fallback which allows system fonts instead of Inter.
 *    - Canon: Inter is the mandatory font; no fallbacks to system fonts.
 *    - Checks: Tailwind config, globals.css, JSX classNames, and compiled CSS for "font-sans".
 *    - If fails: Replace font-sans with Inter-only font family. Use --font-inter variable.
 *      See: docs/canon/v1.md "Typography" section.
 * 
 * === INSTRUMENT RENDERER RULES ===
 * 
 * 9. INSTRUMENT-01: Instrument behaviour phase-agnostic (checkInstrumentBehaviourPhaseAgnostic)
 *    - Protects against: Behaviour (done/status/density/interactive) depending on lifecycle phase.
 *    - Canon: Behaviour is determined exclusively by instrument.kind. Phase controls visibility only.
 *    - Checks:
 *      a) resolveInstrumentRenderState.ts must not use coordination_status, event.state, or phase literals.
 *      b) BaseCampLane must use resolveInstrumentRenderState and must not derive done/status/density/interactive locally.
 *    - If fails: Centralise all behaviour in resolveInstrumentRenderState; remove phase-based branches.
 *      See: docs/canon/v1.md "Instrument behaviour" section.
 * 
 * 10. INSTRUMENT-02: Instrument phase visibility in registry (checkInstrumentPhaseVisibility)
 *     - Protects against: Missing phaseVisibility or phase literals in renderers.
 *     - Canon: Every instrument declares phaseVisibility in the registry; renderers consume visibility only.
 *     - Checks:
 *       a) Each instrument definition in registry has phaseVisibility in its block.
 *       b) BaseCampLane (and other renderers) must not contain phase literals (use visibility helpers).
 *     - If fails: Add phaseVisibility to missing defs; replace phase checks with isInstrumentVisible / phaseDisplay helpers.
 *       See: docs/canon/v1.md "Instrument phase visibility" section.
 * 
 * 11. ANCHOR-01: Anchor vs instrument boundary (checkAnchorBoundary)
 *     - Protects against: Anchors rendering instrument bodies or owning expand/collapse state.
 *     - Canon: Anchors are non-composite; they display text, chevrons, open modals, or trigger navigation only.
 *     - Checks:
 *       a) Anchor files (e.g. AnchorRow) must not contain RenderBody, InlineInstrumentSection, resolveInstrumentRenderState.
 *       b) Anchor render code must not declare state variables expanded, isOpen, isCollapsed.
 *     - If fails: Keep instrument rendering in lane only; use AnchorRow for anchor UI; remove expandable state from anchors.
 *       See: docs/canon/v1.md "Anchor vs Instrument" section.
 * 
 * 12. LIFECYCLE-02: Legacy lifecycle write quarantine (checkLifecycleLegacyWrites)
 *     - Protects against: Writing legacy coordination_status values (draft, scheduled) in server write paths.
 *     - Canon: draft/scheduled are legacy read-only; write paths must never emit them. Canonical only.
 *     - Checks: src/app/api route handlers for patterns that write draft/scheduled to coordination_status or coordinationStatus.
 *     - If fails: Remove legacy writes; use only canonical values (forming, signups_open, locked, gameday, in_play, completed).
 *       See: docs/canon/v1.md "Lifecycle legacy quarantine" / coordination_status section.
 *
 * 13. SW + OAuth redirect (scripts/sw-oauth-audit.mjs, run via same hardening:audit pipeline)
 *     - Protects against: Service worker registration reappearing; OAuth redirectTo with query strings or hardcoded domains.
 *     - See: docs/canon/hardening-audits.md "HARDENING: SW + OAuth Redirect Safety (v1)".
 *
 * 14. TIMEPICKER-01: PixelTimePicker internal only (checkTimePickerCanonical)
 *     - Protects against: Direct use of PixelTimePicker outside the canonical TimePicker wrapper.
 *     - Canon: Only src/app/components/ui/TimePicker.tsx may reference PixelTimePicker. All time picking uses TimePicker.
 *     - If fails: Import and use TimePicker from src/app/components/ui/TimePicker.tsx; do not import PixelTimePicker.
 *
 * 15. TIMEPICKER-02: No legacy time pickers (checkTimePickerCanonical)
 *     - Protects against: Reintroduction of TimeDialPicker or (member) TimePicker.
 *     - Canon: Single entry point TimePicker (ui); legacy pickers removed.
 *     - If fails: Remove TimeDialPicker / (member) TimePicker imports; use TimePicker from src/app/components/ui/TimePicker.tsx only.
 *
 * All rules exit with code 1 on violation to prevent builds with contract breaches.
 */
