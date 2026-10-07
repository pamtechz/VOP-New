import React, { useEffect, useState } from 'react';
import { ArrowLeft, Building2, Check, Mail, MapPin, Phone, Save, ShieldCheck, UserRound } from 'lucide-react';
import type { User } from '../types';
import { auth } from '../lib/firebase';
import './organization-account.css';

interface Props{
  currentUser:User;
  organizationName?:string;
  onBack:()=>void;
  onUpdated?:()=>Promise<void>|void;
  onOpenOrganization?:()=>void;
}

function roleLabel(value:unknown){
  const text=String(value||'staff').trim().replaceAll('_',' ');
  return text.replace(/\b\w/g,character=>character.toUpperCase());
}

export default function OrganizationAccountProfilePage({
  currentUser,organizationName,onBack,onUpdated,onOpenOrganization,
}:Props){
  const [displayName,setDisplayName]=useState(currentUser.displayName||'');
  const [phone,setPhone]=useState(currentUser.phoneNumber||'');
  const [whatsapp,setWhatsapp]=useState(currentUser.whatsappNumber||'');
  const [address,setAddress]=useState(currentUser.address||'');
  const [saving,setSaving]=useState(false);
  const [message,setMessage]=useState('');
  const [error,setError]=useState('');

  useEffect(()=>{
    setDisplayName(currentUser.displayName||'');
    setPhone(currentUser.phoneNumber||'');
    setWhatsapp(currentUser.whatsappNumber||'');
    setAddress(currentUser.address||'');
  },[currentUser.uid,currentUser.displayName,currentUser.phoneNumber,currentUser.whatsappNumber,currentUser.address]);

  const save=async(event:React.FormEvent)=>{
    event.preventDefault();
    if(!auth?.currentUser)return;
    setSaving(true);setMessage('');setError('');
    try{
      const token=await auth.currentUser.getIdToken();
      const response=await fetch('/api/admin/users',{
        method:'POST',
        headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},
        body:JSON.stringify({action:'updateOwnProfile',profile:{
          displayName:displayName.trim(),phoneNumber:phone.trim(),
          whatsappNumber:whatsapp.trim(),address:address.trim(),
        }}),
      });
      const body=await response.json().catch(()=>({})) as {error?:string};
      if(!response.ok)throw new Error(body.error||'Could not update your organization account profile.');
      await onUpdated?.();
      setMessage('Organization account profile updated.');
    }catch(reason){
      setError(reason instanceof Error?reason.message:'Could not update your organization account profile.');
    }finally{setSaving(false);}
  };

  const initial=(displayName||currentUser.email||'?').trim().slice(0,1).toUpperCase();
  return <section className="vop-org-account-page">
    <header className="vop-org-account-head">
      <div>
        <span className="vop-org-account-kicker"><Building2 size={15}/>Organization account</span>
        <h1>Profile</h1>
        <p>Your staff identity and contact details inside the organization portal. Learning progress and learner-profile fields are intentionally kept out of this workspace.</p>
      </div>
      <button type="button" className="vop-secondary" onClick={onBack}><ArrowLeft size={16}/>Back to admin panel</button>
    </header>

    {message&&<div className="vop-org-account-message success"><Check size={16}/>{message}</div>}
    {error&&<div className="vop-org-account-message error" role="alert">{error}</div>}

    <div className="vop-org-account-grid">
      <aside className="vop-card vop-org-account-summary">
        {currentUser.photoURL?<img src={currentUser.photoURL} alt="" className="vop-org-account-avatar"/>:<span className="vop-org-account-avatar initials">{initial}</span>}
        <h2>{displayName||currentUser.email||'Organization account'}</h2>
        <p>{currentUser.email}</p>
        <div className="vop-org-account-membership">
          <span><Building2 size={15}/><strong>{organizationName||'Your organization'}</strong></span>
          <span><ShieldCheck size={15}/>{roleLabel(currentUser.organizationRole||currentUser.role)}</span>
          <span className="vop-chip vop-account-type-org" style={{fontSize:11,fontWeight:750,padding:'3px 8px',borderRadius:6,display:'inline-flex',alignItems:'center',gap:4}}>
            <Building2 size={12}/> Organisation Account
          </span>
        </div>
        <p style={{fontSize:11,color:'var(--text-muted,#64748b)',marginTop:8,lineHeight:1.4}}>
          A personal account can manage an organisation account. Immediately an account has been assigned to an organisation, it assumes the organisation account type.
        </p>
        {onOpenOrganization&&<button type="button" className="vop-secondary" onClick={onOpenOrganization}><Building2 size={15}/>Organization details</button>}
      </aside>

      <form className="vop-card vop-org-account-form" onSubmit={save}>
        <div className="vop-org-account-section-title"><UserRound size={19}/><div><h2>Account details</h2><p>These fields describe the authenticated staff account. Organization assignment and permissions are controlled separately.</p></div></div>
        <div className="vop-form-grid">
          <div className="vop-field"><label>Display name</label><input value={displayName} maxLength={120} onChange={event=>setDisplayName(event.target.value)}/></div>
          <div className="vop-field"><label>Email</label><div className="vop-org-account-readonly"><Mail size={15}/>{currentUser.email||'Not configured'}</div></div>
          <div className="vop-field"><label>Phone number</label><div className="vop-org-account-input"><Phone size={15}/><input value={phone} maxLength={40} onChange={event=>setPhone(event.target.value)}/></div></div>
          <div className="vop-field"><label>WhatsApp number</label><div className="vop-org-account-input"><Phone size={15}/><input value={whatsapp} maxLength={40} onChange={event=>setWhatsapp(event.target.value)}/></div></div>
        </div>
        <div className="vop-field"><label>Address</label><div className="vop-org-account-input textarea"><MapPin size={15}/><textarea value={address} maxLength={500} rows={4} onChange={event=>setAddress(event.target.value)}/></div></div>
        <div className="vop-org-account-security-note"><ShieldCheck size={17}/><span>Your organization, role and permissions cannot be self-edited here. They remain controlled by tenant authorization and active membership.</span></div>
        <div className="vop-org-account-actions"><button className="vop-primary" type="submit" disabled={saving}><Save size={16}/>{saving?'Saving…':'Save profile'}</button></div>
      </form>
    </div>
  </section>;
}
