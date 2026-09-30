import React,{useEffect,useMemo,useState} from 'react';
import {Check,RefreshCw,Save,ShieldCheck,UserPlus,Users,X} from 'lucide-react';
import type {CustomLanguage} from '../../types';
import {auth} from '../../lib/firebase';
import './localization-governance.css';

type Application={id:string;uid?:string;displayName?:string;email?:string;roles?:string[];languages?:string[];status?:string;motivation?:string;experience?:string};
type Contributor={id:string;uid?:string;displayName?:string;email?:string;roles?:string[];languages?:string[];active?:boolean;source?:string};
type Policy={approvalThreshold:number;minimumRecommendations:number};

async function governance(action:string,payload:Record<string,unknown>={}){
  const user=auth?.currentUser;if(!user)throw new Error('Sign in first.');
  const token=await user.getIdToken();
  const response=await fetch('/api/localization-governance',{
    method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},
    body:JSON.stringify({action,...payload}),
  });
  const body=await response.json().catch(()=>({})) as Record<string,unknown>&{error?:string};
  if(!response.ok)throw new Error(body.error||'Localization governance request failed.');
  return body;
}

export function LocalizationGovernancePanel({languages}:{languages:CustomLanguage[]}){
  const [applications,setApplications]=useState<Application[]>([]);
  const [contributors,setContributors]=useState<Contributor[]>([]);
  const [policy,setPolicy]=useState<Policy>({approvalThreshold:90,minimumRecommendations:2});
  const [email,setEmail]=useState('');
  const [inviteRoles,setInviteRoles]=useState<string[]>(['translator']);
  const [inviteLanguages,setInviteLanguages]=useState<string[]>([]);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [error,setError]=useState('');

  const available=useMemo(()=>languages.filter(item=>item.enabled!==false&&item.code.toLowerCase()!=='en'),[languages]);
  const languageLabel=(code:string)=>available.find(item=>item.code.toLowerCase()===String(code).toLowerCase())?.name||String(code).toUpperCase();
  const load=async()=>{
    setError('');
    try{
      const [apps,people,status]=await Promise.all([
        governance('listApplications'),governance('listContributors'),governance('status'),
      ]);
      setApplications(((apps.items||[]) as Application[]).filter(item=>item.status==='pending'));
      setContributors((people.items||[]) as Contributor[]);
      if(status.policy)setPolicy(status.policy as Policy);
    }catch(reason){setError(reason instanceof Error?reason.message:'Localization governance could not be loaded.');}
  };
  useEffect(()=>{void load()},[]);

  const toggle=(value:string,list:string[],setter:(next:string[])=>void)=>
    setter(list.includes(value)?list.filter(item=>item!==value):[...list,value]);

  const decide=async(item:Application,decision:'approve'|'reject')=>{
    setBusy(true);setError('');setMessage('');
    try{
      await governance('decideApplication',{uid:item.uid||item.id,decision,roles:item.roles||[],languages:item.languages||[]});
      setMessage(decision==='approve'?'Localization contributor approved.':'Localization application rejected.');
      await load();
    }catch(reason){setError(reason instanceof Error?reason.message:'Application decision could not be saved.');}
    finally{setBusy(false);}
  };
  const invite=async()=>{
    setBusy(true);setError('');setMessage('');
    try{
      await governance('invite',{email:email.trim(),roles:inviteRoles,languages:inviteLanguages});
      setEmail('');setInviteLanguages([]);setMessage('Localization contributor invited.');
      await load();
    }catch(reason){setError(reason instanceof Error?reason.message:'Contributor invitation failed.');}
    finally{setBusy(false);}
  };
  const updateContributor=async(item:Contributor,nextActive:boolean)=>{
    setBusy(true);setError('');setMessage('');
    try{
      await governance('updateContributor',{
        uid:item.uid||item.id,roles:item.roles||['translator'],languages:item.languages||[],active:nextActive,
      });
      setMessage(nextActive?'Contributor access enabled.':'Contributor access disabled.');
      await load();
    }catch(reason){setError(reason instanceof Error?reason.message:'Contributor access could not be updated.');}
    finally{setBusy(false);}
  };
  const savePolicy=async()=>{
    setBusy(true);setError('');setMessage('');
    try{
      const result=await governance('updatePolicy',policy as unknown as Record<string,unknown>);
      if(result.policy)setPolicy(result.policy as Policy);
      setMessage('Localization consensus policy saved.');
    }catch(reason){setError(reason instanceof Error?reason.message:'Localization policy could not be saved.');}
    finally{setBusy(false);}
  };

  return <section className="vop-card vop-form-card vop-localization-admin">
    <div className="vop-section-title">
      <div><h2>Localization governance</h2><p>Platform languages are controlled here. Contributors translate or review without gaining organization administration rights.</p></div>
      <button className="vop-secondary" type="button" disabled={busy} onClick={()=>void load()}><RefreshCw size={15}/>Refresh</button>
    </div>
    {message&&<div className="vop-localization-message success"><Check size={15}/>{message}</div>}
    {error&&<div className="vop-localization-message error">{error}</div>}

    <div className="vop-localization-admin-grid">
      <div className="vop-localization-admin-card">
        <h3><ShieldCheck size={17}/> Reviewer consensus policy</h3>
        <label className="vop-field"><span>Automatic publish threshold (%)</span>
          <input type="number" min="50" max="100" value={policy.approvalThreshold} onChange={e=>setPolicy({...policy,approvalThreshold:Number(e.target.value)||90})}/></label>
        <label className="vop-field"><span>Minimum reviewer recommendations</span>
          <input type="number" min="1" max="20" value={policy.minimumRecommendations} onChange={e=>setPolicy({...policy,minimumRecommendations:Number(e.target.value)||2})}/></label>
        <small>When the recommendation set reaches the minimum and at least {policy.approvalThreshold}% recommend approval, the proposal is published automatically.</small>
        <button className="vop-primary" type="button" disabled={busy} onClick={()=>void savePolicy()}><Save size={15}/>Save policy</button>
      </div>

      <div className="vop-localization-admin-card">
        <h3><UserPlus size={17}/> Invite contributor</h3>
        <label className="vop-field"><span>VOP account email</span><input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="translator@example.org"/></label>
        <div className="vop-localization-language-pills">
          {['translator','reviewer'].map(role=><label key={role}><input type="checkbox" checked={inviteRoles.includes(role)} onChange={()=>toggle(role,inviteRoles,setInviteRoles)}/>{role==='translator'?'Translator':'Reviewer'}</label>)}
        </div>
        <div className="vop-localization-language-pills">
          {available.map(item=><label key={item.code}><input type="checkbox" checked={inviteLanguages.includes(item.code.toLowerCase())} onChange={()=>toggle(item.code.toLowerCase(),inviteLanguages,setInviteLanguages)}/>{item.name}</label>)}
        </div>
        <button className="vop-primary" type="button" disabled={busy||!email.trim()||!inviteRoles.length||!inviteLanguages.length} onClick={()=>void invite()}><UserPlus size={15}/>Invite contributor</button>
      </div>
    </div>

    <div className="vop-localization-admin-card">
      <h3><Users size={17}/> Pending applications <span>{applications.length}</span></h3>
      {!applications.length&&<div className="vop-empty">No localization applications are awaiting review.</div>}
      <div className="vop-localization-application-list">{applications.map(item=><article key={item.id}>
        <div><strong>{item.displayName||item.email||'Applicant'}</strong><small>{item.email}</small>
          <span>{(item.roles||[]).join(' + ')} · {(item.languages||[]).map(languageLabel).join(', ')}</span></div>
        {item.motivation&&<p>{item.motivation}</p>}
        <footer><button className="vop-secondary" type="button" disabled={busy} onClick={()=>void decide(item,'reject')}><X size={14}/>Reject</button>
          <button className="vop-primary" type="button" disabled={busy} onClick={()=>void decide(item,'approve')}><Check size={14}/>Approve</button></footer>
      </article>)}</div>
    </div>

    <div className="vop-localization-admin-card">
      <h3><ShieldCheck size={17}/> Active contributor directory <span>{contributors.length}</span></h3>
      {!contributors.length&&<div className="vop-empty">No localization contributors have been approved or invited yet.</div>}
      <div className="vop-localization-contributor-list">{contributors.map(item=><div key={item.id}>
        <span><strong>{item.displayName||item.email||'Contributor'}</strong><small>{item.email}</small></span>
        <span>{(item.roles||[]).join(' + ')}</span><span>{(item.languages||[]).map(languageLabel).join(', ')}</span>
        <button type="button" className={item.active===false?'vop-primary':'vop-secondary'} disabled={busy}
          onClick={()=>void updateContributor(item,item.active===false)}>{item.active===false?'Enable':'Disable'}</button>
      </div>)}</div>
    </div>
  </section>;
}
