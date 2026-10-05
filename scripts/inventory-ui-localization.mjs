import fs from 'node:fs';
import path from 'node:path';

const ROOT=path.resolve('src');
const EXT=/\.(tsx|jsx|ts|js)$/;
const ignored=new Set(['node_modules','dist']);
const hits=[];

function walk(dir){
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    if(ignored.has(entry.name))continue;
    const file=path.join(dir,entry.name);
    if(entry.isDirectory())walk(file);
    else if(EXT.test(entry.name))scan(file);
  }
}

function scan(file){
  const lines=fs.readFileSync(file,'utf8').split(/\r?\n/);
  lines.forEach((line,index)=>{
    if(line.includes('getTranslation('))return;
    const patterns=[
      />\s*([A-Za-z][A-Za-z0-9 ,&'’!?./:;()\-]{3,})\s*</g,
      /(?:placeholder|title|aria-label)\s*=\s*"([^"]{3,})"/g,
      /(?:placeholder|title|aria-label)\s*=\s*'([^']{3,})'/g,
    ];
    for(const re of patterns){
      for(const match of line.matchAll(re)){
        const value=match[1].trim();
        if(value&&!value.startsWith('{'))hits.push({
          file:path.relative(process.cwd(),file).replaceAll('\\','/'),
          line:index+1,
          value,
        });
      }
    }
  });
}

walk(ROOT);
const unique=[...new Map(hits.map(item=>[item.file+':'+item.line+':'+item.value,item])).values()];
const grouped={};
for(const item of unique)(grouped[item.file]??=[]).push(item);

const output=[
  '# VOP UI Localization Inventory',
  '',
  'Likely user-visible literals requiring stable namespaced UI translation keys. Human-authored lesson/curriculum content is intentionally excluded.',
  '',
  ...Object.entries(grouped).sort(([a],[b])=>a.localeCompare(b)).map(([file,items])=>[
    '## '+file,
    '',
    ...items.map(item=>'- L'+item.line+' — '+item.value),
    '',
  ].join('\n')),
].join('\n');

const check=process.argv.includes('--check');
if(!check){
  fs.writeFileSync('docs/UI_LOCALIZATION_INVENTORY.md',output+'\n');
}

const budgetPath=path.resolve('config/production-budgets.json');
const budget=JSON.parse(fs.readFileSync(budgetPath,'utf8'));
const max=Number(budget.uiLocalization?.maxCandidateLiterals);
console.log('Detected '+unique.length+' candidate UI literals across '+Object.keys(grouped).length+' source files.');
if(check){
  if(!Number.isSafeInteger(max)||max<0)throw new Error('config/production-budgets.json must define uiLocalization.maxCandidateLiterals.');
  if(unique.length>max){
    console.error('UI localization budget exceeded: '+unique.length+' candidates > '+max+'. Replace new user-visible literals with stable translation keys.');
    process.exit(1);
  }
  console.log('UI localization budget passed: '+unique.length+' <= '+max+'. Existing debt may decrease but must not increase.');
}
