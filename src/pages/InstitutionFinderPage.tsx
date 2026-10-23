import {useEffect,useState} from 'react';
import {ArrowLeft,BookOpen,Building2,Search,ShieldCheck} from 'lucide-react';
import type {User} from '../types';
import {auth} from '../lib/firebase';
import './institution-finder.css';

type Organization={
  id:string;name:string;slug:string;organizationType:string;
  city:string;billingCountry:string;isPublicMinistry:boolean;
};
type DirectoryResult={ok?:boolean;items?:Organization[];hasMore?:boolean;nextCursor?:string;error?:string};
type Props={currentUser:User;onBack:()=>void;onJoined:()=>Promise<void>;onContinue:()=>void};

async function directoryApi(action:'publicDirectory'|'joinInstitution',options:Record<string,unknown>):Promise<DirectoryResult>{
  const user=auth?.currentUser;
  if(!user)throw new Error('Sign in to find or join an organization.');
  const token=await user.getIdToken();
  const response=await fetch('/api/admin',{
    method:'POST',
    headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},
    body:JSON.stringify({__vopRoute:'organizations',action,...options}),
  });
  const result=await response.json().catch(()=>({error:'The directory is unavailable.'})) as DirectoryResult;
  if(!response.ok||result.ok!==true)throw new Error(result.error||'Could not complete the request.');
  return result;
}

/** Join only on deliberate confirmation. Personal study requires no organization. */
export default function InstitutionFinderPage({currentUser,onBack,onJoined,onContinue}:Props){
  const [search,setSearch]=useState('');
  const [items,setItems]=useState<Organization[]>([]);
  const [cursor,setCursor]=useState('');
  const [more,setMore]=useState(false);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [joining,setJoining]=useState('');
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const attached=Boolean(currentUser.organizationId);

  useEffect(()=>{
    let active=true;
    const timer=setTimeout(()=>{
      setLoading(true);setError('');setCursor('');setItems([]);
      void directoryApi('publicDirectory',{search:search.trim(),limit:30}).then(result=>{
        if(!active)return;
        setItems(result.items||[]);
        setCursor(result.nextCursor||'');setMore(result.hasMore===true);
      }).catch(reason=>{if(active)setError(reason instanceof Error?reason.message:'Directory unavailable.');})
        .finally(()=>{if(active)setLoading(false);});
    },search?350:0);
    return()=>{active=false;clearTimeout(timer);};
  },[search]);

  async function next(){
    if(loading||busy||!more||!cursor)return;
    setBusy(true);setError('');
    try{
      const result=await directoryApi('publicDirectory',{search:search.trim(),cursor,limit:30});
      setItems(previous=>[...new Map([...previous,...(result.items||[])].map(item=>[item.id,item])).values()]);
      setCursor(result.nextCursor||'');setMore(result.hasMore===true);
    }catch(reason){setError(reason instanceof Error?reason.message:'Could not load more institutions.');}
    finally{setBusy(false);}
  }

  async function join(org:Organization){
    if(attached||joining)return;
    if(!window.confirm('Join '+org.name+'? Your personal account and study history will remain yours.'))return;
    setJoining(org.id);setError('');setNotice('');
    try{
      await directoryApi('joinInstitution',{organizationId:org.id});
      await auth?.currentUser?.getIdToken(true);
      await onJoined();
      setNotice('You are now connected to '+org.name+'.');
      onContinue();
    }catch(reason){
      setError(reason instanceof Error?reason.message:'Could not join. Check your account membership before retrying.');
    }finally{setJoining('');}
  }
  return <main className="vop-institution-finder">
    <button type="button" onClick={onBack} className="vop-institution-back"><ArrowLeft size={17}/> Back</button>
    <section className="vop-institution-intro">
      <span><Building2 size={22}/> Connect when you are ready</span>
      <h1>Study independently or join a ministry</h1>
      <p>Church or organizational membership is optional. Your personal VOP account remains available while you study at your own pace.</p>
      <button type="button" className="vop-primary" onClick={onContinue}><BookOpen size={18}/> Continue independent Bible study</button>
      {attached&&<p role="status">Your account is already connected to an organization. Membership changes require a managed transfer; your studies remain available.</p>}
    </section>
    <section className="vop-institution-directory" aria-label="Organization directory">
      <h2>Find a participating organization</h2>
      <label htmlFor="vop-institution-search">Search by name, country or city</label>
      <div className="vop-institution-search"><Search size={18}/><input id="vop-institution-search" value={search} onChange={event=>setSearch(event.target.value)} placeholder="Search churches and ministries" autoComplete="off"/></div>
      {error&&<p role="alert" className="vop-institution-error">{error}</p>}
      {notice&&<p role="status">{notice}</p>}
      {loading?<p role="status">Loading participating institutions…</p>:items.length===0?<p>No institutions found. You can continue studying independently.</p>:
        <div className="vop-institution-list">{items.map(org=><article key={org.id} className="vop-institution-item">
          <div className="vop-institution-icon">{org.isPublicMinistry?<ShieldCheck size={21}/>:<Building2 size={21}/>}</div>
          <div><h3>{org.name}</h3><p>{[org.city,org.billingCountry].filter(Boolean).join(' · ')||org.organizationType||'Participating institution'}</p>
          {org.isPublicMinistry&&<small>Public VOP ministry</small>}</div>
          <button type="button" disabled={attached||Boolean(joining)} onClick={()=>void join(org)}>{joining===org.id?'Joining…':attached?'Connected elsewhere':'Join'}</button>
        </article>)}</div>}
      {more&&!loading&&<button type="button" className="vop-institution-more" onClick={()=>void next()} disabled={busy}>{busy?'Loading…':'Load more institutions'}</button>}
    </section>
  </main>;
}
