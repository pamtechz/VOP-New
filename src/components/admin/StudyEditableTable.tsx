import React, {useState} from 'react';
import {PlateElement,createPlatePlugin,useEditorRef,type PlateElementProps} from 'platejs/react';
import {Columns3,Rows3,Plus,Minus,Trash2,AlignJustify,PanelTop,Maximize2} from 'lucide-react';
import {getTranslation,getUiLocale} from '../../services/i18n';
const uiT=(key:string,fallback:string)=>getTranslation(key,getUiLocale(),undefined,fallback,'StudyEditableTable');

/** Plate authoring table actions. All changes use Slate transforms so the
 * normal lesson persistence, undo stack and section/block IDs remain intact. */
type TableElement={type:string;id?:string;colWidths?:number[];children:Array<{type:string;rowHeight?:number;children:unknown[]}>};
const MAX_ROWS=20;
const MAX_COLS=12;
const MIN_COLUMN_WIDTH=64;
const MAX_COLUMN_WIDTH=640;
const MIN_ROW_HEIGHT=32;
const MAX_ROW_HEIGHT=480;
const focusCell=(editor:ReturnType<typeof useEditorRef>,path:number[],row:number,col:number)=>{
  editor.tf.select([...path,row,col,0,0]);
  requestAnimationFrame(()=>editor.tf.focus());
};
const clamp=(n:number,min:number,max:number)=>Math.max(min,Math.min(max,n));
const freshCell=()=>({type:'td',children:[{type:'p',children:[{text:''}]}]});
const freshRow=(columns:number)=>({type:'tr',children:Array.from({length:columns},freshCell)});
const widthList=(table:TableElement,tableWidth?:number)=>{
  const count=table.children[0]?.children?.length||1;
  const defaultWidth=clamp(Math.round((tableWidth||count*145)/count),MIN_COLUMN_WIDTH,MAX_COLUMN_WIDTH);
  return table.colWidths?.length===count?table.colWidths.map(v=>clamp(v,MIN_COLUMN_WIDTH,MAX_COLUMN_WIDTH))
    :Array.from({length:count},()=>defaultWidth);
};

