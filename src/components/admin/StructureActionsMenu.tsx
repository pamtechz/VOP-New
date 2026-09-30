import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import { MoreVertical } from 'lucide-react';
import { ModalLayer } from '../layout/ModalLayer';
import './structure-actions-menu.css';

type FloatingPosition={left:number;top?:number;bottom?:number;maxHeight:number;width:number};

export function StructureActionsMenu({
  label,children,
}:{
  label:string;
  children:ReactNode;
}) {
  const [open,setOpen]=useState(false);
  const [position,setPosition]=useState<FloatingPosition|null>(null);
  const root=useRef<HTMLDivElement>(null);
  const trigger=useRef<HTMLButtonElement>(null);
  const popover=useRef<HTMLDivElement>(null);

  const positionPopover=useCallback(()=>{
    const button=trigger.current;
    if(!button||typeof window==='undefined')return;
    const rect=button.getBoundingClientRect();
    const margin=10;
    const width=Math.min(340,Math.max(245,window.innerWidth-(margin*2)));
    const left=Math.min(
      Math.max(margin,rect.right-width),
      Math.max(margin,window.innerWidth-width-margin),
    );
    const below=Math.max(0,window.innerHeight-rect.bottom-margin);
    const above=Math.max(0,rect.top-margin);
    const openAbove=below<220&&above>below;
    const maxHeight=Math.max(140,Math.min(530,openAbove?above:below));
    setPosition(openAbove
      ?{left,bottom:Math.max(margin,window.innerHeight-rect.top+5),maxHeight,width}
      :{left,top:Math.max(margin,rect.bottom+5),maxHeight,width});
  },[]);

  useLayoutEffect(()=>{
    if(open)positionPopover();
  },[open,positionPopover]);

  useEffect(()=>{
    if(!open)return;
    const outside=(event:PointerEvent)=>{
      const target=event.target as Node;
      if(root.current?.contains(target)||popover.current?.contains(target))return;
      setOpen(false);
    };
    const escape=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){
        event.preventDefault();
        setOpen(false);
        trigger.current?.focus();
      }
    };
    const reposition=()=>positionPopover();
    document.addEventListener('pointerdown',outside);
    document.addEventListener('keydown',escape);
    window.addEventListener('resize',reposition);
    window.addEventListener('scroll',reposition,true);
    return()=>{
      document.removeEventListener('pointerdown',outside);
      document.removeEventListener('keydown',escape);
      window.removeEventListener('resize',reposition);
      window.removeEventListener('scroll',reposition,true);
    };
  },[open,positionPopover]);

  const closeAfterAction=(event:ReactMouseEvent<HTMLDivElement>)=>{
    if((event.target as HTMLElement).closest('button:not([disabled])'))setOpen(false);
  };

  const floatingStyle:CSSProperties|undefined=position?{
    left:position.left,top:position.top,bottom:position.bottom,maxHeight:position.maxHeight,
    width:position.width,
  }:undefined;

  return <div className={'vop-structure-actions-menu'+(open?' is-open':'')} ref={root}>
    <button ref={trigger} type="button" className="vop-structure-more"
      aria-label={label+' actions'} aria-haspopup="true" aria-expanded={open}
      title={label+' actions'} onClick={()=>setOpen(value=>!value)}>
      <MoreVertical size={17} strokeWidth={1.8} aria-hidden="true"/>
    </button>
    {open&&position&&<ModalLayer><div ref={popover}
      className="vop-structure-actions-popover is-portaled" role="group"
      aria-label={label+' actions'} style={floatingStyle} onClick={closeAfterAction}>
      {children}
    </div></ModalLayer>}
  </div>;
}
