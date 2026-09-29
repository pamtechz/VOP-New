import { useEffect, useMemo, useState } from 'react';
import { Check, Globe, RefreshCw, Save, Search, Send } from 'lucide-react';
import { auth } from '../../lib/firebase';
import { getStoredAutoLocalization } from '../../services/storage';
import { translationSourceLabel } from '../../services/i18n';
import { isEnglishLocale } from '../../../shared/locales';
import type { AutoLocalizationEntry, CustomLanguage } from '../../types';

type TranslationItem={key:string;value:string;status:string;canEdit:boolean};
async function request(action:string,locale:string,rest:Record<string,unknown>={}) {
  if(!auth?.currentUser)throw new Error('Sign in first.');
  const token=await auth.currentUser.getIdToken();
  const response=await fetch('/api/localization',{method:'POST',
    headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},
    body:JSON.stringify({action,locale,...rest}),
  });
  const result=await response.json().catch(()=>({})) as {
    error?:string;items?:TranslationItem[];count?:number;
  };
  if(!response.ok)throw new Error(result.error||'The translation request failed.');
  return result;
}

/** Tenant overrides affect only authenticated members of this organization.
 * Publishing an override never changes the canonical platform translation. */
export function TenantTranslationsPanel({languages}:{languages:CustomLanguage[]}) {
  const available=useMemo(()=>languages.filter(lang=>lang.enabled!==false&&!isEnglishLocale(lang.code)),[languages]);
  const [locale,setLocale]=useState('');
  const [entries,setEntries]=useState<AutoLocalizationEntry[]>([]);
  const [stored,setStored]=useState<TranslationItem[]>([]);
  const [values,setValues]=useState<Record<string,string>>({});
  const [search,setSearch]=useState('');
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState('');
  const [message,setMessage]=useState('');
  useEffect(()=>{
    const refresh=()=>setEntries(getStoredAutoLocalization().map(item=>({
      ...item,english:translationSourceLabel(item.key,item.english),
    })));
    refresh();
    window.addEventListener('vop_localization_discovered',refresh);
    return()=>window.removeEventListener('vop_localization_discovered',refresh);
  },[]);
  useEffect(()=>{
    if(!available.some(language=>language.code.toLowerCase()===locale.toLowerCase()))
      setLocale(available[0]?.code.toLowerCase()||'');
  },[available,locale]);
  useEffect(()=>{
    if(!locale){setStored([]);setValues({});return;}
    let cancelled=false;
    setError('');
    void request('tenantlist',locale).then(response=>{
      if(cancelled)return;
      const items=response.items||[];
      setStored(items);
      // Never reuse another tenant's device-cached translation text.
      setValues(Object.fromEntries(items.map(item=>[item.key,item.value])));
    }).catch(reason=>{if(!cancelled)setError(reason instanceof Error?reason.message:'Could not load translations.');});
    return()=>{cancelled=true;};
  },[locale]);
  const storedMap=useMemo(()=>new Map(stored.map(item=>[item.key,item])),[stored]);
  const display=useMemo(()=>{
    const keyMap=new Map(entries.map(entry=>[entry.key,entry]));
    stored.forEach(item=>{
      if(!keyMap.has(item.key))keyMap.set(item.key,{
        key:item.key,english:translationSourceLabel(item.key),component:'Stored entry',
        translations:{},discoveredAt:'',
      });
    });
    return [...keyMap.values()].filter(item=>
      !search.trim()||[item.english,item.component].join(' ').toLowerCase().includes(search.toLowerCase()))
      .sort((a,b)=>a.english.localeCompare(b.english));
  },[entries,stored,search]);
  const save=async()=>{
    if(!locale)return setError('Choose the target language.');
    const changed=Object.fromEntries(Object.entries(values).filter(([key,value])=>
      value.trim()&&storedMap.get(key)?.value!==value&&storedMap.get(key)?.canEdit!==false));
    if(!Object.keys(changed).length)return setMessage('No unsaved translations.');
    setSaving(true);setError('');setMessage('');
    try{
      const result=await request('tenantbulksave',locale,{values:changed});
      const response=await request('tenantlist',locale);
      setStored(response.items||[]);
      setValues(Object.fromEntries((response.items||[]).map(item=>[item.key,item.value])));
      setMessage((result.count||0)+' organization translations saved.');
      window.dispatchEvent(new CustomEvent('vop_ui_translation_updated',{detail:{locale}}));
    }catch(reason){setError(reason instanceof Error?reason.message:'Could not save translations.');}
    finally{setSaving(false);}
  };
  const suggest=async(key:string)=>{
    const value=values[key]||'';
    if(!value.trim())return setError('Enter a translation before proposing it.');
    setSaving(true);setError('');setMessage('');
    try{
      if(!auth?.currentUser)throw new Error('Sign in first.');
      const token=await auth.currentUser.getIdToken();
      const response=await fetch('/api/admin/content',{method:'POST',
        headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},
        body:JSON.stringify({action:'proposeTranslation',collection:'translations',
          languageId:locale,key,proposedValue:value.trim()}),
      });
      const body=await response.json().catch(()=>({})) as {error?:string};
      if(!response.ok)throw new Error(body.error||'Could not submit the proposal.');
      setMessage('Proposed translation submitted for Super Admin review.');
    }catch(reason){setError(reason instanceof Error?reason.message:'Could not submit proposal.');}
    finally{setSaving(false);}
  };
  return <section className="vop-reference-manager">
    <div className="vop-page-head"><div className="vop-heading"><div className="vop-heading-icon">
      <Globe size={26}/></div><div><h1>Organization translations</h1>
        <p>Translate detected interface text for your organization without changing system-wide wording.</p>
      </div></div><button type="button" className="vop-primary" disabled={saving||!locale}
        onClick={()=>void save()}><Save size={17}/>{saving?'Saving…':'Save translations'}</button>
    </div>
    <div className="vop-module-exam-banner"><Globe size={19}/>
      <span>These translations are available to members of your organization only. Platform-wide improvements require Super Admin review.</span>
    </div>
    {error&&<div role="alert" className="vop-alert error">{error}</div>}
    {message&&<div role="status" className="vop-toast">{message}</div>}
    <div className="vop-card vop-form-card">
      <div className="vop-form-grid">
        <div className="vop-field"><label htmlFor="tenant-translation-language">Target language</label>
          <select id="tenant-translation-language" value={locale} onChange={event=>setLocale(event.target.value)}>
            <option value="">Select language</option>
            {available.map(item=><option key={item.code} value={item.code.toLowerCase()}>{item.name} ({item.nativeName})</option>)}
          </select>
        </div>
        <div className="vop-field"><label htmlFor="tenant-translation-search">Search detected text</label>
          <div className="vop-search"><Search size={16}/><input id="tenant-translation-search" value={search}
            onChange={event=>setSearch(event.target.value)} placeholder="Search labels…"/></div>
        </div>
      </div>
      <div className="vop-translation-summary"><div><strong>{display.length}</strong><span>Available labels</span></div>
        <div><strong>{Object.values(values).filter(value=>value.trim()).length}</strong><span>Translated</span></div></div>
    </div>
    <div className="vop-card vop-form-card vop-translation-entries">
      <div className="vop-section-title"><div><h2>Detected translation entries</h2>
        <p>English is the source language. Only enter the translated wording.</p></div>
        <button className="vop-secondary" type="button" onClick={()=>window.dispatchEvent(new Event('vop_localization_discovered'))}>
          <RefreshCw size={16}/>Refresh detected</button></div>
      <div className="vop-translation-list">{display.map(item=><div className="vop-translation-row" key={item.key}>
        <div className="vop-translation-source"><strong>{item.english}</strong><small>{item.component}</small></div>
        <div className="vop-translation-input-wrap">
          <input aria-label={'Translation for '+item.english}
            placeholder="Enter your organization's translation" value={values[item.key]||''}
            disabled={!locale||saving||storedMap.get(item.key)?.canEdit===false}
            onChange={event=>setValues(current=>({...current,[item.key]:event.target.value}))}/>
          {storedMap.get(item.key)?.canEdit===false
            ? <small>Owned by another contributor</small>
            : values[item.key]?.trim()?<Check size={16} aria-hidden="true"/>:null}
          <button type="button" className="vop-secondary" disabled={saving||!values[item.key]?.trim()}
            onClick={()=>void suggest(item.key)} title="Send this wording for global review">
            <Send size={15}/>Propose globally</button>
        </div>
      </div>)}
      {!display.length&&<div className="vop-empty">No detected text yet. Open other pages, then refresh.</div>}
      </div>
    </div>
  </section>;
}
