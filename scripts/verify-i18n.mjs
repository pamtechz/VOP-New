import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const sourceRoots = ['src','api'].map(dir => path.join(root,dir));
const keyPattern = /(?:getTranslation|t)\(\s*['"]([^'"]+)['"]/g;
const keys = new Map();

function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir,{withFileTypes:true})) {
    if (['node_modules','.git','android'].includes(entry.name)) continue;
    const full = path.join(dir,entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(tsx?|jsx?)$/.test(entry.name)) {
      const text = fs.readFileSync(full,'utf8');
      let match;
      while ((match = keyPattern.exec(text))) {
        const key = match[1];
        if (!/^[a-z][a-z0-9_-]*(?:\.[a-z][a-z0-9_-]*)+$/.test(key)) keys.set(key,{file:path.relative(root,full),invalid:true});
        else if (!keys.has(key)) keys.set(key,{file:path.relative(root,full),invalid:false});
      }
    }
  }
}

for (const dir of sourceRoots) walk(dir);
const invalid = [...keys].filter(([,v])=>v.invalid);
const namespaces = [...new Set([...keys].filter(([,v])=>!v.invalid).map(([key])=>key.split('.')[0]))].sort();

console.log('VOP Localization Audit');
console.log(`Discovered UI translation calls: ${keys.size}`);
console.log(`Namespaces: ${namespaces.join(', ') || '(none)'}`);
console.log(`Invalid/non-namespaced keys: ${invalid.length}`);
invalid.forEach(([key,v])=>console.log(`  - ${key} (${v.file})`));
if(invalid.length) process.exitCode=1;
