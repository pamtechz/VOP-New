from pathlib import Path
import re

root = Path('.')

# Generic admin record editor: move the right-column form into a modal.
p = root / 'src/pages/AdminRecordsPanel.tsx'
s = p.read_text()
if "const [editorOpen, setEditorOpen]" not in s:
    s = s.replace("  const [saving, setSaving] = useState(false);", "  const [saving, setSaving] = useState(false);\n  const [editorOpen, setEditorOpen] = useState(false);", 1)
s = s.replace("    setEditingId(null);\n    setForm(blankForm(kind));\n  };", "    setEditingId(null);\n    setForm(blankForm(kind));\n    setEditorOpen(true);\n  };", 1)
s = s.replace("    setForm({ ...blankForm(kind), ...next });\n  };", "    setForm({ ...blankForm(kind), ...next });\n    setEditorOpen(true);\n  };", 1)
s = s.replace("      setMessage(editingId ? 'Record updated.' : 'Record created.');\n      openNew();", "      setMessage(editingId ? 'Record updated.' : 'Record created.');\n      setEditingId(null);\n      setForm(blankForm(kind));\n      setEditorOpen(false);", 1)
old = '''      <div className="vop-admin-record-layout">
        <div className="vop-table-wrap">
          <table className="vop-table">
            <thead><tr>{tableHeaders(kind).map(header=><th key={header}>{header}</th>)}<th>Actions</th></tr></thead>
            <tbody>
              {visibleRecords.map((record,index)=><tr key={record.id}>
                <td>{index+1}</td>
                {tableCells(kind, record)}
                <td><div style={{display:'flex',gap:7}}><button className="vop-actions" type="button" disabled={record.canEdit === false || !canUpdate} title={record.canEdit === false ? 'Owned by another contributor' : !canUpdate ? 'Permission denied' : 'Edit'} onClick={()=>edit(record)}><Edit3 size={15}/></button><button className="vop-actions" type="button" disabled={record.canEdit === false || !canDelete} title={record.canEdit === false ? 'Owned by another contributor' : !canDelete ? 'Permission denied' : 'Delete'} onClick={()=>void remove(record.id)}><Trash2 size={15}/></button></div></td>
              </tr>)}
            </tbody>
          </table>
          {visibleRecords.length===0 && <div className="vop-empty">No {primaryTitle.toLowerCase()} records are configured.</div>}
        </div>
        <form className="vop-card vop-form-card" onSubmit={save}>
          <div className="vop-section-title"><div><h2>{actionLabel}</h2><p>Changes are saved securely to the configured content store.</p></div><div className="vop-heading-icon" style={{width:46,height:46}}><Plus size={22}/></div></div>
          <Fields kind={kind} form={form} setForm={setForm} records={[...records, ...relatedRecords]}/>
          <div style={{display:'flex',gap:9,marginTop:18}}><button type="button" className="vop-secondary" style={{flex:1}} onClick={openNew}>{t('common.clear','Clear')}</button><button type="submit" className="vop-primary" style={{flex:1,justifyContent:'center'}} disabled={saving}><Save size={16}/>{saving?'Saving…':actionLabel}</button></div>
        </form>
      </div>'''
new = '''      <div className="vop-admin-record-layout vop-admin-record-list-only">
        <div className="vop-table-wrap">
          <table className="vop-table">
            <thead><tr>{tableHeaders(kind).map(header=><th key={header}>{header}</th>)}<th>Actions</th></tr></thead>
            <tbody>
              {visibleRecords.map((record,index)=><tr key={record.id}>
                <td>{index+1}</td>
                {tableCells(kind, record)}
                <td><div style={{display:'flex',gap:7}}><button className="vop-actions" type="button" disabled={record.canEdit === false || !canUpdate} title={record.canEdit === false ? 'Owned by another contributor' : !canUpdate ? 'Permission denied' : 'Edit'} onClick={()=>edit(record)}><Edit3 size={15}/></button><button className="vop-actions" type="button" disabled={record.canEdit === false || !canDelete} title={record.canEdit === false ? 'Owned by another contributor' : !canDelete ? 'Permission denied' : 'Delete'} onClick={()=>void remove(record.id)}><Trash2 size={15}/></button></div></td>
              </tr>)}
            </tbody>
          </table>
          {visibleRecords.length===0 && <div className="vop-empty">No {primaryTitle.toLowerCase()} records are configured.</div>}
        </div>
      </div>
      {editorOpen && <div className="vop-admin-editor-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)setEditorOpen(false)}}>
        <form className="vop-admin-editor-modal" onSubmit={save}>
          <div className="vop-section-title"><div><h2>{actionLabel}</h2><p>Changes are saved securely to the configured content store.</p></div><button type="button" className="vop-icon-button" onClick={()=>setEditorOpen(false)} aria-label="Close"><X size={18}/></button></div>
          <div className="vop-admin-editor-scroll"><Fields kind={kind} form={form} setForm={setForm} records={[...records, ...relatedRecords]}/></div>
          <div style={{display:'flex',gap:9,marginTop:18}}><button type="button" className="vop-secondary" style={{flex:1}} onClick={()=>{setEditorOpen(false);setEditingId(null);setForm(blankForm(kind))}}>{t('common.cancel','Cancel')}</button><button type="submit" className="vop-primary" style={{flex:1,justifyContent:'center'}} disabled={saving}><Save size={16}/>{saving?'Saving…':actionLabel}</button></div>
        </form>
      </div>}'''
