#!/usr/bin/env node

/**
 * Color Token Linter
 * 
 * Fails if hard-coded colors are found that bypass the token system.
 * Allows colors only in globals.css (where tokens are defined).
 */

const fs = require('fs');
const path = require('path');

const HEX_PATTERN = /#[0-9a-fA-F]{3,8}\b/g;
const PALETTE_PATTERN = /\b(bg|text|border|ring|from|via|to)-(white|black|gray|slate|neutral|zinc|red|blue|green|yellow|amber|orange|purple|pink|indigo|cyan|emerald|lime|teal|sky|rose|fuchsia|violet)-\d+/g;

const ALLOWED_FILES = [
  'src/app/globals.css',
  'docs/COLOR_AUDIT_REPORT.md',
  'docs/STYLING_GUIDELINES.md',
  'scripts/lint-colors.js',
];

function shouldCheckFile(filePath) {
  // Skip node_modules, .next, build, out
  if (filePath.includes('node_modules') || 
      filePath.includes('.next') || 
      filePath.includes('build/') || 
      filePath.includes('out/')) {
    return false;
  }

  // Only check TypeScript/TSX/CSS files
  if (!/\.(ts|tsx|js|jsx|css)$/.test(filePath)) {
    return false;
  }

  // Allow token definitions in globals.css
  const relativePath = path.relative(process.cwd(), filePath).replace(/\\/g, '/');
  if (ALLOWED_FILES.includes(relativePath)) {
    return false;
  }

  return true;
}

function findHardCodedColors(content, filePath) {
  const issues = [];

  // Check for HEX colors
  const hexMatches = [...content.matchAll(HEX_PATTERN)];
  hexMatches.forEach(match => {
    // Skip if it's inside a string that's clearly a comment or documentation
    const beforeMatch = content.substring(Math.max(0, match.index - 50), match.index);
    if (beforeMatch.includes('//') || beforeMatch.includes('/*') || beforeMatch.includes('*')) {
      return;
    }
    
    issues.push({
      type: 'HEX',
      value: match[0],
      line: content.substring(0, match.index).split('\n').length,
    });
  });

  // Check for palette utilities (but allow brand-* tokens)
  const paletteMatches = [...content.matchAll(PALETTE_PATTERN)];
  paletteMatches.forEach(match => {
    const fullMatch = match[0];
    // Allow brand colors (bg-brand-green, text-brand-orange, etc.)
    if (fullMatch.includes('brand-')) {
      return;
    }
    
    issues.push({
      type: 'PALETTE',
      value: fullMatch,
      line: content.substring(0, match.index).split('\n').length,
    });
  });

  return issues;
}

function walkDir(dir, fileList = []) {
  const files = fs.readdirSync(dir);

  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      walkDir(filePath, fileList);
    } else if (shouldCheckFile(filePath)) {
      fileList.push(filePath);
    }
  });

  return fileList;
}

function main() {
  const srcDir = path.join(process.cwd(), 'src');
  
  if (!fs.existsSync(srcDir)) {
    console.error('src directory not found');
    process.exit(1);
  }

  const files = walkDir(srcDir);
  const allIssues = [];

  files.forEach(filePath => {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const issues = findHardCodedColors(content, filePath);

      if (issues.length > 0) {
        const relativePath = path.relative(process.cwd(), filePath).replace(/\\/g, '/');
        allIssues.push({
          file: relativePath,
          issues,
        });
      }
    } catch (error) {
      console.warn(`Error reading ${filePath}:`, error.message);
    }
  });

  if (allIssues.length > 0) {
    console.error('\n❌ Hard-coded colors found! Use semantic tokens instead.\n');
    console.error('See docs/STYLING_GUIDELINES.md for usage.\n');

    allIssues.forEach(({ file, issues }) => {
      console.error(`\n${file}:`);
      issues.forEach(({ type, value, line }) => {
        console.error(`  Line ${line}: ${type} color "${value}"`);
      });
    });

    console.error('\n❌ Lint failed. Fix hard-coded colors before committing.\n');
    process.exit(1);
  }

  console.log('✅ No hard-coded colors found.');
  process.exit(0);
}

if (require.main === module) {
  main();
}

module.exports = { findHardCodedColors, shouldCheckFile };
