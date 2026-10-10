import type {StudyPlateNode,StudyPlateLeaf} from './studyPlateDocument.js';

/** Pure, deterministic table operations. Every row retains its logical columns;
 * covered cells stay in Plate's tree but are hidden in the table view. This
 * prevents Slate paths and cell contents shifting when spans are applied. */
export type StudyCellPoint={row:number;col:number};
export type StudyCellRect={top:number;left:number;bottom:number;right:number};
type Cell=StudyPlateNode;
const MIN_ROWS=1,MAX_ROWS=20,MIN_COLUMNS=1,MAX_COLUMNS=12;
const isNode=(v:StudyPlateNode|StudyPlateLeaf):v is StudyPlateNode=>'type'in v;
const deepCopy=(v:StudyPlateNode):StudyPlateNode=>JSON.parse(JSON.stringify(v)) as StudyPlateNode;
const rowsOf=(table:StudyPlateNode):StudyPlateNode[][]=>
  table.children.map(row=>{
    if(!isNode(row)||row.type!=='tr')throw Error('Invalid table row.');
    return row.children.map(cell=>{
      if(!isNode(cell)||!['td','th'].includes(cell.type))throw Error('Invalid table cell.');
      return cell;
    });
  });
export function tableRect(a:StudyCellPoint,b:StudyCellPoint):StudyCellRect{
  return {top:Math.min(a.row,b.row),left:Math.min(a.col,b.col),
    bottom:Math.max(a.row,b.row),right:Math.max(a.col,b.col)};
}
export function tableBounds(table:StudyPlateNode){
  const rows=rowsOf(table);
  const count=rows[0]?.length||0;
  if(rows.length<MIN_ROWS||rows.length>MAX_ROWS||count<MIN_COLUMNS||count>MAX_COLUMNS
    ||rows.some(row=>row.length!==count))throw Error('Table dimensions are inconsistent.');
  return {rows,columns:count};
}
function inside(table:StudyPlateNode,rect:StudyCellRect){
  const {rows,columns}=tableBounds(table);
  if(rect.top<0||rect.left<0||rect.bottom>=rows.length||rect.right>=columns)
    throw Error('The selection extends outside the table.');
}
export function tableHasMerges(table:StudyPlateNode):boolean{
  return rowsOf(table).some(row=>row.some(cell=>
    cell.covered===true||(cell.colSpan||1)>1||(cell.rowSpan||1)>1));
}
export function tableAnchorAt(table:StudyPlateNode,row:number,col:number):StudyCellPoint{
  const grid=rowsOf(table);
  if(!grid[row]?.[col])throw Error('Cell is outside the table.');
  if(grid[row][col].covered!==true)return {row,col};
  for(let r=0;r<=row;r++)for(let c=0;c<=col;c++){
    const cell=grid[r][c];
    if(cell.covered===true)continue;
    if(r+(cell.rowSpan||1)>row&&c+(cell.colSpan||1)>col)return {row:r,col:c};
  }
  throw Error('The merged cell is missing its anchor.');
}
const hasContent=(cell:StudyPlateNode)=>cell.children.some(child=>{
  const value=(node:StudyPlateLeaf|StudyPlateNode):string=>
    'text'in node?node.text:node.children.map(value).join('');
  return Boolean(value(child).trim());
});
export function mergeStudyCells(table:StudyPlateNode,rect:StudyCellRect):StudyPlateNode{
  inside(table,rect);
  if(rect.top===rect.bottom&&rect.left===rect.right)throw Error('Select two or more cells to merge.');
  const next=deepCopy(table),grid=rowsOf(next);
  const mergedChildren:Array<StudyPlateNode|StudyPlateLeaf>=[];
  for(let row=rect.top;row<=rect.bottom;row++)for(let col=rect.left;col<=rect.right;col++){
    const cell=grid[row][col];
    if(cell.covered||cell.colSpan&&cell.colSpan>1||cell.rowSpan&&cell.rowSpan>1)
      throw Error('Split existing merged cells before merging this region.');
    if(hasContent(cell))mergedChildren.push(...cell.children);
  }
  if(mergedChildren.length>160)throw Error('Selected cells contain too many paragraphs to merge safely.');
  const anchor=grid[rect.top][rect.left];
  anchor.children=mergedChildren.length?mergedChildren:anchor.children;
  anchor.colSpan=rect.right-rect.left+1;
  anchor.rowSpan=rect.bottom-rect.top+1;
  for(let row=rect.top;row<=rect.bottom;row++)for(let col=rect.left;col<=rect.right;col++){
    if(row===rect.top&&col===rect.left)continue;
    const cell=grid[row][col];
    cell.covered=true;
    cell.children=[{type:'p',children:[{text:''}]}];
  }
  return next;
}
export function splitStudyCell(table:StudyPlateNode,point:StudyCellPoint):StudyPlateNode{
  const a=tableAnchorAt(table,point.row,point.col);
  const next=deepCopy(table),grid=rowsOf(next);
  const anchor=grid[a.row][a.col];
  const height=anchor.rowSpan||1,width=anchor.colSpan||1;
  if(height===1&&width===1)throw Error('Select a merged cell to split.');
  delete anchor.colSpan;delete anchor.rowSpan;
  for(let row=a.row;row<a.row+height;row++)for(let col=a.col;col<a.col+width;col++){
    if(row===a.row&&col===a.col)continue;
    delete grid[row][col].covered;
  }
  return next;
}
export type StudyCellFormat={backgroundColor?:string;borderColor?:string;align?:'left'|'center'|'right'};
const validColor=(v:string)=>/^#[\da-f]{6}$/i.test(v);
export function formatStudyCells(table:StudyPlateNode,rect:StudyCellRect,format:StudyCellFormat):StudyPlateNode{
  inside(table,rect);
  for(const color of [format.backgroundColor,format.borderColor]){
    if(color!==undefined&&!validColor(color))throw Error('Cell color must be a six-digit hex color.');
  }
  const next=deepCopy(table),grid=rowsOf(next);
  const changed=new Set<string>();
  for(let row=rect.top;row<=rect.bottom;row++)for(let col=rect.left;col<=rect.right;col++){
    const origin=tableAnchorAt(table,row,col),key=origin.row+':'+origin.col;
    if(changed.has(key))continue;
    changed.add(key);
    const cell=grid[origin.row][origin.col];
    if(format.backgroundColor!==undefined)cell.backgroundColor=format.backgroundColor;
    if(format.borderColor!==undefined)cell.borderColor=format.borderColor;
    if(format.align!==undefined)cell.align=format.align;
  }
  return next;
}
const textOf=(node:StudyPlateNode|StudyPlateLeaf):string=>
  'text'in node?node.text:node.children.map(textOf).join(' ');