if old not in s:
    raise SystemExit('generic admin editor block not found')
s = s.replace(old, new, 1)

# Announcements: use the same top-button/modal pattern.
if "function AnnouncementAdminDashboard" in s and "const [announcementEditorOpen" not in s:
    marker = "  const [filter, setFilter] = useState<'all'|'published'|'scheduled'|'draft'|'archived'>('all');"
    if marker not in s: raise SystemExit('announcement state marker not found')
    s = s.replace(marker, marker + "\n  const [announcementEditorOpen, setAnnouncementEditorOpen] = useState(false);", 1)
s = s.replace("onClick={openNew} disabled={!canCreate}><Plus size={17}/> New Announcement", "onClick={()=>{openNew();setAnnouncementEditorOpen(true)}} disabled={!canCreate}><Plus size={17}/> New Announcement", 1)
s = s.replace("  const visible = records.filter(item => {", "  const openAnnouncementEdit = (item: AdminRecord) => { edit(item); setAnnouncementEditorOpen(true); };\n  useEffect(()=>{ if(message) setAnnouncementEditorOpen(false); }, [message]);\n\n  const visible = records.filter(item => {", 1)
s = s.replace("onClick={()=>edit(item)}", "onClick={()=>openAnnouncementEdit(item)}", 1)
form_pattern = re.compile(r'\n      <form className="vop-card vop-form-card" onSubmit=\{save\}>.*?</form>', re.S)
m = form_pattern.search(s[s.index('function AnnouncementAdminDashboard'):])
if not m: raise SystemExit('announcement inline form not found')
start = s.index('function AnnouncementAdminDashboard') + m.start()
end = s.index('function AnnouncementAdminDashboard') + m.end()
modal = '''\n      {announcementEditorOpen && <div className="vop-ann-editor-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)setAnnouncementEditorOpen(false)}}>\n        <form className="vop-ann-editor-modal vop-card vop-form-card" onSubmit={save}>\n          <div className="vop-section-title"><div><h2>{editingId?'Edit Announcement':'New Announcement'}</h2><p>Use actual configured content. Nothing is inserted as sample data.</p></div><button type="button" className="vop-icon-button" onClick={()=>setAnnouncementEditorOpen(false)}><X size={18}/></button></div>\n          {field('title','Title *')}{field('tag','Category / Tag')}{field('targetAudience','Target Audience')}{area('description','Description *')}{field('imageUrl','Image URL','url')}{field('actionText','Action Text')}{field('actionUrl','Action URL','url')}{field('scheduledAt','Scheduled For','datetime-local')}<div className="vop-setting-row"><div><div className="vop-setting-name">{t('admin.published','Published')}</div><div className="vop-setting-help">Published announcements appear in the public announcements experience.</div></div><button type="button" className={'vop-toggle '+(form.published?'on':'')} onClick={()=>setForm(current=>({...current,published:!Boolean(current.published)}))}><span/></button></div><div style={{display:'flex',gap:8,marginTop:14}}><button className="vop-secondary" type="button" onClick={()=>setAnnouncementEditorOpen(false)}>{t('common.cancel','Cancel')}</button><button className="vop-primary" type="submit" disabled={saving || (editingId ? !canUpdate : !canCreate)}><Save size={16}/>{saving?'Saving…':editingId?'Save Changes':'Create Announcement'}</button></div>\n        </form>\n      </div>}'''
s = s[:start] + modal + s[end:]

