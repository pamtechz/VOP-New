import React,{useEffect,useMemo,useState} from 'react';
import {ArrowRight,Building2,Download,ExternalLink,LogIn,QrCode,ShieldCheck,UserPlus} from 'lucide-react';
import './invitation-landing.css';

type InvitePreview={
  organizationId:string;
  organizationName:string;
  role:string;
  status:string;
  expiresAt?:string;
  targetKind?:string;
  targetLabel?:string;
  targetPath?:string;
  emailBound?:boolean;
};

type Props={
  token:string;
  onSignIn:()=>void;
  onRegister:()=>void;
};

export function InvitationLandingPage({token,onSignIn,onRegister}:Props){
  const [item,setItem]=useState<InvitePreview|null>(null);
  const [error,setError]=useState('');
  const [loading,setLoading]=useState(true);
  const inviteUrl=useMemo(()=>window.location.origin+'/?invite='+encodeURIComponent(token),[token]);
  const nativeUrl='vop://invite?token='+encodeURIComponent(token);
  const androidDownloadUrl=String(import.meta.env.VITE_ANDROID_DOWNLOAD_URL||'').trim();

  useEffect(()=>{
    let cancelled=false;
    setLoading(true);setError('');
    void fetch('/api/admin/organizations',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({action:'previewInvite',token}),
    }).then(async response=>{
      const body=await response.json().catch(()=>({})) as {item?:InvitePreview;error?:string};
      if(cancelled)return;
      if(!response.ok||!body.item)throw new Error(body.error||'This invitation could not be opened.');
      setItem(body.item);
    }).catch(reason=>{
      if(!cancelled)setError(reason instanceof Error?reason.message:'This invitation could not be opened.');
    }).finally(()=>{if(!cancelled)setLoading(false);});
    return()=>{cancelled=true};
  },[token]);

  const unavailable=item&&item.status!=='pending';
  return <main className="vop-invite-landing">
    <section className="vop-invite-landing-card">
      <div className="vop-invite-landing-brand">
        <img src="/assets/vop_logo_2.png" alt=""/>
        <div><strong>Voice of Prophecy</strong><span>Organization invitation</span></div>
      </div>

      {loading?<div className="vop-invite-landing-state" role="status">Checking invitation…</div>
      :error?<div className="vop-invite-landing-state error" role="alert">{error}</div>
      :item&&<>
        <div className="vop-invite-landing-icon"><Building2 size={28}/></div>
        <p className="vop-invite-landing-kicker">YOU HAVE BEEN INVITED</p>
        <h1>Join {item.organizationName}</h1>
        <p className="vop-invite-landing-copy">
          Sign in or create a VOP account first. You will then be shown the invitation and can choose whether to join.
        </p>

        <div className="vop-invite-landing-details">
          <div><span>Membership</span><strong>{item.role||'learner'}</strong></div>
          <div><span>Opens after joining</span><strong>{item.targetLabel||'Organization home'}</strong></div>
          <div><span>Invitation</span><strong>{item.status}</strong></div>
        </div>

        {unavailable?<div className="vop-invite-landing-state error">
          This invitation is {item.status}. Ask the organization member for a new invitation link.
        </div>:<>
          <div className="vop-invite-landing-actions">
            <button type="button" className="vop-primary" onClick={onRegister}><UserPlus size={17}/>Create account</button>
            <button type="button" className="vop-secondary" onClick={onSignIn}><LogIn size={17}/>Sign in</button>
          </div>

          <div className="vop-invite-native">
            <div><ShieldCheck size={19}/><span><strong>Use the native app</strong><small>If Voice of Prophecy is installed, open this invitation directly in the app.</small></span></div>
            <a className="vop-secondary" href={nativeUrl}><ExternalLink size={15}/>Open app</a>
            {androidDownloadUrl&&<a className="vop-secondary" href={androidDownloadUrl} target="_blank" rel="noopener noreferrer"><Download size={15}/>Download Android app</a>}
          </div>

          <div className="vop-invite-qr">
            <div><QrCode size={18}/><span><strong>Share or scan this invitation</strong><small>The QR contains the same HTTPS invitation link. A verified installed app can open it; otherwise it opens the website.</small></span></div>
            <img src={'https://quickchart.io/qr?size=240&text='+encodeURIComponent(inviteUrl)} alt="QR code for this Voice of Prophecy organization invitation"/>
            <a href={inviteUrl}>Continue on website <ArrowRight size={14}/></a>
          </div>
        </>}
      </>}
    </section>
  </main>;
}
