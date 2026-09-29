import { useCallback, useEffect, useState } from 'react';
import { BookOpen, Globe, LockKeyhole, Plus, RefreshCw, Save, Share2, Trash2 } from 'lucide-react';
import { auth } from '../../lib/firebase';
import type { CustomLanguage } from '../../types';

export type TenantLanguage = CustomLanguage & {
  id:string; ownerUid?:string; canEdit?:boolean; adoptedByPlatform?:boolean;
  platformOwned?:boolean; sharingScope?:string;
};

async function languageAction(action:string, fields:Record<string,unknown>={}) {
  const current=auth?.currentUser;
  if (!current) throw new Error('Your session has expired. Sign in again.');
  const token=await current.getIdToken();
  const response=await fetch('/api/admin/languages',{
    method:'POST',
    headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},
    body:JSON.stringify({action,...fields}),
  });
  const payload=await response.json().catch(()=>({})) as {error?:string;items?:TenantLanguage[]};
  if (!response.ok) throw new Error(payload.error || 'The language operation failed.');
  return payload;
}

export async function getTenantLanguages():Promise<TenantLanguage[]> {
  const data=await languageAction('tenantlist');
  return Array.isArray(data.items)?data.items:[];
}

/** Organization language drafts never write into the global Languages registry.
 * Sharing is an explicit, irreversible server-side promotion to platform custody. */
