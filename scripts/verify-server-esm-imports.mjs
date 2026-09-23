#!/usr/bin/env node

import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

const root = process.cwd();
const roots = ['api', 'server'];
const violations = [];

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await walk(path);
    else if (entry.isFile() && /\.(?:ts|tsx|mjs|js)$/.test(entry.name)) {
      const source = await readFile(path, 'utf8');
      const importPattern = /(?:from\s*|import\s*\()(['\"])(\.{1,2}\/[^'\"]+)\1/g;
      let match;
      while ((match = importPattern.exec(source))) {
        const specifier = match[2];
        if (specifier.endsWith('.js') || specifier.endsWith('.json')) continue;
        if (specifier.includes('/server/')) violations.push(relative(root, path) + ' -> ' + specifier);
      }
    }
  }
}

for (const directory of roots) await walk(join(root, directory));

if (violations.length) {
  console.error('Invalid extensionless server ESM imports detected:');
  for (const violation of violations) console.error(' - ' + violation);
  process.exit(1);
}

console.log('Server ESM import check passed.');
