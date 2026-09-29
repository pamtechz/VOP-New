import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import { MoreVertical } from 'lucide-react';

/** One compact, keyboard-accessible ellipsis menu per curriculum node. */
export function StructureActionsMenu({
  label,children,
}:{
  label:string;
  children:ReactNode;
}) {
  const [open,setOpen]=useState(false);
  const root=useRef<HTMLDivElement>(null);
  const trigger=useRef<HTMLButtonElement>(null);

  useEffect(()=>{
    if(!open)return;
    const outside=(event:PointerEvent)=>{
      if(root.current&&!root.current.contains(event.target as Node))setOpen(false);
    };
    const escape=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){
        event.preventDefault();
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener('pointerdown',outside);
    document.addEventListener('keydown',escape);
    return()=>{
      document.removeEventListener('pointerdown',outside);
      document.removeEventListener('keydown',escape);
    };
  },[open]);

  const closeAfterAction=(event:ReactMouseEvent<HTMLDivElement>)=>{
    // A select/input is part of an action form, not a completed command.
    if((event.target as HTMLElement).closest('button:not([disabled])'))setOpen(false);
  };

  return <div className={'vop-structure-actions-menu'+(open?' is-open':'')} ref={root}>
    <button ref={trigger} type="button" className="vop-structure-more"
      aria-label={label+' actions'} aria-haspopup="true" aria-expanded={open}
      title={label+' actions'} onClick={()=>setOpen(value=>!value)}>
      <MoreVertical size={17} strokeWidth={1.8} aria-hidden="true"/>
    </button>
    {open&&<div className="vop-structure-actions-popover" role="group"
      aria-label={label+' actions'} onClick={closeAfterAction}>
      {children}
    </div>}
  </div>;
}