export function TenantLanguagesPanel({onChanged}:{onChanged?:(items:CustomLanguage[])=>void}) {
  const [items,setItems]=useState<TenantLanguage[]>([]);
  const [code,setCode]=useState('');
  const [name,setName]=useState('');
  const [nativeName,setNativeName]=useState('');
  const [rtl,setRtl]=useState(false);
  const [enabled,setEnabled]=useState(true);
  const [editing,setEditing]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [message,setMessage]=useState('');

  const load=useCallback(async()=>{
    setBusy(true);setError('');
    try {
      const next=await getTenantLanguages();
      setItems(next);
      onChanged?.(next.filter(item=>item.enabled!==false));
    }catch(reason){
      setError(reason instanceof Error?reason.message:'Could not load organization languages.');
    }finally{setBusy(false);}
  },[onChanged]);
  useEffect(()=>{void load();},[load]);
  const clear=()=>{
    setCode('');setName('');setNativeName('');setRtl(false);setEnabled(true);setEditing(false);
  };
  const choose=(item:TenantLanguage)=>{
    setCode(item.code);setName(item.name);setNativeName(item.nativeName);
    setRtl(item.rtl===true);setEnabled(item.enabled!==false);setEditing(true);
    setError('');setMessage('');
  };
  const save=async()=>{
    if(!/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i.test(code.trim()) || !name.trim()) {
      setError('Enter a valid language code and display name.');return;
    }
    setBusy(true);setError('');setMessage('');
    try {
      await languageAction('tenantupsert',{
        code:code.trim().toLowerCase(),name:name.trim(),nativeName:nativeName.trim()||name.trim(),rtl,enabled,
      });
      clear();setMessage('Organization language saved.');await load();
    }catch(reason){setError(reason instanceof Error?reason.message:'Could not save the language.');}
    finally{setBusy(false);}
  };
  const remove=async(item:TenantLanguage)=>{
    if(!window.confirm('Delete this organization language? A language used in a guide or by learners cannot be removed.'))return;
    setBusy(true);setError('');
    try{
      await languageAction('tenantdelete',{code:item.code});
      clear();setMessage('Unused organization language deleted.');await load();
    }catch(reason){setError(reason instanceof Error?reason.message:'Could not delete the language.');}
    finally{setBusy(false);}
  };
  const share=async(item:TenantLanguage)=>{
    if(!window.confirm('Sharing transfers this language to VOP platform stewardship. Your organization will no longer be able to edit or delete the canonical language. Continue?'))return;
    setBusy(true);setError('');
    try{
      await languageAction('tenantshare',{code:item.code});
      clear();setMessage('Language transferred to the platform registry.');await load();
    }catch(reason){setError(reason instanceof Error?reason.message:'Could not share the language.');}
    finally{setBusy(false);}
  };
  return <section className="vop-reference-manager">
    <div className="vop-page-head">
      <div className="vop-heading"><div className="vop-heading-icon"><Globe size={26}/></div>
        <div><h1>Organization languages</h1><p>Create private language entries. Platform-wide languages and translations remain under Super Admin authority.</p></div>
      </div>
      <button type="button" className="vop-secondary" disabled={busy} onClick={()=>void load()}><RefreshCw size={17}/>Refresh</button>
    </div>
    <div className="vop-module-exam-banner"><LockKeyhole size={19}/><span>
      Your own unpublished language remains editable while unused. Once shared with other organizations, it transfers permanently to VOP platform stewardship. You can propose changes afterward.
    </span></div>
    {(error||message)&&<div role={error?'alert':'status'} className={error?'vop-alert error':'vop-toast'}>{error||message}</div>}
    <div className="vop-admin-record-layout">
      <div className="vop-reference-table-wrap">
        <table className="vop-reference-table"><thead><tr><th>Code</th><th>Language</th><th>Visibility</th><th>Actions</th></tr></thead>
          <tbody>{items.map(item=><tr key={item.code}>
            <td><strong>{item.code.toUpperCase()}</strong></td>
            <td><strong>{item.name}</strong><div className="vop-field-help">{item.nativeName}</div></td>
            <td><span className={'vop-status '+(item.adoptedByPlatform?'published':'draft')}>
              {item.adoptedByPlatform?'Platform stewarded':'Organization only'}</span></td>
            <td><div className="vop-reference-actions">
              <button className="vop-secondary" type="button" disabled={busy||item.canEdit===false}
                onClick={()=>choose(item)}>Edit</button>
              <button className="vop-secondary" type="button" disabled={busy||item.canEdit===false}
                title="Transfer to VOP platform stewardship" onClick={()=>void share(item)}><Share2 size={15}/>Share</button>
              <button className="vop-secondary vop-danger-button" type="button" disabled={busy||item.canEdit===false}
                onClick={()=>void remove(item)}><Trash2 size={15}/>Delete</button>
            </div></td>
          </tr>)}</tbody></table>
        {!items.length&&<div className="vop-empty"><BookOpen size={26}/><p>No organization-only languages yet.</p></div>}
      </div>
      <div className="vop-card vop-form-card">
        <h2>{editing?'Edit organization language':'Create organization language'}</h2>
        <div className="vop-field"><label htmlFor="tenant-language-code">Language code *</label>
          <input id="tenant-language-code" required value={code} disabled={busy||editing}
            maxLength={30} placeholder="e.g. bem" onChange={event=>setCode(event.target.value.toLowerCase())}/></div>
        <div className="vop-field"><label htmlFor="tenant-language-name">Display name *</label>
          <input id="tenant-language-name" required value={name} maxLength={120} disabled={busy}
            onChange={event=>setName(event.target.value)}/></div>
        <div className="vop-field"><label htmlFor="tenant-language-native">Native name</label>
          <input id="tenant-language-native" value={nativeName} maxLength={120} disabled={busy}
            onChange={event=>setNativeName(event.target.value)}/></div>
        <label className="vop-setting-row"><span>Right-to-left writing</span>
          <input type="checkbox" checked={rtl} onChange={event=>setRtl(event.target.checked)} disabled={busy}/></label>
        <label className="vop-setting-row"><span>Enabled in this organization</span>
          <input type="checkbox" checked={enabled} onChange={event=>setEnabled(event.target.checked)} disabled={busy}/></label>
        <div className="vop-reference-actions">
          <button type="button" className="vop-secondary" disabled={busy} onClick={clear}><Plus size={16}/>New</button>
          <button type="button" className="vop-primary" disabled={busy||!code.trim()||!name.trim()}
            onClick={()=>void save()}><Save size={16}/>{busy?'Working…':'Save language'}</button>
        </div>
      </div>
    </div>
  </section>;
}