function StudyTableElement({element,children,...props}:PlateElementProps) {
  const editor=useEditorRef();
  const node=element as unknown as TableElement;
  const rowCount=node.children.length;
  const colCount=node.children[0]?.children.length||1;
  const [activeCell,setActiveCell]=useState({row:0,col:0});
  const [selected,setSelected]=useState(false);
  const widths=widthList(node);
  const locate=()=>editor.api.findPath(element);
  const selection={row:clamp(activeCell.row,0,rowCount-1),col:clamp(activeCell.col,0,colCount-1)};
  const execute=(kind:'rowAbove'|'rowBelow'|'removeRow'|'colBefore'|'colAfter'|'removeCol')=>{
    const path=locate();
    if(!path)return;
    const row=selection.row,col=selection.col;
    const current=(editor.children as unknown as TableElement[])[path[0]];
    const rows=current.children.length;
    const cols=current.children[0]?.children.length||1;
    if(kind==='rowAbove'||kind==='rowBelow'){
      if(rows>=MAX_ROWS)return;
      const nextIndex=row+(kind==='rowBelow'?1:0);
      editor.tf.insertNodes(freshRow(cols) as never,{at:[...path,nextIndex]});
      setActiveCell({row:nextIndex,col});
      focusCell(editor,path,nextIndex,col);
      return;
    }
    if(kind==='removeRow'){
      if(rows<=1)return;
      editor.tf.removeNodes({at:[...path,row]});
      setActiveCell({row:Math.min(row,rows-2),col});
      focusCell(editor,path,Math.min(row,rows-2),col);
      return;
    }
    if(kind==='colBefore'||kind==='colAfter'){
      if(cols>=MAX_COLS)return;
      const nextIndex=col+(kind==='colAfter'?1:0);
      // Snapshot widths BEFORE structural transforms: Slate may mutate the
      // referenced table node in place during a multi-row column insertion.
      const nextWidths=widthList(current);
      nextWidths.splice(nextIndex,0,145);
      for(let r=0;r<rows;r++)editor.tf.insertNodes(freshCell() as never,{at:[...path,r,nextIndex]});
      editor.tf.setNodes({colWidths:nextWidths} as never,{at:path});
      setActiveCell({row,col:nextIndex});
      focusCell(editor,path,row,nextIndex);
      return;
    }
    if(cols<=1)return;
    const nextWidths=widthList(current);
    nextWidths.splice(col,1);
    for(let r=rows-1;r>=0;r--)editor.tf.removeNodes({at:[...path,r,col]});
    editor.tf.setNodes({colWidths:nextWidths} as never,{at:path});
    setActiveCell({row,col:Math.min(col,cols-2)});
    focusCell(editor,path,row,Math.min(col,cols-2));
  };
  const tableLayout=(kind:'equal'|'fit'|'header'|'delete')=>{
    const path=locate();
    if(!path)return;
    const current=(editor.children as unknown as TableElement[])[path[0]];
    if(!current||current.type!=='table')return;
    const cols=current.children[0]?.children.length||1;
    if(kind==='delete'){
      // Maintain at least one editable paragraph in the current study page.
      editor.tf.removeNodes({at:path});
      editor.tf.insertNodes({type:'p',id:'block-'+Math.random().toString(36).slice(2,12),
        children:[{text:''}]} as never,{at:path});
      editor.tf.select([...path,0]);
      editor.tf.focus();
      return;
    }
    if(kind==='header'){
      const makeHeader=current.children[0].children.some(cell=>(cell as {type:string}).type!=='th');
      for(let col=0;col<cols;col++)editor.tf.setNodes({type:makeHeader?'th':'td'} as never,{at:[...path,0,col]});
      return;
    }
    const original=widthList(current);
    const total=kind==='fit'
      ?Math.max(cols*MIN_COLUMN_WIDTH,Math.round(
        document.querySelector('.vop-plate-author-table-wrap:focus-within .vop-plate-author-table-scroll')?.getBoundingClientRect().width
        ||document.querySelector('.vop-plate-editable')?.getBoundingClientRect().width
        ||original.reduce((a,b)=>a+b,0)))
      :original.reduce((a,b)=>a+b,0);
    const even=clamp(Math.floor(total/cols),MIN_COLUMN_WIDTH,MAX_COLUMN_WIDTH);
    editor.tf.setNodes({colWidths:Array.from({length:cols},()=>even)} as never,{at:path});
  };
  const tableKeyDown=(event:React.KeyboardEvent<HTMLDivElement>)=>{
    if(event.key!=='Tab'||event.altKey||event.ctrlKey||event.metaKey)return;
    if(!(event.target instanceof Element)||!event.target.closest('td,th'))return;
    const path=locate(), anchor=editor.selection?.anchor.path;
    if(!path||!anchor||anchor.length<path.length+3
      ||path.some((segment,index)=>anchor[index]!==segment))return;
    const table=(editor.children as unknown as TableElement[])[path[0]];
    const row=anchor[path.length], col=anchor[path.length+1];
    const rowCount=table.children.length,colCount=table.children[0]?.children.length||1;
    if(row<0||row>=rowCount||col<0||col>=colCount)return;
    const at=row*colCount+col+(event.shiftKey?-1:1);
    if(at<0)return; // Shift+Tab on the first cell can leave the table.
    event.preventDefault();
    if(at>=rowCount*colCount){
      if(rowCount>=MAX_ROWS)return;
      editor.tf.insertNodes(freshRow(colCount) as never,{at:[...path,rowCount]});
      setActiveCell({row:rowCount,col:0});
      focusCell(editor,path,rowCount,0);
      return;
    }
    const nextRow=Math.floor(at/colCount),nextCol=at%colCount;
    setActiveCell({row:nextRow,col:nextCol});
    focusCell(editor,path,nextRow,nextCol);
  };
  const trackClick=(event:React.MouseEvent<HTMLDivElement>)=>{
    const target=event.target;
    if(!(target instanceof Element))return;
    const cell=target.closest('td,th');
    const row=cell?.parentElement;
    const table=cell?.closest('table');
    if(!cell||!row||!table||!event.currentTarget.contains(table))return;
    const rowIndex=Array.from(table.rows).indexOf(row as HTMLTableRowElement);
    const colIndex=Array.from((row as HTMLTableRowElement).cells).indexOf(cell as HTMLTableCellElement);
    if(rowIndex>=0&&colIndex>=0){setActiveCell({row:rowIndex,col:colIndex});setSelected(true);}
  };
  return <PlateElement as="div" element={element} className="vop-plate-author-table-wrap" {...props}>
    <div onClickCapture={trackClick} onKeyDownCapture={tableKeyDown} data-table-selected={selected}>
    <div className="vop-plate-table-tools" contentEditable={false} role="toolbar" aria-label={uiT('admin.study_table.editing','Table editing')}>
      <span className="vop-plate-table-tools-label"><Rows3 size={13}/> {uiT('admin.study_table.layout','Table layout')}</span>
      <button type="button" title={uiT('admin.study_table.row_above_title','Add row above selected cell')} onMouseDown={e=>e.preventDefault()} onClick={()=>execute('rowAbove')} disabled={rowCount>=MAX_ROWS}><Plus size={12}/> {uiT('admin.study_table.row_above','Row above')}</button>
      <button type="button" title={uiT('admin.study_table.row_below_title','Add row below selected cell')} onMouseDown={e=>e.preventDefault()} onClick={()=>execute('rowBelow')} disabled={rowCount>=MAX_ROWS}><Plus size={12}/> {uiT('admin.study_table.row_below','Row below')}</button>
      <button type="button" title={uiT('admin.study_table.remove_row_title','Remove selected row')} onMouseDown={e=>e.preventDefault()} onClick={()=>execute('removeRow')} disabled={rowCount<=1}><Minus size={12}/> {uiT('admin.study_table.row','Row')}</button>
      <span className="vop-table-tool-divider"/>
      <button type="button" title={uiT('admin.study_table.column_before_title','Add column before selected cell')} onMouseDown={e=>e.preventDefault()} onClick={()=>execute('colBefore')} disabled={colCount>=MAX_COLS}><Columns3 size={12}/> {uiT('admin.study_table.before','Before')}</button>
      <button type="button" title={uiT('admin.study_table.column_after_title','Add column after selected cell')} onMouseDown={e=>e.preventDefault()} onClick={()=>execute('colAfter')} disabled={colCount>=MAX_COLS}><Columns3 size={12}/> {uiT('admin.study_table.after','After')}</button>
      <button type="button" title={uiT('admin.study_table.remove_column_title','Remove selected column')} onMouseDown={e=>e.preventDefault()} onClick={()=>execute('removeCol')} disabled={colCount<=1}><Minus size={12}/> {uiT('admin.study_table.column','Column')}</button>
      <span className="vop-table-tool-divider"/>
      <button type="button" title={uiT('admin.study_table.header_title','Toggle first row as table header')}
        onMouseDown={e=>e.preventDefault()} onClick={()=>tableLayout('header')}>
        <PanelTop size={12}/> {uiT('admin.study_table.header','Header row')}</button>
      <button type="button" title={uiT('admin.study_table.equal_columns_title','Distribute columns evenly')}
        onMouseDown={e=>e.preventDefault()} onClick={()=>tableLayout('equal')}>
        <AlignJustify size={12}/> {uiT('admin.study_table.equal_columns','Equal columns')}</button>
      <button type="button" title={uiT('admin.study_table.fit_title','Fit columns to page width')}
        onMouseDown={e=>e.preventDefault()} onClick={()=>tableLayout('fit')}>
        <Maximize2 size={12}/> {uiT('admin.study_table.fit','Fit to page')}</button>
      <button type="button" className="vop-plate-table-delete"
        title={uiT('admin.study_table.delete_title','Delete entire table')}
        onMouseDown={e=>e.preventDefault()} onClick={()=>tableLayout('delete')}>
        <Trash2 size={12}/> {uiT('admin.study_table.delete','Delete table')}</button>
    </div>
    <div className="vop-plate-author-table-scroll">
      <table className="vop-plate-author-table" style={{width:widths.reduce((sum,width)=>sum+width,0)}}>
        <colgroup>{widths.map((width,index)=><col key={index} style={{width}}/>)}</colgroup>
        <tbody>{children}</tbody>
      </table>
    </div>
    </div>
  </PlateElement>;
}
function StudyRowElement({element,children,...props}:PlateElementProps){
  const row=element as {rowHeight?:number};
  return <PlateElement as="tr" element={element} style={row.rowHeight?{height:row.rowHeight}:undefined} {...props}>{children}</PlateElement>;
}
function StudyCellElement({element,children,...props}:PlateElementProps) {
  const editor=useEditorRef();
  const drag=(event:React.PointerEvent<HTMLSpanElement>,axis:'column'|'row')=>{
    if(event.button!==0)return;
    event.preventDefault();event.stopPropagation();
    const path=editor.api.findPath(element);
    if(!path||path.length<3)return;
    const tablePath=[path[0]],rowPath=[path[0],path[1]];
    const tableNode=(editor.children as unknown as TableElement[])[path[0]];
    if(!tableNode)return;
    const table=event.currentTarget.closest('table');
    if(!table)return;
    const col=path[2],row=path[1];
    const from=axis==='column'?event.clientX:event.clientY;
    const widths=widthList(tableNode,table.getBoundingClientRect().width);
    const originalWidth=widths[col];
    const originalNext=widths[col+1]??0;
    const atRightEdge=col===widths.length-1;
    const tr=table.rows[row];
    const originalHeight=tableNode.children[row]?.rowHeight||tr?.getBoundingClientRect().height||40;
    const cols=table.querySelectorAll('col');
    const move=(e:PointerEvent)=>{
      const delta=(axis==='column'?e.clientX:e.clientY)-from;
      if(axis==='column'){
        const bounded=atRightEdge
          ?clamp(originalWidth+delta,MIN_COLUMN_WIDTH,MAX_COLUMN_WIDTH)-originalWidth
          :Math.max(MIN_COLUMN_WIDTH-originalWidth,Math.min(delta,originalNext-MIN_COLUMN_WIDTH));
        (cols[col] as HTMLElement).style.width=(originalWidth+bounded)+'px';
        if(!atRightEdge)(cols[col+1] as HTMLElement).style.width=(originalNext-bounded)+'px';
      } else if(tr)tr.style.height=clamp(originalHeight+delta,MIN_ROW_HEIGHT,MAX_ROW_HEIGHT)+'px';
    };
    const release=(e:PointerEvent)=>{
      window.removeEventListener('pointermove',move);
      window.removeEventListener('pointerup',release);
      window.removeEventListener('pointercancel',cancel);
      const delta=(axis==='column'?e.clientX:e.clientY)-from;
      if(axis==='column'){
        const bounded=atRightEdge
          ?clamp(originalWidth+delta,MIN_COLUMN_WIDTH,MAX_COLUMN_WIDTH)-originalWidth
          :Math.max(MIN_COLUMN_WIDTH-originalWidth,Math.min(delta,originalNext-MIN_COLUMN_WIDTH));
        widths[col]=originalWidth+bounded;
        if(!atRightEdge)widths[col+1]=originalNext-bounded;
        editor.tf.setNodes({colWidths:widths} as never,{at:tablePath});
      } else if(axis==='row'){
        editor.tf.setNodes({rowHeight:clamp(originalHeight+delta,MIN_ROW_HEIGHT,MAX_ROW_HEIGHT)} as never,{at:rowPath});
      }
    };
    const cancel=()=>{
      window.removeEventListener('pointermove',move);
      window.removeEventListener('pointerup',release);
      window.removeEventListener('pointercancel',cancel);
      if(axis==='column'){
        (cols[col] as HTMLElement).style.width=originalWidth+'px';
        if(!atRightEdge&&cols[col+1])(cols[col+1] as HTMLElement).style.width=originalNext+'px';
      }else if(tr)tr.style.height=originalHeight+'px';
    };
    window.addEventListener('pointermove',move);
    window.addEventListener('pointerup',release);
    window.addEventListener('pointercancel',cancel);
  };
  const path=editor.api.findPath(element);
  const keyboardResize=(event:React.KeyboardEvent<HTMLSpanElement>,axis:'column'|'row')=>{
    const relevant=axis==='column'?['ArrowLeft','ArrowRight']:['ArrowUp','ArrowDown'];
    if(!relevant.includes(event.key))return;
    event.preventDefault();event.stopPropagation();
    const cellPath=editor.api.findPath(element);
    if(!cellPath||cellPath.length<3)return;
    const table=(editor.children as unknown as TableElement[])[cellPath[0]];
    if(!table)return;
    const row=cellPath[1],col=cellPath[2];
    const delta=(event.key==='ArrowLeft'||event.key==='ArrowUp'?-1:1)*(event.shiftKey?2:12);
    if(axis==='row'){
      const rowHeight=table.children[row].rowHeight||40;
      editor.tf.setNodes({rowHeight:clamp(rowHeight+delta,MIN_ROW_HEIGHT,MAX_ROW_HEIGHT)} as never,
        {at:[cellPath[0],row]});
    }else{
      const widths=widthList(table);
      const next=widths[col+1];
      const amount=next===undefined
        ?clamp(widths[col]+delta,MIN_COLUMN_WIDTH,MAX_COLUMN_WIDTH)-widths[col]
        :Math.max(MIN_COLUMN_WIDTH-widths[col],Math.min(delta,next-MIN_COLUMN_WIDTH));
      widths[col]+=amount;
      if(next!==undefined)widths[col+1]-=amount;
      editor.tf.setNodes({colWidths:widths} as never,{at:[cellPath[0]]});
    }
  };
  const columnIndex=path?.[2]??0;
  const rowIndex=path?.[1]??0;
  const rows=(editor.children as unknown as TableElement[])[path?.[0]??-1];
  const count=rows?.children[0]?.children.length||1;
  return <PlateElement as={element.type==='th'?'th':'td'} element={element} {...props}>
    {children}
    {columnIndex<count&&
      <span contentEditable={false} tabIndex={0} className="vop-plate-col-resizer" role="separator"
        aria-label={'Resize column '+(columnIndex+1)}
        aria-orientation="vertical" aria-valuemin={MIN_COLUMN_WIDTH}
        aria-valuemax={MAX_COLUMN_WIDTH} aria-valuenow={rows?widthList(rows)[columnIndex]:145}
        onKeyDown={event=>keyboardResize(event,'column')} onPointerDown={e=>drag(e,'column')}/>}
    {columnIndex===0&&<span contentEditable={false} tabIndex={0} className="vop-plate-row-resizer" role="separator"
      aria-label={'Resize row '+(rowIndex+1)} aria-orientation="horizontal"
      aria-valuemin={MIN_ROW_HEIGHT} aria-valuemax={MAX_ROW_HEIGHT}
      aria-valuenow={rows?.children[rowIndex]?.rowHeight||40}
      onKeyDown={event=>keyboardResize(event,'row')} onPointerDown={e=>drag(e,'row')}/>}
  </PlateElement>;
}
export const StudyTablePlugin=createPlatePlugin({key:'studyTable',node:{isElement:true,type:'table'}}).withComponent(StudyTableElement);
export const StudyRowPlugin=createPlatePlugin({key:'studyRow',node:{isElement:true,type:'tr'}}).withComponent(StudyRowElement);
export const StudyHeaderCellPlugin=createPlatePlugin({key:'studyHeaderCell',node:{isElement:true,type:'th'}}).withComponent(StudyCellElement);
export const StudyCellPlugin=createPlatePlugin({key:'studyCell',node:{isElement:true,type:'td'}}).withComponent(StudyCellElement);