# Radio: the existing Broadcast Studio modal is the editor; remove the permanent Add Live Stream card.
radio_start = s.find('          <div className="vop-radio-admin-add-card">')
if radio_start >= 0:
    radio_end = s.find('          </div>\n        </div>\n      ) : (', radio_start)
    if radio_end < 0: raise SystemExit('radio add-card boundary not found')
    s = s[:radio_start] + s[radio_end:]

p.write_text(s)

# Persist publish state as a strict boolean.
p = root / 'api/admin/content.ts'
s = p.read_text()
old = "          ...incoming,\n          id,\n          organizationId: '',"
new = "          ...incoming,\n          id,\n          ...(Object.prototype.hasOwnProperty.call(incoming, 'published') ? { published: incoming.published === true } : {}),\n          organizationId: '',"
if old not in s: raise SystemExit('global upsert marker not found')
s = s.replace(old, new, 1)
old = "          ...incoming,\n          id,\n          organizationId: effectiveOrganizationId,"
new = "          ...incoming,\n          id,\n          ...(Object.prototype.hasOwnProperty.call(incoming, 'published') ? { published: incoming.published === true } : {}),\n          organizationId: effectiveOrganizationId,"
if old not in s: raise SystemExit('organization upsert marker not found')
s = s.replace(old, new, 1)
p.write_text(s)

# Candidate enrollment API.
p = root / 'api/admin/candidates.ts'
s = p.read_text()
if "import { getAuth } from 'firebase-admin/auth';" not in s:
    s = s.replace("import { FieldValue } from 'firebase-admin/firestore';", "import { FieldValue } from 'firebase-admin/firestore';\nimport { getAuth } from 'firebase-admin/auth';\nimport { getApps } from 'firebase-admin/app';", 1)
