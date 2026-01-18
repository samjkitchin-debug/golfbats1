#!/usr/bin/env node

/**
 * Brand Audit Script
 * 
 * Scans src/ for banned color patterns that bypass the token system.
 * Exits with code 1 if any violations are found.
 * 
 * Banned patterns:
 * - bg-brand-*, text-brand-*, border-brand-*, ring-brand-* (use semantic tokens instead)
 * - text-black, bg-white, bg-black (use tokens)
 * - bg-(slate|gray|zinc|neutral|stone|blue|indigo|emerald|green|red|amber|yellow)-* (use tokens)
 * - text-*, border-*, ring-* with Tailwind palette colours (use tokens)
 * - text-white paired with btn-* (redundant glue class)
 * - inline hex colours #xxxxxx in TS/TSX (allowlisted files excluded)
 */

import { readdir, readFile, stat } from 'fs/promises';
import { join, extname } from 'path';

const SRC_DIR = 'src';
const BANNED_PATTERNS = [
  // Direct brand color utilities
  /\bbg-brand-/,
  /\btext-brand-/,
  /\bborder-brand-/,
  /\bring-brand-/,
  // Hard-coded colors (legacy bypasses)
  /\btext-black\b/,
  /\bbg-white\b/,
  /\bbg-black\b/,
  // Tailwind default palette (all variants)
  /\bbg-(slate|gray|zinc|neutral|stone|blue|indigo|emerald|green|red|amber|yellow)-/,
  /\btext-(slate|gray|zinc|neutral|stone|blue|indigo|emerald|green|red|amber|yellow)-/,
  /\bborder-(slate|gray|zinc|neutral|stone|blue|indigo|emerald|green|red|amber|yellow)-/,
  /\bring-(slate|gray|zinc|neutral|stone|blue|indigo|emerald|green|red|amber|yellow)-/,
  // text-white when paired with btn-* (redundant glue class)
  /\btext-white\b.*btn-(primary|anticipation|danger|ceremonial)/,
  /\bbtn-(primary|anticipation|danger|ceremonial).*\btext-white\b/,
  // Hex colors in TS/TSX (allowlisted files excluded later)
  /#[0-9a-fA-F]{3,8}/,
];

const ALLOWLIST_HEX_FILES = [
  'src/app/icon.tsx',
  'src/app/icon-192/route.tsx',
  'src/app/icon-512/route.tsx',
  'src/app/login/LoginClient.tsx', // Google SVG fills
];

const ALLOWED_EXTENSIONS = ['.tsx', '.ts', '.jsx', '.js'];
const IGNORE_DIRS = ['node_modules', '.next', '.git'];

async function isDirectory(path) {
  try {
    const stats = await stat(path);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

async function scanFile(filePath) {
  const content = await readFile(filePath, 'utf-8');
  const lines = content.split('\n');
  const violations = [];
  const normalizedPath = filePath.replace(/\\/g, '/');
  const isHexAllowlisted = ALLOWLIST_HEX_FILES.some((allow) => normalizedPath.endsWith(allow));

  lines.forEach((line, index) => {
    BANNED_PATTERNS.forEach((pattern, patternIndex) => {
      // Skip hex pattern for allowlisted files
      if (patternIndex === BANNED_PATTERNS.length - 1 && isHexAllowlisted) {
        return;
      }
      if (pattern.test(line)) {
        violations.push({
          line: index + 1,
          content: line.trim(),
          pattern: pattern.toString(),
        });
      }
    });
  });

  return violations;
}

async function scanDirectory(dirPath) {
  const entries = await readdir(dirPath);
  const allViolations = [];

  for (const entry of entries) {
    const fullPath = join(dirPath, entry);

    // Skip ignored directories
    if (IGNORE_DIRS.includes(entry)) {
      continue;
    }

    if (await isDirectory(fullPath)) {
      const subViolations = await scanDirectory(fullPath);
      allViolations.push(...subViolations);
    } else {
      const ext = extname(entry);
      if (ALLOWED_EXTENSIONS.includes(ext)) {
        const violations = await scanFile(fullPath);
        if (violations.length > 0) {
          allViolations.push({
            file: fullPath,
            violations,
          });
        }
      }
    }
  }

  return allViolations;
}

async function main() {
  console.log('🔍 Scanning src/ for banned color patterns...\n');

  try {
    const violations = await scanDirectory(SRC_DIR);

    if (violations.length === 0) {
      console.log('✅ No violations found. Brand tokens are being used correctly.\n');
      process.exit(0);
    }

    console.log('❌ Brand audit failed. Found violations:\n');
    console.log('='.repeat(80));

    violations.forEach(({ file, violations: fileViolations }) => {
      fileViolations.forEach(({ line, content }) => {
        console.log(`${file}:${line}: ${content}`);
      });
    });

    console.log('\n' + '='.repeat(80));
    console.log('\n💡 Fix: Replace banned patterns with semantic tokens from globals.css:');
    console.log('   - bg-brand-* → bg-anticipation or btn-anticipation');
    console.log('   - text-black/bg-white → text-fg/bg-surface');
    console.log('   - Tailwind defaults → semantic tokens (bg-surface, text-fg, etc.)');
    console.log('   - text-white with btn-* → remove text-white (btn-* includes foreground)');
    console.log('   - Hex colors → CSS variables\n');

    process.exit(1);
  } catch (error) {
    console.error('❌ Error running brand audit:', error.message);
    process.exit(1);
  }
}

main();
