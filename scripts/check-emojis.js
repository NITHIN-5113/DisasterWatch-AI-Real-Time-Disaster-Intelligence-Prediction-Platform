// scripts/check-emojis.js
// DisasterWatch CI Script — Ensures zero emojis are present across project files

const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const emojiRegex = /(\p{Extended_Pictographic}|\p{Emoji_Presentation})/gu;
const ignoredDirs = new Set(['.git', 'node_modules', 'dist', '.vscode', '.system_generated']);
const targetExts = new Set(['.js', '.json', '.html', '.css', '.md', '.prisma', '.env', '.example', '.sh']);

let violations = [];

function scan(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (ignoredDirs.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      scan(fullPath);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (targetExts.has(ext)) {
        checkFile(fullPath);
      }
    }
  }
}

function checkFile(filePath) {
  const relPath = path.relative(rootDir, filePath).replace(/\\/g, '/');
  // Skip this script itself and scratch files
  if (relPath.includes('check-emojis.js') || relPath.includes('find_emojis.js')) return;

  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');

  lines.forEach((line, index) => {
    const matches = line.match(emojiRegex);
    if (matches && matches.length > 0) {
      const filtered = matches.filter(m => m.codePointAt(0) >= 0x2000);
      if (filtered.length > 0) {
        violations.push({
          file: relPath,
          line: index + 1,
          emojis: Array.from(new Set(filtered)),
          text: line.trim()
        });
      }
    }
  });
}

scan(rootDir);

if (violations.length > 0) {
  console.error(`\x1b[31m[EMOJI LINT ERROR] Found ${violations.length} line(s) containing emojis:\x1b[0m\n`);
  violations.forEach(v => {
    console.error(`  ${v.file}:${v.line} -> [${v.emojis.join(', ')}] : ${v.text}`);
  });
  console.error('\nDisasterWatch requires pure SVG icons and zero emojis. Please remove all emojis.');
  process.exit(1);
} else {
  console.log('\x1b[32m[EMOJI LINT OK] No emojis detected across project source files.\x1b[0m');
  process.exit(0);
}