marker = "    if (body.action !== 'updateBaptism') return response.status(400).json({ error: 'Unsupported candidate action.' });"
if marker not in s: raise SystemExit('candidate action marker not found')
enroll = r'''    if (body.action === 'enroll') {
      const requestedOrganizationId = typeof body.organizationId === 'string' ? body.organizationId.trim() : '';
      const ctx = await authenticateTenant(request, requestedOrganizationId || undefined);
      await requirePermission(ctx, 'users', 'create');
      if (ctx.tenantType === 'hierarchy') {
        if (!requestedOrganizationId || !(await organizationInHierarchyScope(ctx, requestedOrganizationId))) return response.status(403).json({ error: 'The selected organization is outside your hierarchy scope.' });
      } else {
        requireOrgRole(ctx, ['owner','admin']);
      }
      const organizationId = ctx.organizationId || requestedOrganizationId;
      if (!organizationId) throw new Error('An organization is required for candidate enrollment.');
      const displayName = typeof body.displayName === 'string' ? body.displayName.trim() : '';
      const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
      const phoneNumber = typeof body.phoneNumber === 'string' ? body.phoneNumber.trim() : '';
      const password = typeof body.password === 'string' ? body.password : '';
      const guideId = typeof body.guideId === 'string' ? body.guideId.trim() : '';
      if (!displayName || !email || !guideId) return response.status(400).json({ error: 'Full name, email and course are required.' });
      if (password && password.length < 6) return response.status(400).json({ error: 'Password must contain at least 6 characters.' });
      const guideRef = ctx.db.doc('guides/' + guideId);
      const guide = await guideRef.get();
      if (!guide.exists) throw new Error('The selected course was not found.');
      const guideData = guide.data() || {};
      if (String(guideData.organizationId || '') !== organizationId) throw new Error('The selected course does not belong to this organization.');
      if (guideData.published !== true || guideData.archived === true) throw new Error('Only a published active course can be used for enrollment.');
      const authService = getAuth(getApps()[0]);
      let account;
      let created = false;
      try {
        account = await authService.getUserByEmail(email);
      } catch (error) {
        const code = String((error as {code?:unknown})?.code || '');
        if (code !== 'auth/user-not-found') throw error;
        account = await authService.createUser({ email, displayName, ...(phoneNumber ? { phoneNumber } : {}), ...(password ? { password } : {}), disabled:false });
        created = true;
      }
      const candidateRef = ctx.db.doc('users/' + account.uid);
      const existingSnapshot = await candidateRef.get();
      const existing = existingSnapshot.exists ? existingSnapshot.data() || {} : {};
      const existingOrg = String(existing.organizationId || '').trim();
      if (existingOrg && existingOrg !== organizationId) throw new Error('This email already belongs to another organization.');
      const now = new Date().toISOString();
      const oldInfo = (existing.information && typeof existing.information === 'object') ? existing.information as Record<string, unknown> : {};
      const oldProgress = (existing.progress && typeof existing.progress === 'object') ? existing.progress as Record<string, unknown> : {};
      const information = { ...oldInfo, enrollmentDate: String(oldInfo.enrollmentDate || now), graduating:false, graduated:false, baptismCandidate:Boolean(oldInfo.baptismCandidate), baptized:Boolean(oldInfo.baptized) };
      const progress = { ...oldProgress, discoverProgress:Number(oldProgress.discoverProgress || 0), completedGuidesCount:Number(oldProgress.completedGuidesCount || 0), totalGuidesCount:Number(oldProgress.totalGuidesCount || 0), guideScores:oldProgress.guideScores || {}, completedLessons:Array.isArray(oldProgress.completedLessons) ? oldProgress.completedLessons : [] };
      await ctx.db.runTransaction(async transaction => {
        transaction.set(candidateRef, { uid:account.uid, email, displayName:displayName || account.displayName || email.split('@')[0], ...(phoneNumber ? {phoneNumber} : {}), role:String(existing.role || 'student'), userType:'learner', organizationId, organizationRole:'learner', information, progress, updatedAt:FieldValue.serverTimestamp(), createdAt:existing.createdAt || FieldValue.serverTimestamp() }, { merge:true });
        transaction.set(ctx.db.doc('organizations/' + organizationId + '/members/' + account.uid), { uid:account.uid, organizationId, role:'learner', active:true, invitedBy:ctx.auth.uid, joinedAt:String(existing.joinedAt || now), updatedAt:now }, { merge:true });
        transaction.set(ctx.db.doc('courseEnrollments/' + organizationId + '_' + account.uid + '_' + guideId), { uid:account.uid, organizationId, guideId, source:'admin', enrolledBy:ctx.auth.uid, enrolledAt:FieldValue.serverTimestamp(), updatedAt:FieldValue.serverTimestamp(), status:'active' }, { merge:true });
      });
      await authService.setCustomUserClaims(account.uid, { role:String(existing.role || 'student'), organizationId, organizationRole:'learner' });
      const resetLink = !password ? await authService.generatePasswordResetLink(email).catch(() => null) : null;
      await writeTenantAudit(ctx, 'candidate.enroll', 'users/' + account.uid, undefined, { organizationId, guideId, created });
      return response.status(200).json({ ok:true, created, resetLink, candidate:{uid:account.uid,email,displayName:displayName || account.displayName || email.split('@')[0],organizationId,guideId} });
    }
'''
s = s.replace(marker, enroll + marker, 1)
p.write_text(s)

