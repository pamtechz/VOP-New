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
const keyPattern = /(?:getTranslation|t)\(\s*['"]([^'"]+)['"]/g;
const keys = new Map();

function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes:true })) {
    if (['node_modules','.git','android','dist'].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(tsx?|jsx?)$/.test(entry.name)) {
      const source = fs.readFileSync(full, 'utf8');
      for (const match of source.matchAll(keyPattern)) {
        const key = match[1];
        const line = source.slice(0, match.index).split('\n').length;
        const record = keys.get(key) || { locations: [] };
        record.locations.push(path.relative(root, full) + ':' + line);
        keys.set(key, record);
      }
    }
  }
}
for (const dir of sourceRoots) walk(dir);

const invalid = [];
const namespaces = new Set();
for (const [key, value] of keys) {
  const parts = key.split('.');
  const namespace = parts[0];
  if (parts.length < 2 || !/^[a-z][a-z0-9_-]*(?:\.[a-z][a-z0-9_-]*)+$/.test(key) || !requiredNamespaces.has(namespace)) {
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
