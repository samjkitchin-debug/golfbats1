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

const files = walk(SRC_DIR);
let failures = 0;

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

if (failures > 0) {
  console.error(`Hardening audit failed: ${failures} issue(s).`);
  process.exit(1);
}

console.log("Hardening audit passed.");