# Candidate enrollment page.
p = root / 'src/pages/CandidateEnrollment.tsx'
p.write_text(r'''import React, { useEffect, useState } from 'react';
import { Check, GraduationCap, Mail, Phone, Plus, UserPlus } from 'lucide-react';
import { auth } from '../lib/firebase';
import type { User } from '../types';

type Course = { id:string; title?:string; language?:string; published?:boolean; archived?:boolean };

export default function CandidateEnrollment({ currentUser }: { currentUser: User }) {
  const [courses,setCourses]=useState<Course[]>([]); const [courseId,setCourseId]=useState('');
  const [organizationId,setOrganizationId]=useState(String(currentUser.organizationId || ''));
  const [organizations,setOrganizations]=useState<Array<{id:string;name:string}>>([]);
  const [name,setName]=useState(''); const [email,setEmail]=useState(''); const [phone,setPhone]=useState(''); const [password,setPassword]=useState('');
  const [loading,setLoading]=useState(true); const [saving,setSaving]=useState(false); const [message,setMessage]=useState(''); const [error,setError]=useState('');

  useEffect(()=>{ void (async()=>{ try { if(!organizationId && auth.currentUser){ const token=await auth.currentUser.getIdToken(); const r=await fetch('/api/admin/users',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({action:'listOrganizations'})}); const b=await r.json().catch(()=>({})) as {items?:Array<{id:string;name:string}>;error?:string}; if(!r.ok) throw new Error(b.error||'Could not load organizations.'); const list=b.items||[]; setOrganizations(list); if(list[0]) setOrganizationId(list[0].id); } } catch(e){setError(e instanceof Error?e.message:'Could not load organizations.');} finally{setLoading(false);} })(); },[]);

  useEffect(()=>{ if(!organizationId || !auth.currentUser)return; void (async()=>{ try { const token=await auth.currentUser!.getIdToken(); const r=await fetch('/api/admin/content',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({action:'listGuides',collection:'guides',organizationId})}); const b=await r.json().catch(()=>({})) as {items?:Course[];error?:string}; if(!r.ok) throw new Error(b.error||'Could not load courses.'); setCourses((b.items||[]).filter(item=>item.published===true&&item.archived!==true)); } catch(e){setError(e instanceof Error?e.message:'Could not load courses.');} },)(); },[organizationId]);

  const submit=async(e:React.FormEvent)=>{e.preventDefault();setSaving(true);setError('');setMessage(''); try { if(!organizationId||!courseId||!name.trim()||!email.trim()) throw new Error('Organization, course, full name and email are required.'); if(password&&password.length<6) throw new Error('Password must contain at least 6 characters.'); const token=await auth.currentUser!.getIdToken(); const r=await fetch('/api/admin/candidates',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({action:'enroll',organizationId,displayName:name.trim(),email:email.trim(),phoneNumber:phone.trim(),password,guideId:courseId})}); const b=await r.json().catch(()=>({})) as {error?:string;created?:boolean;candidate?:{displayName?:string}}; if(!r.ok) throw new Error(b.error||'Candidate enrollment failed.'); setMessage(b.created?'Account created and candidate enrolled successfully.':'Existing account enrolled successfully.'); setName('');setEmail('');setPhone('');setPassword('');setCourseId(''); } catch(e){setError(e instanceof Error?e.message:'Candidate enrollment failed.');} finally{setSaving(false);} };

  return <div><div className="vop-page-header"><div><div className="vop-breadcrumb"><UserPlus size={15}/> Administration / Candidates</div><h1>Add Candidate</h1><p>Create the learner account and enroll the learner into a published course on one page.</p></div></div>{message&&<div className="vop-toast"><Check size={16}/>{message}</div>}{error&&<div role="alert" style={{background:'#fff1f1',border:'1px solid #ffcaca',color:'#b42318',padding:12,borderRadius:11,marginBottom:14}}>{error}</div>}<form className="vop-card vop-form-card" onSubmit={submit}><div className="vop-section-title"><div><h2>Candidate account & course enrollment</h2><p>Creates the account, organization membership and course enrollment together.</p></div><div className="vop-heading-icon"><GraduationCap size={28}/></div></div><div className="vop-form-grid">{organizations.length>0&&<div className="vop-field"><label>Organization *</label><select value={organizationId} onChange={e=>{setOrganizationId(e.target.value);setCourseId('')}}><option value="">Select organization</option>{organizations.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></div>}<div className="vop-field"><label>Course *</label><select value={courseId} onChange={e=>setCourseId(e.target.value)} disabled={loading||!organizationId}><option value="">Select a published course</option>{courses.map(course=><option key={course.id} value={course.id}>{course.title||course.id}{course.language?' · '+course.language.toUpperCase():''}</option>)}</select></div><div className="vop-field"><label>Full name *</label><input value={name} onChange={e=>setName(e.target.value)} placeholder="Candidate full name" required/></div><div className="vop-field"><label>Email *</label><div style={{display:'flex',gap:8,alignItems:'center'}}><Mail size={16}/><input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="candidate@example.org" required/></div></div><div className="vop-field"><label>Phone</label><div style={{display:'flex',gap:8,alignItems:'center'}}><Phone size={16}/><input value={phone} onChange={e=>setPhone(e.target.value)} placeholder="Optional phone number"/></div></div><div className="vop-field"><label>Temporary password <small>(optional)</small></label><input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Leave empty to send a reset link"/></div></div><div className="vop-setting-row" style={{marginTop:18}}><div><div className="vop-setting-name">Enrollment</div><div className="vop-setting-help">The candidate receives learner membership and an active course enrollment.</div></div><button className="vop-primary" type="submit" disabled={saving||loading||!courseId||!name.trim()||!email.trim()}><Plus size={17}/>{saving?'Creating & enrolling…':'Create account & enroll'}</button></div></form></div>;
}
''')

