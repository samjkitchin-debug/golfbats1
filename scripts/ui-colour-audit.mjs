#!/usr/bin/env node

/**
 * UI Colour Audit Script
 * 
 * Scans src/ directory for hard-coded colors that should be replaced
 * with design tokens from globals.css.
 * 
 * Usage:
 *   node scripts/ui-colour-audit.mjs
 * 
 * Exits with code 1 if any violations are found.
 */

import { readdir, readFile, stat } from "fs/promises";
import { join, relative } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, "..");

// Patterns to match hard-coded colors
const colorPatterns = [
  // Inline styles with color/background (excluding CSS variable references)
  /style\s*=\s*["'][^"']*(?:color|background)[^"']*["']/gi,
  // Hex colors (#rgb, #rrggbb, #rrggbbaa) - but not in comments
  /#[0-9a-fA-F]{3,8}\b/g,
  // rgb() or rgba() with hard-coded values (not CSS vars)
  // Exclude rgb(var(...)) and rgba(var(...))
  /\brgba?\((?!var\([^)]*\))[^)]+\)/g,
];

// Files/directories to ignore
const ignoredPaths = [
  "src/app/globals.css",
  "docs/",
];

/**
 * Check if a file path should be ignored
 */
function shouldIgnore(filePath) {
  const relativePath = relative(projectRoot, filePath).replace(/\\/g, "/");
  return ignoredPaths.some((ignored) => {
    if (ignored.endsWith("/")) {
      return relativePath.startsWith(ignored) || relativePath.includes("/" + ignored);
    }
    return relativePath === ignored || relativePath.includes("/" + ignored);
  });
}

/**
 * Check if a file is a text file we should scan
 */
function shouldScanFile(filePath) {
  const ext = filePath.split(".").pop()?.toLowerCase();
  // Scan TypeScript, JavaScript, TSX, JSX, CSS files
  return ["ts", "tsx", "js", "jsx", "css", "scss", "sass"].includes(ext);
}

/**
 * Scan a file for color violations
 */
async function scanFile(filePath) {
  try {
    const content = await readFile(filePath, "utf-8");
    const lines = content.split("\n");
    const violations = [];

    lines.forEach((line, index) => {
      colorPatterns.forEach((pattern) => {
        const matches = line.matchAll(pattern);
        for (const match of matches) {
          // Skip if this is in a comment
          const lineBeforeMatch = line.substring(0, match.index);
          const commentMatch = lineBeforeMatch.match(/(\/\/.*|\/\*.*\*\/)$/);
          if (commentMatch) continue;

          // Skip CSS variable definitions in globals.css (legitimate token definitions)
          const matchText = match[0];
          if (matchText.includes("var(--")) continue;

          violations.push({
            lineNumber: index + 1,
            line: line.trim(),
            match: matchText,
          });
        }
      });
    });

    return violations;
  } catch (error) {
    console.error(`Error reading file ${filePath}:`, error.message);
    return [];
  }
}

/**
 * Recursively scan a directory
 */
async function scanDirectory(dirPath) {
  const allViolations = [];

  try {
    const entries = await readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dirPath, entry.name);

      // Skip ignored paths
      if (shouldIgnore(fullPath)) {
        continue;
      }

      if (entry.isDirectory()) {
        const subViolations = await scanDirectory(fullPath);
        allViolations.push(...subViolations);
      } else if (entry.isFile() && shouldScanFile(fullPath)) {
        const violations = await scanFile(fullPath);
        if (violations.length > 0) {
          allViolations.push({
            file: relative(projectRoot, fullPath),
            violations,
          });
        }
      }
    }
  } catch (error) {
    console.error(`Error scanning directory ${dirPath}:`, error.message);
  }

  return allViolations;
}

/**
 * Main function
 */
async function main() {
  console.log("🔍 Scanning src/ for hard-coded colors...\n");

  const srcDir = join(projectRoot, "src");
  const violations = await scanDirectory(srcDir);

  if (violations.length === 0) {
    console.log("✅ No color violations found. All colors use design tokens!");
    process.exit(0);
  }

  console.log(`❌ Found ${violations.length} file(s) with color violations:\n`);

  violations.forEach(({ file, violations: fileViolations }) => {
    console.log(`📄 ${file}`);
    fileViolations.forEach(({ lineNumber, line, match }) => {
      console.log(`   Line ${lineNumber}: ${match}`);
      console.log(`   ${line}`);
    });
    console.log();
  });

  console.log(
    "⚠️  All colors should derive from design tokens defined in src/app/globals.css"
  );
  console.log(
    "   Use Tailwind classes like bg-anticipation, text-foreground, etc."
  );

  process.exit(1);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
