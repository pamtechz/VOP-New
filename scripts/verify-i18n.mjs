import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const sourceRoots = ['src','api'].map(dir => path.join(root, dir));
const requiredNamespaces = new Set([
  'common','navigation','authentication','home','discover','lessons','lesson','quiz','guides',
  'curriculum','progress','certificates','profile','account','radio','materials','search',
  'notifications','announcements','prayer','support','about','settings','admin','organizations',
  'users','translations','validation','errors','accessibility','dates','time','pagination',
  'sharing','offline','network','security','system'
]);
const directPattern = /getTranslation\(\s*['"]([^'"]+)['"]/g;
const localPattern = /\bt\(\s*['"]([^'"]+)['"]/g;
const keys = new Map();

function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes:true })) {
    if (['node_modules','.git','android','dist'].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(tsx?|jsx?)$/.test(entry.name)) inspect(full);
  }
}

function addKey(key, file, source) {
  const record = keys.get(key) || { locations: [], source };
  record.locations.push(path.relative(root, file));
  keys.set(key, record);
}

function inspect(file) {
  const source = fs.readFileSync(file, 'utf8');
  for (const match of source.matchAll(directPattern)) addKey(match[1], file, 'getTranslation');

  // Only inspect local t() calls in files that explicitly define t as a wrapper
  // around getTranslation. This avoids mistaking unrelated functions such as
  // URLSearchParams.get(), helper t(), or Firebase imports for UI translations.
  if (/\b(?:const|let|var)\s+t\s*=/.test(source) && /\bgetTranslation\s*\(/.test(source)) {
    for (const match of source.matchAll(localPattern)) {
      const key = match[1];
      if (key !== 'getTranslation') addKey(key, file, 't');
    }
  }
}

for (const dir of sourceRoots) walk(dir);

const invalid = [];
const namespaces = new Set();
for (const [key, value] of keys) {
  const parts = key.split('.');
  const namespace = parts[0];
  if (parts.length < 2 || !/^[a-zA-Z][a-zA-Z0-9_-]*(?:\.[a-zA-Z][a-zA-Z0-9_-]*)+$/.test(key) || !requiredNamespaces.has(namespace)) {
    invalid.push([key, value.locations]);
  } else namespaces.add(namespace);
}

console.log('VOP Localization Audit');
console.log('Discovered UI translation keys:', keys.size);
console.log('Namespaces used:', [...namespaces].sort().join(', ') || '(none)');
console.log('Invalid/unapproved keys:', invalid.length);
if (invalid.length) {
  for (const [key, locations] of invalid) console.log(`  - ${key} (${locations.join(', ')})`);
  process.exitCode = 1;
}
for (const namespace of [...requiredNamespaces].sort()) {
  console.log(`  ${namespace}: ${[...keys.keys()].filter(key => key.startsWith(namespace + '.')).length}`);
}
if (!invalid.length) console.log('All discovered UI translation keys use approved namespaced keys.');