# Wire candidate page and language modal hook into AdminPage.
p = root / 'src/pages/AdminPage.tsx'
s = p.read_text()
if "import CandidateEnrollment from './CandidateEnrollment';" not in s:
    s = s.replace("import OrganizationManagement from './OrganizationManagement';", "import OrganizationManagement from './OrganizationManagement';\nimport CandidateEnrollment from './CandidateEnrollment';", 1)
# Replace the candidates rendering branch without touching the surrounding branches.
s, count = re.subn(r"\{activeTab==='candidates'&&.*?\}\n\s*\{activeTab==='curriculum'", "{activeTab==='candidates'&&<CandidateEnrollment currentUser={currentUser}/>}\n        {activeTab==='curriculum'", s, count=1, flags=re.S)
if count != 1: raise SystemExit('candidate branch could not be replaced')
if "const [languageEditorOpen" not in s:
    s = s.replace("  const [editingLanguage, setEditingLanguage] = useState<string | null>(null);", "  const [editingLanguage, setEditingLanguage] = useState<string | null>(null);\n  const [languageEditorOpen, setLanguageEditorOpen] = useState(false);", 1)
s = s.replace("      setEditingLanguage(language.code);\n      setLanguageDraft({", "      setEditingLanguage(language.code);\n      setLanguageEditorOpen(true);\n      setLanguageDraft({", 1)
s = s.replace("      setEditingLanguage(null);\n      setLanguageDraft({", "      setEditingLanguage(null);\n      setLanguageEditorOpen(true);\n      setLanguageDraft({", 1)
s = s.replace("      showMessage('Language saved.');\n      openLanguageEditor();", "      showMessage('Language saved.');\n      setLanguageEditorOpen(false);\n      openLanguageEditor();", 1)
p.write_text(s)

# Organization detail surface gets a stable hook for the modal/page treatment.
p = root / 'src/pages/OrganizationManagement.tsx'
s = p.read_text()
s = s.replace('<div className="vop-card vop-form-card">\n        {!selected?', '<div className={"vop-card vop-form-card vop-org-details-card" + (selected ? " is-open" : "")}>\n        {!selected?', 1)
p.write_text(s)

# CSS for the new modal editors and translation/reference layout.
p = root / 'src/pages/admin.css'
s = p.read_text()
css = '''\n.vop-admin-record-list-only{display:block!important}\n.vop-admin-editor-backdrop,.vop-ann-editor-backdrop{position:fixed;inset:0;z-index:1200;background:rgba(7,27,61,.48);backdrop-filter:blur(3px);display:flex;align-items:center;justify-content:center;padding:24px}\n.vop-admin-editor-modal,.vop-ann-editor-modal{width:min(760px,96vw);max-height:min(88vh,900px);overflow:hidden;background:#fff;border:1px solid #dbe5f2;border-radius:20px;box-shadow:0 28px 80px rgba(8,31,70,.25);padding:22px}\n.vop-admin-editor-scroll{max-height:65vh;overflow:auto;padding:4px 3px 4px 0}\n.vop-admin-editor-modal .vop-section-title,.vop-ann-editor-modal .vop-section-title{position:sticky;top:0;background:#fff;z-index:2;padding-bottom:12px;border-bottom:1px solid #edf1f6;margin-bottom:14px}\n.vop-icon-button{width:38px;height:38px;border:1px solid #d9e3ef;border-radius:10px;background:#fff;color:#193f78;display:grid;place-items:center;cursor:pointer}\n.vop-ann-editor-backdrop{z-index:1210}.vop-ann-editor-modal{overflow:auto;max-height:90vh}\n.vop-translation-target,.vop-translation-entries{grid-column:1 / -1}\n.vop-radio-admin-add-card{display:none!important}\n@media(max-width:900px){.vop-admin-editor-backdrop,.vop-ann-editor-backdrop{padding:12px}.vop-admin-editor-modal,.vop-ann-editor-modal{width:100%;max-height:94vh;border-radius:16px;padding:16px}.vop-admin-editor-scroll{max-height:72vh}.vop-translation-auto-row{grid-template-columns:1fr!important}}\n'''
if '.vop-admin-editor-backdrop' not in s: s += css
p.write_text(s)

print('patch complete')
