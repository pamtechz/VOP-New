import React,{useEffect,useMemo,useState} from 'react';
import { CheckCircle2, Globe2, Plus, Send, UserCheck, XCircle } from 'lucide-react';
import {
  localizationRequest,type LocalizationAccessRequest,type LocalizationApplication,type LocalizationCollaborator,
  type LocalizationLanguage,type LocalizationRole,
} from '../../services/localizationWorkflow';
import { LocalizationTranslationStudio } from './LocalizationTranslationStudio';
import './localization-workflow.css';

type StatusResponse={
  application?:LocalizationApplication|null;
  collaborator?:LocalizationCollaborator|null;
  languages?:LocalizationLanguage[];
  accessRequests?:LocalizationAccessRequest[];
};
export function LocalizationParticipation(){
  const [application,setApplication]=useState<LocalizationApplication|null>(null);
  const [collaborator,setCollaborator]=useState<LocalizationCollaborator|null>(null);
  const [languages,setLanguages]=useState<LocalizationLanguage[]>([]);
  const [accessRequests,setAccessRequests]=useState<LocalizationAccessRequest[]>([]);
  const [selectedLanguages,setSelectedLanguages]=useState<string[]>([]);
  const [requestedRoles,setRequestedRoles]=useState<LocalizationRole[]>(['translator']);
  const [note,setNote]=useState('');
  const [accessKind,setAccessKind]=useState<'existing_language'|'new_language'>('existing_language');
  const [accessLanguage,setAccessLanguage]=useState('');
  const [newLanguageCode,setNewLanguageCode]=useState('');
  const [newLanguageName,setNewLanguageName]=useState('');
  const [newLanguageNativeName,setNewLanguageNativeName]=useState('');
  const [accessReason,setAccessReason]=useState('');
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [error,setError]=useState('');

  const assignedLanguages=useMemo(()=>collaborator?.languages||[],[collaborator]);
  const canTranslate=collaborator?.status==='active'&&collaborator.roles?.includes('translator');
  const requestableLanguages=useMemo(()=>languages.filter(language=>
    !assignedLanguages.includes('*')&&!assignedLanguages.includes(language.code)),[languages,assignedLanguages]);

  const refresh=async()=>{
    try{
      const status=await localizationRequest<StatusResponse>('status');
      setApplication(status.application||null);
      setCollaborator(status.collaborator||null);
      setLanguages(status.languages||[]);
      setAccessRequests(status.accessRequests||[]);
      setError('');
    }catch(reason){setError(reason instanceof Error?reason.message:'Could not load localization access.');}
  };
  useEffect(()=>{void refresh()},[]);

  const toggleLanguage=(code:string)=>setSelectedLanguages(current=>
    current.includes(code)?current.filter(item=>item!==code):[...current,code]);
  const toggleRole=(role:LocalizationRole)=>setRequestedRoles(current=>
    current.includes(role)?current.filter(item=>item!==role):[...current,role]);

  const apply=async()=>{
    if(!selectedLanguages.length)return setError('Choose at least one language.');
    if(!requestedRoles.length)return setError('Choose translator, reviewer, or both.');
    setBusy(true);setError('');setMessage('');
    try{
      await localizationRequest('apply',{languages:selectedLanguages,roles:requestedRoles,note});
      setMessage('Localization application submitted for Super Admin review.');
      await refresh();
    }catch(reason){setError(reason instanceof Error?reason.message:'Application could not be submitted.');}
    finally{setBusy(false);}
  };

  const invitationDecision=async(action:'acceptInvitation'|'declineInvitation')=>{
    setBusy(true);setError('');setMessage('');
    try{
      await localizationRequest(action);
      setMessage(action==='acceptInvitation'
        ?'Localization invitation accepted. Your assigned language workspace is now active.'
        :'Localization invitation declined.');
      window.dispatchEvent(new Event('vop_profile_updated'));
      await refresh();
    }catch(reason){setError(reason instanceof Error?reason.message:'Localization invitation could not be updated.');}
    finally{setBusy(false);}
  };

  const requestLanguageAccess=async()=>{
    if(accessKind==='existing_language'&&!accessLanguage)return setError('Choose the existing translation you want to work on.');
    if(accessKind==='new_language'&&(!newLanguageCode.trim()||!newLanguageName.trim()))
      return setError('Enter the new language code and language name.');
    setBusy(true);setError('');setMessage('');
    try{
      await localizationRequest('requestLanguageAccess',accessKind==='existing_language'
        ?{kind:accessKind,languageId:accessLanguage,reason:accessReason.trim()}
        :{kind:accessKind,code:newLanguageCode.trim().toLowerCase(),name:newLanguageName.trim(),
          nativeName:newLanguageNativeName.trim(),reason:accessReason.trim()});
      setAccessLanguage('');setNewLanguageCode('');setNewLanguageName('');setNewLanguageNativeName('');setAccessReason('');
      setMessage('Language access request submitted for Super Admin review.');
      await refresh();
    }catch(reason){setError(reason instanceof Error?reason.message:'Language access request could not be submitted.');}
    finally{setBusy(false);}
  };

  return <section className="vop-localization-participation vop-personal-card vop-card">
    <div className="vop-localization-title"><span><Globe2 size={20}/></span><div>
      <h2>Localization community</h2>
      <p>Translation access is invitation- or approval-based. Contributors only see the languages assigned to them.</p>
    </div></div>
    {error&&<div className="vop-localization-alert error">{error}</div>}
    {message&&<div className="vop-localization-alert success">{message}</div>}

    {collaborator?.status==='invited'&&<div className="vop-localization-invitation">
      <div className="vop-localization-status invited"><UserCheck size={17}/><span>
        You are invited as {(collaborator.roles||[]).join(' + ')} for {(collaborator.languages||[]).join(', ').toUpperCase()}.
        Translation access starts only after you accept.
      </span></div>
      <div className="vop-localization-invitation-actions">
        <button className="vop-secondary" type="button" disabled={busy} onClick={()=>void invitationDecision('declineInvitation')}><XCircle size={15}/>Decline</button>
        <button className="vop-primary" type="button" disabled={busy} onClick={()=>void invitationDecision('acceptInvitation')}><CheckCircle2 size={15}/>Accept invitation</button>
      </div>
    </div>}

    {!collaborator&&<div className="vop-localization-apply">
      <div className="vop-localization-status">
        {application?.status==='pending'?<><UserCheck size={17}/><span>Your application is awaiting review.</span></>
          :application?.status==='rejected'?<><XCircle size={17}/><span>Your previous application was not approved. You may submit an updated application.</span></>
          :<><Globe2 size={17}/><span>Anyone with a VOP account can apply.</span></>}
      </div>
      <div><strong>Languages you can work in</strong><div className="vop-localization-chips">
        {languages.map(language=><label key={language.code}><input type="checkbox" checked={selectedLanguages.includes(language.code)} onChange={()=>toggleLanguage(language.code)}/><span>{language.name}{language.nativeName?' · '+language.nativeName:''}</span></label>)}
      </div></div>
      <div><strong>How would you like to contribute?</strong><div className="vop-localization-chips">
        {(['translator','reviewer'] as LocalizationRole[]).map(role=><label key={role}><input type="checkbox" checked={requestedRoles.includes(role)} onChange={()=>toggleRole(role)}/><span>{role==='translator'?'Translator':'Reviewer'}</span></label>)}
      </div></div>
      <label>Experience or note<textarea value={note} maxLength={3000} onChange={event=>setNote(event.target.value)} placeholder="Tell the review team about your language experience."/></label>
      <button className="vop-primary" type="button" disabled={busy||application?.status==='pending'} onClick={()=>void apply()}><Send size={16}/> {application?.status==='pending'?'Application pending':'Apply for localization'}</button>
    </div>}

    {collaborator&&['declined','inactive'].includes(collaborator.status||'')&&<div className="vop-localization-status">
      <XCircle size={17}/><span>{collaborator.status==='declined'
        ?'You declined the localization invitation. A Super Admin can send a new invitation if needed.'
        :'Your localization contributor access is currently inactive.'}</span>
    </div>}

    {collaborator?.status==='active'&&<div className="vop-localization-collaborator">
      <div className="vop-localization-status active"><CheckCircle2 size={17}/><span>
        Active localization contributor · {(collaborator.roles||[]).join(' + ')} · {(collaborator.languages||[]).join(', ').toUpperCase()||'No languages assigned'}
      </span></div>

      <LocalizationTranslationStudio collaborator={collaborator} languages={languages}/>

      {canTranslate&&<div className="vop-localization-access">
        <h3><Plus size={16}/> Request another language</h3>
        <p>Request permission to update an existing platform translation, or propose a language that is not yet in VOP.</p>
        <div className="vop-localization-access-kinds">
          <label><input type="radio" name="localization-access-kind" checked={accessKind==='existing_language'} onChange={()=>setAccessKind('existing_language')}/><span>Existing translation</span></label>
          <label><input type="radio" name="localization-access-kind" checked={accessKind==='new_language'} onChange={()=>setAccessKind('new_language')}/><span>New language</span></label>
        </div>
        {accessKind==='existing_language'?<label>Existing language<select value={accessLanguage} onChange={event=>setAccessLanguage(event.target.value)}>
          <option value="">Choose a language not already assigned</option>
          {requestableLanguages.map(language=><option key={language.code} value={language.code}>{language.name}{language.nativeName?' · '+language.nativeName:''}</option>)}
        </select></label>:<div className="vop-localization-new-language">
          <label>Language code<input value={newLanguageCode} onChange={event=>setNewLanguageCode(event.target.value)} placeholder="e.g. bem"/></label>
          <label>Language name<input value={newLanguageName} onChange={event=>setNewLanguageName(event.target.value)} placeholder="e.g. Bemba"/></label>
          <label>Native name<input value={newLanguageNativeName} onChange={event=>setNewLanguageNativeName(event.target.value)} placeholder="Optional"/></label>
        </div>}
        <label>Why do you need access?<textarea value={accessReason} onChange={event=>setAccessReason(event.target.value)} maxLength={3000}/></label>
        <button className="vop-secondary" type="button" disabled={busy||(accessKind==='existing_language'&&!requestableLanguages.length)} onClick={()=>void requestLanguageAccess()}><Send size={15}/>Send request</button>
        {accessRequests.length>0&&<div className="vop-localization-access-history">
          <strong>Your language requests</strong>
          {accessRequests.map(item=><div key={item.id}><span>{item.name||item.languageCode.toUpperCase()} · {item.kind==='new_language'?'new language':'existing translation'}</span><b className={'vop-status '+(item.status==='approved'?'enabled':item.status==='rejected'?'disabled':'review')}>{item.status||'pending'}</b></div>)}
        </div>}
      </div>}
    </div>}
  </section>;
}
