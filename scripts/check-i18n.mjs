import { execSync } from 'node:child_process';

const ROOT = 'src/components';

function grep(pattern, files) {
  try {
    const out = execSync(`grep -rnE "${pattern}" ${files.join(' ')}`, {
      encoding: 'utf8',
      maxBuffer: 10_000_000,
    });
    return out.split('\n').filter(Boolean);
  } catch (e) {
    return [];
  }
}

const tsxFiles = execSync(`find ${ROOT} -name '*.tsx'`, { encoding: 'utf8' })
  .split('\n')
  .filter(Boolean);

const hits = [];

// Literal placeholder=, title=, aria-label= with English strings (not using t(...)).
for (const attr of ['placeholder', 'title', 'aria-label']) {
  const pattern = `${attr}="[^"{]*[A-Za-z][^"]*"`;
  for (const line of grep(pattern, tsxFiles)) {
    if (line.includes('t(') || line.includes('{t(')) continue;
    hits.push(line);
  }
}

// JSX text nodes that look like English UI words (a line of mostly English words, not in t()).
const uiWords = [
  'Swap', 'Prettify', 'Smart Fix', 'Copy Report', 'Ignore Key Order', 'Ignore Array Order',
  'Align Array by Key', 'Split View', 'Unified Diff', 'RFC 6902 Patch', 'Fullscreen',
  'Exit Fullscreen', 'Choose file', 'Clear', 'Download', 'Copy', 'Working', 'Loading',
  'Loaded', 'Original', 'Modified', 'Difference Inspector', 'JSON Input', 'Result Output',
  'Indentation', 'Alphabetical Keys', 'Fix Syntax', 'Beautify', 'Order', 'Deep Recursive',
  'Sort Array Values', 'Indent', 'Validate', 'Compress / Minify', 'Generate Patch',
  'Convert Now', 'Copy Result', 'Root Interface', 'Generate', 'Copy TypeScript',
  'Error:', 'Show all', 'Show more', 'lines', 'operations', 'bytes',
];
const uiPattern = uiWords.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
const textPattern = `>${uiWords.map(() => '[^<]*').join('|')}<\s*$`;

// Simpler: flag any JSX text child line containing an English word not inside t() and not a tag.
for (const word of uiWords) {
  const re = new RegExp(`>${word}[^<]*<`, 'g');
  for (const line of grep(re.source, tsxFiles)) {
    if (line.includes('t(') || line.includes('{t(')) continue;
    hits.push(line);
  }
}

if (hits.length) {
  console.error('LEFTOVER ENGLISH UI TEXT FOUND:');
  for (const h of hits) console.error(h);
  process.exit(1);
}
console.log('check:i18n: no leftover English UI text found');
