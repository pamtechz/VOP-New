import React,{useState} from 'react';
import {Table2} from 'lucide-react';
import {getTranslation,getUiLocale} from '../../services/i18n';
const uiT=(key:string,fallback:string)=>getTranslation(key,getUiLocale(),undefined,fallback,'StudyTableInsertPicker');
export const MAX_STUDY_TABLE_ROWS=20;
export const MAX_STUDY_TABLE_COLUMNS=12;
export const clampTableSize=(n:number,max:number)=>Number.isFinite(n)?Math.max(1,Math.min(max,Math.round(n))):1;

interface Props {
  rows:number;
  columns:number;
  onRowsChange:(rows:number)=>void;
  onColumnsChange:(columns:number)=>void;
  onInsert:(rows:number,columns:number)=>void;
}
const GRID_ROWS=8;
const GRID_COLS=10;
/** A real cell-based Word-style insert grid, not four narrow preset buttons. */
export function StudyTableInsertPicker({rows,columns,onRowsChange,onColumnsChange,onInsert}:Props) {
  const [hover,setHover]=useState<{row:number;col:number}|null>(null);
  const [gridFocus,setGridFocus]=useState<{row:number;col:number}>({row:1,col:1});
  const selected=hover||gridFocus;
  const insert=(r:number,c:number)=>onInsert(clampTableSize(r,MAX_STUDY_TABLE_ROWS),clampTableSize(c,MAX_STUDY_TABLE_COLUMNS));
  return <section className="vop-study-table-picker" aria-label={uiT('admin.study_table.insert_options','Insert table options')}>
    <div className="vop-study-table-picker-title">{uiT('admin.study_table.hover_select','Select table size')}</div>
    <div className="vop-study-table-grid" role="group"
      aria-label={uiT('admin.study_table.grid_picker','Table size grid')} onMouseLeave={()=>setHover(null)}>
      {Array.from({length:GRID_ROWS*GRID_COLS},(_,index)=>{
        const row=Math.floor(index/GRID_COLS)+1;
        const col=index%GRID_COLS+1;
        const active=row<=selected.row&&col<=selected.col;
        return <button key={index} type="button"
          className={'vop-study-table-grid-cell'+(active?' selected':'')}
          onMouseEnter={()=>setHover({row,col})}
          onFocus={()=>setGridFocus({row,col})}
          onClick={()=>insert(row,col)}
          title={row+' × '+col}
          aria-label={uiT('admin.study_table.grid_size','Insert table')+' '+row+' × '+col}
          aria-pressed={active} />;
      })}
    </div>
    <div className="vop-study-table-grid-count" aria-live="polite">
      {selected.col} × {selected.row} {uiT('admin.study_table.table','Table')}
    </div>
    <div className="vop-study-table-picker-custom">
      <strong>{uiT('admin.study_plate_editor.custom_table_size','Custom table size')}</strong>
      <div className="vop-study-table-size-inputs">
        <label>
          <span>{uiT('admin.study_plate_editor.columns','Columns')}</span>
          <input type="number" inputMode="numeric" min={1} max={MAX_STUDY_TABLE_COLUMNS}
            value={columns} onChange={e=>onColumnsChange(clampTableSize(Number(e.target.value),MAX_STUDY_TABLE_COLUMNS))}/>
        </label>
        <label>
          <span>{uiT('admin.study_plate_editor.rows','Rows')}</span>
          <input type="number" inputMode="numeric" min={1} max={MAX_STUDY_TABLE_ROWS}
            value={rows} onChange={e=>onRowsChange(clampTableSize(Number(e.target.value),MAX_STUDY_TABLE_ROWS))}/>
        </label>
      </div>
      <button type="button" className="vop-study-table-insert-button" onClick={()=>insert(rows,columns)}>
        <Table2 size={16}/>
        {uiT('admin.study_table.insert_button','Insert table')} {columns} × {rows}
      </button>
    </div>
    <p className="vop-study-table-hint">{uiT('admin.study_table.edit_tip','Click a cell to edit the table. Drag borders to resize, and use Tab to move to the next cell.')}</p>
  </section>;
}