/** Text-only TSV intentionally excludes styling and URLs. TSV paste is bounded
 * to the current table and cannot silently add rows or lose existing cells. */
export function studyCellsToTsv(table:StudyPlateNode,rect:StudyCellRect):string{
  inside(table,rect);
  const grid=rowsOf(table),result:string[]=[];
  for(let row=rect.top;row<=rect.bottom;row++){
    const parts:string[]=[];
    for(let col=rect.left;col<=rect.right;col++){
      const cell=grid[row][col];
      parts.push(cell.covered?'':textOf(cell).replace(/[\t\r\n]+/g,' ').trim());
    }
    result.push(parts.join('\t'));
  }
  return result.join('\n');
}
export function pasteStudyCellsTsv(table:StudyPlateNode,point:StudyCellPoint,tsv:string):StudyPlateNode{
  const text=tsv.replace(/\r\n?/g,'\n').replace(/\n$/,'');
  if(!text.trim()||text.length>16000)throw Error('Paste data is empty or too large.');
  const data=text.split('\n').map(row=>row.split('\t'));
  if(data.length>MAX_ROWS||data.some(row=>row.length>MAX_COLUMNS||row.some(value=>value.length>8000)))
    throw Error('Paste exceeds the supported table dimensions.');
  const lastRow=point.row+data.length-1;
  const lastCol=point.col+Math.max(...data.map(row=>row.length))-1;
  const rect={top:point.row,left:point.col,bottom:lastRow,right:lastCol};
  inside(table,rect);
  const original=rowsOf(table);
  for(let row=rect.top;row<=rect.bottom;row++)for(let col=rect.left;col<=rect.right;col++){
    const cell=original[row][col];
    if(cell.covered||(cell.colSpan||1)>1||(cell.rowSpan||1)>1)
      throw Error('Split merged cells before pasting a range.');
  }
  const next=deepCopy(table),grid=rowsOf(next);
  data.forEach((parts,r)=>parts.forEach((value,c)=>{
    grid[point.row+r][point.col+c].children=[{type:'p',children:[{text:value}]}];
  }));
  return next;
}
/** Throw on malformed coverage; never allow overlapping spans or uncovered
 * hidden cells into Firestore. The grid shape remains rectangular. */
export function validateStudyTableSpans(table:StudyPlateNode):void{
  const grid=rowsOf(table),{columns}=tableBounds(table);
  const expected=new Set<string>();
  for(let row=0;row<grid.length;row++)for(let col=0;col<columns;col++){
    const cell=grid[row][col];
    if(cell.covered)continue;
    const height=cell.rowSpan||1,width=cell.colSpan||1;
    if(!Number.isSafeInteger(height)||!Number.isSafeInteger(width)
      ||height<1||width<1||row+height>grid.length||col+width>columns)
      throw Error('A merged cell exceeds its table boundaries.');
    for(let r=row;r<row+height;r++)for(let c=col;c<col+width;c++){
      if(r===row&&c===col)continue;
      const key=r+':'+c;
      if(expected.has(key)||!grid[r][c].covered)
        throw Error('Merged cell coverage is inconsistent or overlaps.');
      expected.add(key);
    }
  }
  for(let row=0;row<grid.length;row++)for(let col=0;col<columns;col++){
    if(grid[row][col].covered&&!expected.has(row+':'+col))
      throw Error('A covered cell has no valid merged anchor.');
  }
}
