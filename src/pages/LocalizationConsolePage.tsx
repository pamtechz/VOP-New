import React from 'react';
import { ArrowLeft, Globe2, Languages, ShieldCheck } from 'lucide-react';
import type { User } from '../types';
import { LocalizationParticipation } from '../components/localization/LocalizationParticipation';

export default function LocalizationConsolePage({currentUser,onBack}:{currentUser:User;onBack:()=>void}){
  const access=currentUser.localizationAccess;
  const assigned=(access?.languages||[]).map(code=>code==='*'?'All enabled languages':code.toUpperCase());
  const roles=(access?.roles||[]).map(role=>role==='translator'?'Translator':'Reviewer');
  return <main className="vop-page-shell vop-localization-console">
    <header className="vop-page-head">
      <div>
        <button type="button" className="vop-secondary" onClick={onBack}><ArrowLeft size={17}/>Back</button>
        <span className="vop-kicker"><Globe2 size={15}/>Localization console</span>
        <h1>Translation & review workspace</h1>
        <p>Work only in the languages and roles assigned to your VOP localization account.</p>
      </div>
    </header>
    <section className="vop-card" style={{display:'grid',gap:12,marginBottom:16}}>
      <div style={{display:'flex',gap:10,alignItems:'center'}}>
        <span className="vop-heading-icon"><Languages size={20}/></span>
        <div><strong>Assigned languages</strong><p>{assigned.length?assigned.join(' · '):'No language has been assigned yet.'}</p></div>
      </div>
      <div style={{display:'flex',gap:10,alignItems:'center'}}>
        <span className="vop-heading-icon"><ShieldCheck size={20}/></span>
        <div><strong>Contributor role</strong><p>{roles.length?roles.join(' + '):'Awaiting assignment'}</p></div>
      </div>
      {access?.status==='invited'&&<p role="status">Your invitation is waiting for your decision. Accept it below to activate the assigned localization workspace.</p>}
    </section>
    <LocalizationParticipation/>
  </main>;
}
