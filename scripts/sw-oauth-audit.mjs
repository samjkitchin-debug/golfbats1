/**
 * SW + OAuth redirect hardening audit.
 * Prevents (1) service worker registration/scripts in v1, (2) OAuth redirectTo with query strings or hardcoded domains.
 * See docs/canon/hardening-audits.md. Runs as part of npm run hardening:audit → prebuild.
 */

import fs from "fs";
import path from "path";

const ROOT = process.cwd();
const SRC = path.join(ROOT, "src");
const PUBLIC = path.join(ROOT, "public");
const SKIP_DIRS = new Set(["node_modules", ".next", "dist", "build"]);
const SW_CLEANUP = path.normalize(path.join(ROOT, "src", "app", "components", "ServiceWorkerCleanup.tsx"));

let failures = 0;

function walk(dir, extFilter = null) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (!SKIP_DIRS.has(ent.name)) out.push(...walk(p, extFilter));
    } else if (ent.isFile()) {
      if (!extFilter || extFilter.some((e) => p.endsWith(e))) out.push(p);
    }
  }
  return out;
}

function relative(file) {
  return path.relative(ROOT, file).replace(/\\/g, "/");
}

function isSwCleanup(file) {
  return path.normalize(file) === SW_CLEANUP;
}

// --- Service Worker checks ---

function checkSwRegisterAndFiles() {
  const heading = "Service Worker registration / scripts";
  const hits = [];

  const srcFiles = walk(SRC, [".ts", ".tsx", ".js", ".mjs", ".jsx"]);
  const publicFiles = walk(PUBLIC, [".js", ".mjs", ".ts", ".html", ".json"]);

  for (const file of srcFiles) {
    const text = fs.readFileSync(file, "utf8");
    const lines = text.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) continue;

      if (line.includes("navigator.serviceWorker.register") || line.includes("register('/sw.js'") || line.includes('register("/sw.js"')) {
        hits.push({ file, line: i + 1, excerpt: line.trim(), rule: "register" });
      }
      if (line.includes("next-pwa") || line.includes("workbox")) {
        hits.push({ file, line: i + 1, excerpt: line.trim(), rule: "next-pwa/workbox" });
      }
      if (!isSwCleanup(file)) {
        if (line.includes("navigator.serviceWorker.getRegistrations") || line.includes(".unregister(")) {
          hits.push({ file, line: i + 1, excerpt: line.trim(), rule: "getRegistrations/unregister outside ServiceWorkerCleanup" });
        }
      }
    }
  }

  for (const file of publicFiles) {
    const text = fs.readFileSync(file, "utf8");
    const lines = text.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.includes("navigator.serviceWorker.register") || line.includes("register('/sw.js'") || line.includes('register("/sw.js"') || line.includes("next-pwa") || line.includes("workbox")) {
        hits.push({ file, line: i + 1, excerpt: line.trim(), rule: "SW register / next-pwa / workbox in public" });
      }
    }
  }

  if (hits.length > 0) {
    console.error("\n=== " + heading + " ===\n");
    for (const { file, line, excerpt, rule } of hits) {
      console.error(`  ${relative(file)}:${line}  [${rule}]`);
      console.error(`    ${excerpt.slice(0, 100)}${excerpt.length > 100 ? "…" : ""}`);
      failures++;
    }
    console.error("\n  Fix: Remove SW registration; do not use next-pwa/workbox. getRegistrations/unregister only in ServiceWorkerCleanup.tsx.\n");
  }
}

function checkPublicSwJs() {
  const swPaths = [
    path.join(PUBLIC, "sw.js"),
    ...walk(PUBLIC).filter((p) => path.basename(p) === "sw.js"),
  ];
  const found = swPaths.filter((p) => fs.existsSync(p));
  if (found.length > 0) {
    console.error("\n=== Forbidden public/sw.js (or public/**/sw.js) ===\n");
    for (const p of found) {
      console.error(`  ${relative(p)}`);
      failures++;
    }
    console.error("\n  Fix: Delete public/sw.js and any public/**/sw.js. No service worker in v1.\n");
  }
}

function checkNextConfigPwa() {
  const names = ["next.config.ts", "next.config.js", "next.config.mjs"];
  for (const name of names) {
    const p = path.join(ROOT, name);
    if (!fs.existsSync(p)) continue;
    const text = fs.readFileSync(p, "utf8");
    if (/pwa\s*[:=]|@ducanh2912\/next-pwa|next-pwa|withPWA|PWAPlugin|workbox/i.test(text)) {
      console.error("\n=== Next config PWA / plugin ===\n");
      console.error(`  ${relative(p)}`);
      console.error("\n  Fix: Remove pwa config and PWA plugin. No service worker in v1.\n");
      failures++;
      break;
    }
  }
}

function checkPackageJsonPwa() {
  const p = path.join(ROOT, "package.json");
  const json = JSON.parse(fs.readFileSync(p, "utf8"));
  const deps = { ...json.dependencies, ...(json.devDependencies || {}) };
  const has = Object.keys(deps).some((k) => /next-pwa|workbox/i.test(k));
  if (has) {
    console.error("\n=== next-pwa / Workbox in package.json ===\n");
    console.error(`  ${relative(p)}`);
    console.error("\n  Fix: Remove next-pwa and Workbox deps. No service worker in v1.\n");
    failures++;
  }
}

// --- OAuth redirectTo checks ---

function checkRedirectTo() {
  const heading = "redirectTo: must be origin-derived and queryless";
  const hits = [];
  const srcFiles = walk(SRC, [".ts", ".tsx", ".js", ".mjs", ".jsx"]);

  for (const file of srcFiles) {
    const text = fs.readFileSync(file, "utf8");
    const lines = text.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) continue;

      if (!line.includes("redirectTo")) continue;
      const isDef = /redirectTo\s*[:=]/.test(line);
      if (!isDef) continue;

      const window = lines.slice(i, Math.min(i + 3, lines.length)).join(" ");
      const hasOrigin = /location\.origin|window\.location\.origin/.test(window);
      const hasQuery = /\?|&(?!&)/.test(window);
      const hasDayforeit = /dayforeit\./i.test(window);

      if (!hasOrigin) {
        hits.push({ file, line: i + 1, excerpt: line.trim(), rule: "redirectTo not origin-derived" });
      }
      if (hasQuery) {
        hits.push({ file, line: i + 1, excerpt: line.trim(), rule: "redirectTo contains ? or &" });
      }
      if (hasDayforeit) {
        hits.push({ file, line: i + 1, excerpt: line.trim(), rule: "redirectTo contains hardcoded dayforeit." });
      }
    }
  }

  if (hits.length > 0) {
    console.error("\n=== " + heading + " ===\n");
    const seen = new Set();
    for (const { file, line, excerpt, rule } of hits) {
      const key = `${file}:${line}:${rule}`;
      if (seen.has(key)) continue;
      seen.add(key);
      console.error(`  ${relative(file)}:${line}  [${rule}]`);
      console.error(`    ${excerpt.slice(0, 100)}${excerpt.length > 100 ? "…" : ""}`);
      failures++;
    }
    console.error('\n  Fix: Use `${window.location.origin}/auth/callback` or `${window.location.origin}/reset-password` (no query, no hardcoded domains).\n');
  }
}

// --- Run ---

console.log("SW + OAuth redirect audit …");

checkSwRegisterAndFiles();
checkPublicSwJs();
checkNextConfigPwa();
checkPackageJsonPwa();
checkRedirectTo();

if (failures > 0) {
  console.error(`SW + OAuth audit failed: ${failures} issue(s).`);
  process.exit(1);
}

console.log("SW + OAuth audit passed.");
