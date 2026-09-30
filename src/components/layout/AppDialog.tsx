import { useEffect, useRef, useState, type FormEvent } from 'react';
import { createRoot } from 'react-dom/client';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { ModalLayer } from './ModalLayer';
import './app-dialog.css';

type DialogTone='info'|'warning'|'danger'|'success';
type DialogOptions={
  title?:string;
  confirmLabel?:string;
  cancelLabel?:string;
  tone?:DialogTone;
  defaultValue?:string;
  placeholder?:string;
};

type SurfaceProps={
  title:string;
  message:string;
  tone:DialogTone;
  mode:'alert'|'confirm'|'prompt';
  confirmLabel:string;
  cancelLabel:string;
  defaultValue?:string;
  placeholder?:string;
  onResolve:(value:boolean|string|null)=>void;
};

function DialogIcon({tone}:{tone:DialogTone}){
  if(tone==='danger'||tone==='warning')return <AlertTriangle size={21}/>;
  if(tone==='success')return <CheckCircle2 size={21}/>;
  return <Info size={21}/>;
}

function DialogSurface({
  title,message,tone,mode,confirmLabel,cancelLabel,defaultValue='',placeholder,onResolve,
}:SurfaceProps){
  const [value,setValue]=useState(defaultValue);
  const primaryRef=useRef<HTMLButtonElement>(null);
  const inputRef=useRef<HTMLInputElement>(null);
  useEffect(()=>{
    (mode==='prompt'?inputRef.current:primaryRef.current)?.focus();
    const key=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){
        event.preventDefault();
        onResolve(mode==='alert'?true:null);
      }
    };
    document.addEventListener('keydown',key);
    return()=>document.removeEventListener('keydown',key);
  },[mode,onResolve]);
  const submit=(event?:FormEvent)=>{
    event?.preventDefault();
    onResolve(mode==='prompt'?value:true);
  };
  return <ModalLayer>
    <div className="vop-app-dialog-backdrop" onMouseDown={event=>{
      if(event.target===event.currentTarget)onResolve(mode==='alert'?true:null);
    }}>
      <form className={'vop-app-dialog tone-'+tone} role={tone==='danger'?'alertdialog':'dialog'}
        aria-modal="true" aria-labelledby="vop-app-dialog-title" aria-describedby="vop-app-dialog-message"
        onSubmit={submit} onMouseDown={event=>event.stopPropagation()}>
        <div className="vop-app-dialog-head">
          <span className="vop-app-dialog-icon"><DialogIcon tone={tone}/></span>
          <div><h2 id="vop-app-dialog-title">{title}</h2>
            <p id="vop-app-dialog-message">{message}</p></div>
          <button type="button" className="vop-app-dialog-close" aria-label="Close"
            onClick={()=>onResolve(mode==='alert'?true:null)}><X size={18}/></button>
        </div>
        {mode==='prompt'&&<label className="vop-app-dialog-prompt">
          <span>Value</span>
          <input ref={inputRef} value={value} placeholder={placeholder}
            onChange={event=>setValue(event.target.value)}/>
        </label>}
        <div className="vop-app-dialog-actions">
          {mode!=='alert'&&<button type="button" className="vop-secondary"
            onClick={()=>onResolve(null)}>{cancelLabel}</button>}
          <button ref={primaryRef} type="submit"
            className={tone==='danger'?'vop-app-dialog-danger':'vop-primary'}>
            {confirmLabel}
          </button>
        </div>
      </form>
    </div>
  </ModalLayer>;
}

function openDialog(
  mode:SurfaceProps['mode'],
  message:string,
  options:DialogOptions={},
):Promise<boolean|string|null>{
  if(typeof document==='undefined')return Promise.resolve(mode==='alert'?true:null);
  const host=document.createElement('div');
  host.setAttribute('data-vop-dialog-host','');
  document.body.appendChild(host);
  const root=createRoot(host);
  let settled=false;
  return new Promise(resolve=>{
    const finish=(value:boolean|string|null)=>{
      if(settled)return;
      settled=true;
      resolve(value);
      window.setTimeout(()=>{
        root.unmount();
        host.remove();
      },0);
    };
    root.render(<DialogSurface
      title={options.title||(
        options.tone==='danger'?'Action required':
        options.tone==='warning'?'Please confirm':
        mode==='confirm'?'Confirm action':
        mode==='prompt'?'Enter information':'Notice'
      )}
      message={message}
      tone={options.tone||'info'}
      mode={mode}
      confirmLabel={options.confirmLabel||(mode==='confirm'?'Continue':'OK')}
      cancelLabel={options.cancelLabel||'Cancel'}
      defaultValue={options.defaultValue}
      placeholder={options.placeholder}
      onResolve={finish}
    />);
  });
}

export async function appConfirm(message:string,options:DialogOptions={}):Promise<boolean>{
  return (await openDialog('confirm',message,{tone:'warning',...options}))===true;
}

export async function appPrompt(message:string,options:DialogOptions={}):Promise<string|null>{
  const value=await openDialog('prompt',message,options);
  return typeof value==='string'?value:null;
}

export async function appAlert(message:string,options:DialogOptions={}):Promise<void>{
  await openDialog('alert',message,options);
}

export function AppAlertDialog({
  message,title='Action required',tone='danger',onClose,
}:{
  message:string;
  title?:string;
  tone?:DialogTone;
  onClose:()=>void;
}){
  if(!message)return null;
  return <DialogSurface title={title} message={message} tone={tone} mode="alert"
    confirmLabel="OK" cancelLabel="Cancel" onResolve={()=>onClose()}/>;
}
