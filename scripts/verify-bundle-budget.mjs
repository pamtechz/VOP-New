import fs from 'node:fs';
import path from 'node:path';

const root=path.resolve('dist/assets');
if(!fs.existsSync(root))throw new Error('dist/assets is missing. Run the production build before the bundle-budget gate.');
const budget=JSON.parse(fs.readFileSync(path.resolve('config/production-budgets.json'),'utf8')).bundle||{};

function files(dir){
  return fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry=>{
    const full=path.join(dir,entry.name);
    return entry.isDirectory()?files(full):[full];
  });
}
const assets=files(root).map(file=>({
  file:path.relative(path.resolve('dist'),file).replaceAll('\\','/'),
  bytes:fs.statSync(file).size,
  ext:path.extname(file).toLowerCase(),
}));
const js=assets.filter(item=>item.ext==='.js');
const css=assets.filter(item=>item.ext==='.css');
const sum=items=>items.reduce((total,item)=>total+item.bytes,0);
const largest=items=>items.reduce((best,item)=>!best||item.bytes>best.bytes?item:best,null);
const largestJs=largest(js),largestCss=largest(css);
const entryJs=js.find(item=>/^assets\/index-[^/]+\.js$/.test(item.file))||null;
const totalJs=sum(js),totalCss=sum(css);
const largeThreshold=Number(budget.largeJsThresholdBytes);
const largeChunks=js.filter(item=>item.bytes>largeThreshold);
const failures=[];
if(!entryJs)failures.push('Vite entry JS chunk assets/index-*.js was not found.');
if(entryJs&&entryJs.bytes>Number(budget.maxEntryJsBytes))failures.push('entry JS '+entryJs.file+' is '+entryJs.bytes+' bytes > '+budget.maxEntryJsBytes);
if(largestJs&&largestJs.bytes>Number(budget.maxSingleJsBytes))failures.push('largest JS '+largestJs.file+' is '+largestJs.bytes+' bytes > '+budget.maxSingleJsBytes);
if(largestCss&&largestCss.bytes>Number(budget.maxSingleCssBytes))failures.push('largest CSS '+largestCss.file+' is '+largestCss.bytes+' bytes > '+budget.maxSingleCssBytes);
if(totalJs>Number(budget.maxTotalJsBytes))failures.push('total JS is '+totalJs+' bytes > '+budget.maxTotalJsBytes);
if(totalCss>Number(budget.maxTotalCssBytes))failures.push('total CSS is '+totalCss+' bytes > '+budget.maxTotalCssBytes);
if(largeChunks.length>Number(budget.maxLargeJsChunks))failures.push(largeChunks.length+' JS chunks exceed '+largeThreshold+' bytes; maximum is '+budget.maxLargeJsChunks);
console.log(JSON.stringify({
  entryJs,largestJs,largestCss,totalJs,totalCss,
  largeJsChunks:largeChunks.map(item=>({file:item.file,bytes:item.bytes})),
},null,2));
if(failures.length){
  console.error('Production bundle budget FAILED');
  failures.forEach(item=>console.error(' - '+item));
  process.exit(1);
}
console.log('Production bundle budget passed.');
