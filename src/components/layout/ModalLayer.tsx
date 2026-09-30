import { useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import './modal-layer.css';

let modalLayerSequence=3000;

/**
 * Renders modal UI at document.body so local overflow/transform/stacking
 * contexts cannot cover it. Each newly mounted (or re-activated) modal gets
 * the highest layer number.
 */
export function ModalLayer({children}:{children:ReactNode}){
  const [zIndex,setZIndex]=useState(()=>++modalLayerSequence);
  if(typeof document==='undefined')return null;
  return createPortal(
    <div className="vop-modal-layer" style={{zIndex}}
      onPointerDownCapture={()=>setZIndex(++modalLayerSequence)}>
      {children}
    </div>,
    document.body,
  );
}
