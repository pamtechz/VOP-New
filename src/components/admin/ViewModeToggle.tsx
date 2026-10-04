import { LayoutGrid, List } from 'lucide-react';

export type AdminViewMode='table'|'cards';

export function ViewModeToggle({
  value,onChange,label='View mode',
}:{
  value:AdminViewMode;
  onChange:(mode:AdminViewMode)=>void;
  label?:string;
}){
  return <div className="vop-view-mode-toggle" role="group" aria-label={label}>
    <button type="button" className={value==='table'?'active':''}
      aria-pressed={value==='table'} onClick={()=>onChange('table')} title="Table view">
      <List size={16}/><span>Table</span>
    </button>
    <button type="button" className={value==='cards'?'active':''}
      aria-pressed={value==='cards'} onClick={()=>onChange('cards')} title="Card view">
      <LayoutGrid size={16}/><span>Cards</span>
    </button>
  </div>;
}
