import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity, ChevronLeft, ChevronRight, Download, Edit3, Eye, Filter, KeyRound,
  Plus, Search, Shield, ShieldCheck, Trash2, Upload, UserCheck, UserPlus, Users, X
} from 'lucide-react';
import { auth } from '../lib/firebase';
import { getTranslation } from '../services/i18n';
import { ModalLayer } from '../components/layout/ModalLayer';
import { AppAlertDialog, appConfirm } from '../components/layout/AppDialog';
import { ShimmerList } from '../components/layout/Shimmer';
import { StructureActionsMenu } from '../components/admin/StructureActionsMenu';
import { ViewModeToggle, type AdminViewMode } from '../components/admin/ViewModeToggle';
import './userManagement.css';

type ManagedUser = {
  uid: string;
  userCode: string;
  displayName: string;
  email: string;
  phoneNumber?: string;
  whatsappNumber?: string;
  photoURL?: string;
  role: string;
  roleLabel: string;
  roleColor: 'admin' | 'teacher' | 'mentor' | 'learner' | 'guest';
  userType: 'super_admin' | 'admin' | 'teacher' | 'mentor' | 'learner' | 'guest';
  accountType?: 'personal' | 'organization';
  disabled: boolean;
  status: 'Active' | 'Inactive';
  emailVerified: boolean;
  createdAt?: string;
  lastLogin?: string;
  conferenceId?: string;
  conferenceName?: string;
  districtId?: string;
  districtName?: string;
  unionId?: string;
  unionName?: string;
  adminNodeType?: string;
  adminNodeId?: string;
  organizationId?: string;
  organizationName?: string;
};

type OrganizationOption = { id: string; name: string; type?: string };
type TenantOrganization = { id: string; name: string; status: string };
type HierarchyNode = { id:string; name:string; code?:string };

type EditorState = {
  uid?: string;
  displayName: string;
  email: string;
  phoneNumber: string;
  whatsappNumber: string;
  userType: ManagedUser['userType'];
  assignmentMode: 'platform'|'organization'|'hierarchy';
  organizationId: string;
  adminNodeType: 'union'|'conference'|'district'|'church'|'';
  adminNodeId: string;
  password: string;
};

type Props = { onBack: () => void; scope?: { isSuperAdmin: boolean; organizationId?: string; role?: string } };

async function userApi<T = ManagedUser>(action: string, payload: Record<string, unknown> = {}) {
  if (!auth?.currentUser) throw new Error('Your session has expired. Sign in again.');
  const token = await auth.currentUser.getIdToken();
  const response = await fetch('/api/admin/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({ action, ...payload }),
  });
  const body = await response.json().catch(() => ({})) as { error?: string; items?: T[]; item?: { resetLink?: string } };
  if (!response.ok) throw new Error(body.error || 'User management request failed.');
  return body;
}

function formatLastLogin(value?: string) {
  if (!value) return 'Never';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Never';
  return new Intl.DateTimeFormat(undefined, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date);
}

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase() || '?';
}

function roleLabel(type: ManagedUser['userType']) {
  return type === 'super_admin' ? 'Super Admin' : type === 'admin' ? 'Admin' : type === 'teacher' ? 'Teacher' : type === 'guest' ? 'Guest' : 'Learner';
}

function emptyEditor(): EditorState {
  return { displayName:'',email:'',phoneNumber:'',whatsappNumber:'',userType:'learner',assignmentMode:'organization',
    organizationId:'',adminNodeType:'',adminNodeId:'',password:'' };
}

export default function UserManagement({ onBack, scope }: Props) {
  const t = (key: string, fallback: string) => getTranslation(key, fallback);
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [tenantOrganizations, setTenantOrganizations] = useState<TenantOrganization[]>([]);
  const [tenantOrganizationsLoading, setTenantOrganizationsLoading] = useState(true);
  const [hierarchyNodes,setHierarchyNodes]=useState<Record<'union'|'conference'|'district'|'church',HierarchyNode[]>>({union:[],conference:[],district:[],church:[]});
  const [hierarchyLoading,setHierarchyLoading]=useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [conferenceFilter, setConferenceFilter] = useState('all');
  const [districtFilter, setDistrictFilter] = useState('all');
  const [accountTypeFilter, setAccountTypeFilter] = useState<'all' | 'personal' | 'organization'>('all');
  const [page, setPage] = useState(1);
  const [viewMode,setViewMode]=useState<AdminViewMode>('table');
  const [selected, setSelected] = useState<ManagedUser | null>(null);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [saving, setSaving] = useState(false);
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [bulkInput, setBulkInput] = useState(false);
  const [resetLink, setResetLink] = useState('');
  const fileRef = useRef<HTMLInputElement | null>(null);
  const pageSize = 8;

  const loadOrganizations = async () => {
    setTenantOrganizationsLoading(true);
    try {
      const body = await userApi<TenantOrganization>('listOrganizations');
      setTenantOrganizations((body.items || []).filter((item: unknown): item is TenantOrganization => {
        const value = item as Partial<TenantOrganization>;
        return typeof value.id === 'string' && typeof value.name === 'string';
      }));
    } catch (reason) {
      setTenantOrganizations([]);
      setError(reason instanceof Error ? reason.message : 'Could not load organizations.');
    } finally {
      setTenantOrganizationsLoading(false);
    }
  };

  const loadHierarchyNodes = async () => {
    if(!scope?.isSuperAdmin)return;
    setHierarchyLoading(true);
    try{
      if(!auth?.currentUser)throw new Error('Your session has expired. Sign in again.');
      const token=await auth.currentUser.getIdToken();
      const loadCollection=async(collection:string)=>{
        const response=await fetch('/api/admin/content',{method:'POST',
          headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},
          body:JSON.stringify({action:'list',collection})});
        const body=await response.json().catch(()=>({})) as {error?:string;items?:HierarchyNode[]};
        if(!response.ok)throw new Error(body.error||'Could not load '+collection+'.');
        return (body.items||[]).map(item=>({id:String(item.id||''),name:String(item.name||item.code||item.id||'Unnamed'),code:item.code?String(item.code):undefined})).filter(item=>item.id);
      };
      const [union,conference,district,church]=await Promise.all([
        loadCollection('unions'),loadCollection('conferences'),loadCollection('districts'),loadCollection('churches'),
      ]);
      setHierarchyNodes({union,conference,district,church});
    }catch(reason){setError(reason instanceof Error?reason.message:'Could not load hierarchy assignments.');}
    finally{setHierarchyLoading(false);}
  };

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const body = await userApi('list');
      setUsers(body.items || []);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not load users.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void Promise.all([load(), loadOrganizations(), loadHierarchyNodes()]); }, []);
  useEffect(() => {
    if (scope?.organizationId && !scope.isSuperAdmin) {
      setEditor(current => current ? { ...current, organizationId: scope.organizationId || current.organizationId } : current);
    }
  }, [scope?.organizationId, scope?.isSuperAdmin]);
  useEffect(() => { setPage(1); }, [search, roleFilter, statusFilter, conferenceFilter, districtFilter, accountTypeFilter]);

  const roles = useMemo(() => Array.from(new Set(users.map(user => user.roleLabel).filter(Boolean))).sort(), [users]);
  const conferences = useMemo(() => Array.from(new Map(users.filter(user => user.conferenceId).map(user => [user.conferenceId, user.conferenceName || user.conferenceId || ''])).entries()).map(([id, name]) => ({ id: id || '', name: name || id || '' })).sort((a,b) => a.name.localeCompare(b.name)), [users]);
  const districts = useMemo(() => Array.from(new Map(users.filter(user => user.districtId).map(user => [user.districtId, user.districtName || user.districtId || ''])).entries()).map(([id, name]) => ({ id: id || '', name: name || id || '' })).sort((a,b) => a.name.localeCompare(b.name)), [users]);

  const organizations = useMemo<OrganizationOption[]>(() => {
    const map = new Map<string, OrganizationOption>();
    users.forEach(user => {
      if (user.unionId) map.set('union:' + user.unionId, { id: user.unionId, name: user.unionName || user.unionId, type: 'union' });
      if (user.conferenceId) map.set('conference:' + user.conferenceId, { id: user.conferenceId, name: user.conferenceName || user.conferenceId, type: 'conference' });
      if (user.districtId) map.set('district:' + user.districtId, { id: user.districtId, name: user.districtName || user.districtId, type: 'district' });
    });
    return [...map.values()].sort((a,b) => a.name.localeCompare(b.name));
  }, [users]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter(user => {
      const haystack = [user.displayName, user.email, user.roleLabel, user.userCode, user.conferenceName, user.districtName, user.unionName].join(' ').toLowerCase();
      return (!q || haystack.includes(q))
        && (roleFilter === 'all' || user.roleLabel === roleFilter)
        && (statusFilter === 'all' || user.status.toLowerCase() === statusFilter)
        && (conferenceFilter === 'all' || user.conferenceId === conferenceFilter)
        && (districtFilter === 'all' || user.districtId === districtFilter)
        && (accountTypeFilter === 'all'
            || (accountTypeFilter === 'organization' && (user.accountType === 'organization' || Boolean(user.organizationId)))
            || (accountTypeFilter === 'personal' && (user.accountType === 'personal' || (!user.accountType && !user.organizationId))));
    });
  }, [users, search, roleFilter, statusFilter, conferenceFilter, districtFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize);

  const metrics = useMemo(() => {
    const total = users.length;
    const active = users.filter(user => !user.disabled).length;
    const inactive = total - active;
    const admins = users.filter(user => user.roleLabel === 'Admin' || user.roleLabel === 'Super Admin').length;
    const teachers = users.filter(user => user.roleLabel === 'Teacher').length;
    const learners = users.filter(user => user.roleLabel === 'Learner').length;
    return { total, active, inactive, admins, teachers, learners };
  }, [users]);

  const flash = (value: string) => {
    setMessage(value);
    window.setTimeout(() => setMessage(''), 3500);
  };

  const openCreate = () => {
    setResetLink('');
    const next=emptyEditor();
    if(scope?.organizationId&&!scope.isSuperAdmin){
      next.assignmentMode='organization';
      next.organizationId=scope.organizationId;
    }
    setEditor(next);
    setSelected(null);
  };

  const openEdit = (user: ManagedUser) => {
    setResetLink('');
    setEditor({
      uid: user.uid,
      displayName: user.displayName,
      email: user.email,
      phoneNumber: user.phoneNumber || '',
      whatsappNumber: user.whatsappNumber || '',
      userType: user.userType,
      assignmentMode:user.role==='super_admin'?'platform':user.adminNodeType&&user.adminNodeId?'hierarchy':'organization',
      organizationId: user.organizationId || '',
      adminNodeType:(['union','conference','district','church'].includes(String(user.adminNodeType||''))?user.adminNodeType:'') as EditorState['adminNodeType'],
      adminNodeId:user.adminNodeId||'',
      password: '',
    });
  };

  const saveUser = async () => {
    if (!editor) return;
    if (!editor.displayName.trim() || !editor.email.trim()) {
      setError('Name and email are required.');
      return;
    }
    if(editor.userType==='admin'&&editor.assignmentMode==='organization'&&!editor.organizationId){
      setError('Choose the organization this administrator will manage.');return;
    }
    if(editor.userType==='admin'&&editor.assignmentMode==='hierarchy'&&(!editor.adminNodeType||!editor.adminNodeId)){
      setError('Choose the hierarchy level and assignment for this administrator.');return;
    }
    setSaving(true);
    setError('');
    try {
      if (editor.uid&&editor.assignmentMode==='organization'&&editor.organizationId) {
        const existing = users.find(user => user.uid === editor.uid);
        if (editor.organizationId !== (existing?.organizationId || '')) {
          await userApi('assignOrganization', { uid: editor.uid, organizationId: editor.organizationId, organizationRole: editor.userType === 'admin' ? 'admin' : editor.userType === 'mentor' ? 'mentor' : editor.userType === 'teacher' ? 'teacher' : 'learner' });
        }
      }
      const body = await userApi(editor.uid ? 'update' : 'create', {
        ...(editor.uid ? { uid: editor.uid } : {}),
        displayName: editor.displayName.trim(),
        email: editor.email.trim(),
        phoneNumber: editor.phoneNumber.trim(),
        whatsappNumber: editor.whatsappNumber.trim(),
        userType: editor.userType,
        assignmentMode:editor.userType==='super_admin'?'platform':editor.assignmentMode,
        ...(editor.assignmentMode==='organization' ? { organizationId: editor.organizationId } : {}),
        ...(editor.userType==='admin'&&editor.assignmentMode==='hierarchy' ? {adminNodeType:editor.adminNodeType,adminNodeId:editor.adminNodeId} : {}),
        ...(editor.password ? { password: editor.password } : {}),
      });
      if (body.item?.resetLink) setResetLink(body.item.resetLink);
      await load();
      flash(editor.uid ? 'User changes saved.' : 'User created.');
      if (!body.item?.resetLink) setEditor(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save the user.');
    } finally {
      setSaving(false);
    }
  };

  const setStatus = async (user: ManagedUser, disabled: boolean) => {
    try {
      await userApi('setStatus', { uid: user.uid, disabled });
      await load();
      flash(disabled ? 'User account disabled.' : 'User account activated.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not change account status.');
    }
  };

  const resetPassword = async (user: ManagedUser) => {
    try {
      const body = await userApi('resetPassword', { uid: user.uid });
      setSelected(user);
      setResetLink(body.item?.resetLink || '');
      flash('Password reset link generated.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not generate reset link.');
    }
  };

  const deleteUser = async (user: ManagedUser) => {
    if (!await appConfirm('Delete this user account and its profile?', {
      title:'Delete user',confirmLabel:'Delete',tone:'danger',
    })) return;
    try {
      await userApi('delete', { uid: user.uid });
      setSelected(null);
      await load();
      flash('User deleted.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not delete user.');
    }
  };

  const deleteSelectedUsers = async () => {
    if (selectedRows.size === 0) return;
    const targetUsers = users.filter(u => selectedRows.has(u.uid));
    const currentUid = auth?.currentUser?.uid;
    if (currentUid && targetUsers.some(u => u.uid === currentUid)) {
      setError('You cannot delete your own signed-in administrator account.');
      return;
    }
    if (!await appConfirm(`Permanently delete ${targetUsers.length} selected user account${targetUsers.length === 1 ? '' : 's'}?`, {
      title: 'Delete selected users', confirmLabel: 'Delete users', tone: 'danger',
    })) return;
    setSaving(true);
    setError('');
    let deletedCount = 0;
    try {
      for (const u of targetUsers) {
        await userApi('delete', { uid: u.uid });
        deletedCount++;
      }
      flash(`${deletedCount} user account${deletedCount === 1 ? '' : 's'} deleted.`);
      setSelectedRows(new Set());
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete selected users.');
      await load();
    } finally {
      setSaving(false);
    }
  };

  const exportUsers = () => {
    const headers = ['User Code', 'Name', 'Email', 'Role', 'Organization', 'Status', 'Conference', 'District', 'Last Login'];
    const rows = filtered.map(user => [user.userCode, user.displayName, user.email, user.roleLabel, user.organizationName || '', user.status, user.conferenceName || '', user.districtName || '', user.lastLogin || '']);
    const csv = [headers, ...rows].map(row => row.map(value => '"' + String(value).replace(/"/g, '""') + '"').join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'vop-users.csv';
    link.click();
    URL.revokeObjectURL(url);
    flash('User list exported.');
  };

  const downloadTemplate = () => {
    const csv = 'displayName,email,phoneNumber,userType\n';
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'vop-user-import-template.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  const importCsv = async (file: File) => {
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter(Boolean);
    if (lines.length < 2) throw new Error('The CSV file contains no user rows.');
    const headers = lines[0].split(',').map(value => value.trim());
    const indexOf = (name: string) => headers.indexOf(name);
    const rows = lines.slice(1).map(line => {
      const values = line.split(',');
      return {
        displayName: values[indexOf('displayName')]?.trim() || '',
        email: values[indexOf('email')]?.trim() || '',
        phoneNumber: values[indexOf('phoneNumber')]?.trim() || '',
        userType: values[indexOf('userType')]?.trim() || 'learner',
      };
    }).filter(row => row.displayName && row.email);
    let created = 0;
    for (const row of rows) {
      await userApi('create', row);
      created += 1;
    }
    await load();
    flash(created + ' user' + (created === 1 ? '' : 's') + ' imported.');
  };

  const toggleRow = (uid: string) => {
    setSelectedRows(current => {
      const next = new Set(current);
      if (next.has(uid)) next.delete(uid); else next.add(uid);
      return next;
    });
  };

  const toggleAll = () => {
    setSelectedRows(current => current.size === pageRows.length ? new Set() : new Set(pageRows.map(user => user.uid)));
  };

  const copyResetLink = async () => {
    if (!resetLink) return;
    await navigator.clipboard?.writeText(resetLink);
    flash('Reset link copied.');
  };

  return (
    <div className="vop-user-management">
      <div className="vop-user-page-head">
        <div className="vop-user-heading">
          <div className="vop-user-heading-icon"><Users size={30}/></div>
          <div><h1>{t('admin.user_management','User Management')}</h1><p>{t('admin.user_management_desc','Manage system users, roles, permissions and access.')}</p></div>
        </div>
        <button className="vop-primary" type="button" onClick={openCreate}><Plus size={18}/>{t('admin.add_user','Add User')}</button>
      </div>

      <div className="vop-user-layout">
        <div className="vop-user-main">
          <div className="vop-user-metrics">
            <Metric icon={<Users/>} tone="blue" value={metrics.total} label={t('admin.total_users','Total Users')} note="All time"/>
            <Metric icon={<UserCheck/>} tone="green" value={metrics.active} label={t('admin.active_users','Active Users')} note={metrics.total ? ((metrics.active / metrics.total) * 100).toFixed(1) + '%' : '0%'}/>
            <Metric icon={<UserCheck/>} tone="red" value={metrics.inactive} label={t('admin.inactive_users','Inactive Users')} note={metrics.total ? ((metrics.inactive / metrics.total) * 100).toFixed(1) + '%' : '0%'}/>
            <Metric icon={<ShieldCheck/>} tone="purple" value={metrics.admins} label={t('admin.admins','Admins')} note={metrics.total ? ((metrics.admins / metrics.total) * 100).toFixed(1) + '%' : '0%'}/>
            <Metric icon={<UserPlus/>} tone="orange" value={metrics.teachers} label={t('admin.teachers','Teachers')} note={metrics.total ? ((metrics.teachers / metrics.total) * 100).toFixed(1) + '%' : '0%'}/>
            <Metric icon={<Users/>} tone="blue" value={metrics.learners} label={t('admin.learners','Learners')} note={metrics.total ? ((metrics.learners / metrics.total) * 100).toFixed(1) + '%' : '0%'}/>
          </div>

          <div className="vop-user-toolbar">
            <div className="vop-user-search"><Search size={18}/><input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('admin.search_users','Search by name, email or role...')}/></div>
            <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)}><option value="all">{t('common.all_roles','All Roles')}</option>{roles.map(role => <option key={role}>{role}</option>)}</select>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}><option value="all">{t('common.all_statuses','All Statuses')}</option><option value="active">{t('common.active','Active')}</option><option value="inactive">{t('common.inactive','Inactive')}</option></select>
            <select value={conferenceFilter} onChange={e => setConferenceFilter(e.target.value)}><option value="all">{t('common.all_conferences','All Conferences')}</option>{conferences.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
            <select value={districtFilter} onChange={e => setDistrictFilter(e.target.value)}><option value="all">{t('common.all_districts','All Districts')}</option>{districts.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
            <select value={accountTypeFilter} onChange={e => setAccountTypeFilter(e.target.value as 'all' | 'personal' | 'organization')}>
              <option value="all">All Account Types</option>
              <option value="personal">Personal Accounts</option>
              <option value="organization">Organisation Accounts</option>
            </select>
            <button className="vop-secondary vop-user-filter" type="button" onClick={()=>{setSearch('');setRoleFilter('all');setStatusFilter('all');setConferenceFilter('all');setDistrictFilter('all');setAccountTypeFilter('all')}}><Filter size={17}/>Clear filters</button>
          </div>

          <div className="vop-user-view-row">
            <label><input type="checkbox" checked={pageRows.length > 0 && pageRows.every(user => selectedRows.has(user.uid))} onChange={toggleAll}/> Select page</label>
            <ViewModeToggle value={viewMode} onChange={setViewMode} label="User list view"/>
          </div>

          {loading && users.length===0 ? <div className="vop-user-table-wrap"><ShimmerList rows={8} compact label={t('admin.loading_users','Loading users')}/></div>
            : pageRows.length === 0 ? <div className="vop-user-table-wrap"><div className="vop-user-empty">{t('admin.no_users_match','No users match the current filters.')}</div></div>
            : viewMode==='table' ? <div className={'vop-user-table-wrap'+(loading?' vop-refreshing vop-shimmer-overlay':'')}>
              <table className="vop-user-table">
                <thead><tr>
                  <th><input type="checkbox" checked={pageRows.length > 0 && pageRows.every(user => selectedRows.has(user.uid))} onChange={toggleAll}/></th>
                  <th>{t('common.user','User')}</th><th>{t('common.role','Role')}</th><th>Account Type</th><th>Assignment / Scope</th><th>{t('common.status','Status')}</th><th>{t('admin.last_login','Last Login')}</th><th>{t('common.actions','Actions')}</th>
                </tr></thead>
                <tbody>{pageRows.map(user => <tr key={user.uid}>
                  <td><input type="checkbox" checked={selectedRows.has(user.uid)} onChange={() => toggleRow(user.uid)}/></td>
                  <td><div className="vop-user-cell"><Avatar user={user}/><div><strong>{user.displayName}</strong><span>{user.email || 'No email recorded'}</span><small>{user.userCode}</small></div></div></td>
                  <td><span className={'vop-user-role-pill ' + user.roleColor}>{user.roleLabel}</span></td>
                  <td><span className={'vop-chip ' + (user.accountType === 'organization' || user.organizationId ? 'vop-account-type-org' : 'vop-account-type-personal')}>{user.accountType === 'organization' || user.organizationId ? 'Organisation' : 'Personal'}</span></td>
                  <td><div className="vop-user-scope-cell"><strong>{user.organizationName || user.conferenceName || user.districtName || user.unionName || 'Platform / not assigned'}</strong><span>{user.organizationName ? [user.conferenceName,user.districtName].filter(Boolean).join(' · ') || 'Organisation scope' : user.adminNodeType && user.adminNodeId ? user.adminNodeType.replace(/^./,value=>value.toUpperCase()) + ' administrator' : 'No tenant assignment'}</span></div></td>
                  <td><span className={'vop-user-status ' + (user.disabled ? 'inactive' : 'active')}>{user.disabled ? t('common.inactive','Inactive') : t('common.active','Active')}</span></td>
                  <td className="vop-user-last-login">{formatLastLogin(user.lastLogin)}</td>
                  <td><div className="vop-user-actions">
                    <button type="button" title={t('common.view','View')} onClick={() => setSelected(user)}><Eye size={16}/></button>
                    <button type="button" title={t('common.edit','Edit')} onClick={() => openEdit(user)}><Edit3 size={16}/></button>
                    <StructureActionsMenu label={(user.displayName || user.email || 'User')+' actions'}>
                      <button type="button" onClick={() => openEdit(user)}><Edit3 size={15}/>{t('admin.edit_user','Edit User')}</button>
                      <button type="button" onClick={() => void setStatus(user, !user.disabled)}><Activity size={15}/>{user.disabled ? t('admin.activate_user','Activate User') : t('admin.disable_user','Disable User')}</button>
                      <button type="button" onClick={() => void resetPassword(user)}><KeyRound size={15}/>{t('admin.reset_password','Reset Password')}</button>
                      <button type="button" className="vop-structure-delete" onClick={() => void deleteUser(user)}><Trash2 size={15}/>{t('admin.delete_user','Delete User')}</button>
                    </StructureActionsMenu>
                  </div></td>
                </tr>)}</tbody>
              </table>
            </div> : <div className={'vop-admin-record-cards vop-user-card-grid'+(loading?' vop-refreshing vop-shimmer-overlay':'')}>
              {pageRows.map(user=><article key={user.uid} className="vop-admin-record-card vop-user-record-card">
                <div className="vop-admin-record-card-head">
                  <div className="vop-user-cell"><Avatar user={user}/><div><strong>{user.displayName}</strong><span>{user.email||'No email recorded'}</span><small>{user.userCode}</small></div></div>
                  <input type="checkbox" aria-label={'Select '+user.displayName} checked={selectedRows.has(user.uid)} onChange={()=>toggleRow(user.uid)}/>
                </div>
                <div className="vop-user-card-pills">
                  <span className={'vop-user-role-pill '+user.roleColor}>{user.roleLabel}</span>
                  <span className={'vop-chip ' + (user.accountType === 'organization' || user.organizationId ? 'vop-account-type-org' : 'vop-account-type-personal')}>{user.accountType === 'organization' || user.organizationId ? 'Organisation Account' : 'Personal Account'}</span>
                  <span className={'vop-user-status '+(user.disabled?'inactive':'active')}>{user.disabled?t('common.inactive','Inactive'):t('common.active','Active')}</span>
                </div>
                <div className="vop-admin-record-card-meta">
                  <div><small>Assignment / scope</small><strong>{user.organizationName||user.conferenceName||user.districtName||user.unionName||'Platform / not assigned'}</strong></div>
                  <div><small>Last login</small><strong>{formatLastLogin(user.lastLogin)}</strong></div>
                </div>
                <div className="vop-admin-record-card-actions">
                  <button className="vop-secondary" type="button" onClick={()=>setSelected(user)}><Eye size={15}/>View</button>
                  <button className="vop-secondary" type="button" onClick={()=>openEdit(user)}><Edit3 size={15}/>Edit</button>
                  <StructureActionsMenu label={(user.displayName||user.email||'User')+' actions'}>
                    <button type="button" onClick={()=>void setStatus(user,!user.disabled)}><Activity size={15}/>{user.disabled?t('admin.activate_user','Activate User'):t('admin.disable_user','Disable User')}</button>
                    <button type="button" onClick={()=>void resetPassword(user)}><KeyRound size={15}/>{t('admin.reset_password','Reset Password')}</button>
                    <button type="button" className="vop-structure-delete" onClick={()=>void deleteUser(user)}><Trash2 size={15}/>{t('admin.delete_user','Delete User')}</button>
                  </StructureActionsMenu>
                </div>
              </article>)}
            </div>}

          <div className="vop-user-pager">
            <span>Showing {filtered.length ? ((page - 1) * pageSize + 1) : 0}–{Math.min(page * pageSize, filtered.length)} of {filtered.length} users</span>
            <div><button type="button" disabled={page === 1} onClick={() => setPage(value => Math.max(1, value - 1))}><ChevronLeft size={17}/></button>{Array.from({ length: totalPages }, (_, index) => index + 1).slice(0, 5).map(number => <button key={number} type="button" className={number === page ? 'active' : ''} onClick={() => setPage(number)}>{number}</button>)}<button type="button" disabled={page === totalPages} onClick={() => setPage(value => Math.min(totalPages, value + 1))}><ChevronRight size={17}/></button></div>
          </div>
        </div>

        <aside className="vop-user-side">
          <section className="vop-user-side-card">
            <h3><Shield size={16}/>{t('admin.quick_actions','Quick Actions')}</h3>
            <button type="button" onClick={openCreate}><Plus size={15}/>{t('admin.add_new_user','Add New User')}</button>
            <button type="button" onClick={() => { setBulkInput(true); setEditor(null); }}><Upload size={15}/>{t('admin.bulk_import_csv','Bulk Import (CSV)')}</button>
            <button type="button" onClick={exportUsers}><Download size={15}/>{t('admin.export_users','Export Users')}</button>
            <button type="button" onClick={()=>void Promise.all([load(),loadOrganizations(),loadHierarchyNodes()]).then(()=>flash('Roles and assignments refreshed.'))}><ShieldCheck size={15}/>Refresh roles & assignments</button>
            <button type="button" onClick={()=>{
              if(selectedRows.size!==1){setError('Select exactly one user in the table to generate a password reset link.');return;}
              const user=users.find(item=>selectedRows.has(item.uid));
              if(user)void resetPassword(user);
            }}><KeyRound size={15}/>{t('admin.reset_password','Reset Password')}</button>
            {selectedRows.size > 0 && (
              <button type="button" className="vop-structure-delete" onClick={() => void deleteSelectedUsers()} style={{color:'var(--danger,#c5221f)',fontWeight:700}}>
                <Trash2 size={15}/>Delete Selected Users ({selectedRows.size})
              </button>
            )}
            <button type="button" onClick={openCreate}><UserPlus size={15}/>{t('admin.send_invitation','Create / Invite User')}</button>
          </section>
          <section className="vop-user-side-card">
            <h3><ShieldCheck size={16}/>{t('admin.user_roles','User Roles')}</h3>
            {roles.map(role => <div className="vop-role-info" key={role}><span className="vop-role-dot"/><div><strong>{role}</strong><small>{users.filter(user => user.roleLabel === role).length} account{users.filter(user => user.roleLabel === role).length === 1 ? '' : 's'}</small></div></div>)}
          </section>
          <section className="vop-user-side-card">
            <h3><Shield size={16}/>{t('admin.security_access','Security & Access')}</h3>
            <p>Account access is managed through the secured administrator workflow.</p>
            <div className="vop-setting-help"><ShieldCheck size={15}/>Audit history is available in the organization administration panel.</div>
          </section>
        </aside>
      </div>

      {message && <div className="vop-toast vop-user-toast">{message}</div>}
      {error && <AppAlertDialog message={error} title="User management" onClose={() => setError('')}/>} 

      {selected && <ModalLayer><div className="vop-user-modal-backdrop" onMouseDown={() => setSelected(null)}>
        <div className="vop-user-modal" role="dialog" aria-modal="true" onMouseDown={event => event.stopPropagation()}>
          <div className="vop-user-modal-head"><div><h2>{t('admin.user_details','User Details')}</h2><p>{selected.displayName}</p></div><button type="button" onClick={() => setSelected(null)}><X size={19}/></button></div>
          <div className="vop-user-profile-summary"><Avatar user={selected} large/><div><h3>{selected.displayName}</h3><span>{selected.email}</span><div className="vop-user-modal-pills"><span className={'vop-user-role-pill ' + selected.roleColor}>{selected.roleLabel}</span><span className={'vop-user-status ' + (selected.disabled ? 'inactive' : 'active')}>{selected.disabled ? 'Inactive' : 'Active'}</span></div></div></div>
          <div className="vop-user-detail-grid">
            <div><small>User ID</small><strong>{selected.userCode}</strong></div><div><small>Last Login</small><strong>{formatLastLogin(selected.lastLogin)}</strong></div>
            <div><small>Account Type</small><strong><span className={'vop-chip ' + (selected.accountType === 'organization' || selected.organizationId ? 'vop-account-type-org' : 'vop-account-type-personal')}>{selected.accountType === 'organization' || selected.organizationId ? 'Organisation Account' : 'Personal Account'}</span></strong></div>
            <div><small>WhatsApp</small><strong>{selected.whatsappNumber || selected.phoneNumber || 'Not configured'}</strong></div>
            <div><small>Organization</small><strong>{selected.organizationName || 'Not assigned'}</strong></div><div><small>Conference</small><strong>{selected.conferenceName || 'Not assigned'}</strong></div><div><small>District</small><strong>{selected.districtName || 'Not assigned'}</strong></div>
            <div><small>Union</small><strong>{selected.unionName || 'Not assigned'}</strong></div><div><small>Email Verified</small><strong>{selected.emailVerified ? 'Verified' : 'Not verified'}</strong></div>
          </div>
          {resetLink && <div className="vop-reset-link"><strong>Password reset link</strong><input readOnly value={resetLink}/><button type="button" onClick={() => void copyResetLink()}>Copy</button></div>}
          <div className="vop-user-modal-actions"><button className="vop-secondary" type="button" onClick={() => setSelected(null)}>{t('common.close','Close')}</button><button className="vop-primary" type="button" onClick={() => openEdit(selected)}><Edit3 size={16}/>{t('admin.edit_user','Edit User')}</button></div>
        </div>
      </div></ModalLayer>}

      {editor && <ModalLayer><div className="vop-user-modal-backdrop" onMouseDown={() => !saving && setEditor(null)}>
        <div className="vop-user-modal vop-user-editor-modal" role="dialog" aria-modal="true" onMouseDown={event => event.stopPropagation()}>
          <div className="vop-user-modal-head"><div><h2>{editor.uid ? t('admin.edit_user','Edit User') : t('admin.add_user','Add User')}</h2><p>{t('admin.user_identity_access','Manage account identity, role and access.')}</p></div><button type="button" onClick={() => !saving && setEditor(null)}><X size={19}/></button></div>
          <div className="vop-user-form-grid">
            <label><span>{t('common.full_name','Full Name')} *</span><input value={editor.displayName} onChange={e => setEditor({...editor,displayName:e.target.value})}/></label>
            <label><span>{t('common.email','Email')} *</span><input type="email" value={editor.email} onChange={e => setEditor({...editor,email:e.target.value})}/></label>
            <label><span>{t('common.phone','Phone')}</span><input value={editor.phoneNumber} onChange={e => setEditor({...editor,phoneNumber:e.target.value})}/></label>
            <label><span>WhatsApp number</span><input value={editor.whatsappNumber} onChange={e => setEditor({...editor,whatsappNumber:e.target.value})} placeholder="+260…"/><small>Used only when this user is a configured mentor/support contact.</small></label>
            <label><span>{t('common.role','Role')}</span><select value={editor.userType} onChange={e => {
              const userType=e.target.value as EditorState['userType'];
              setEditor({...editor,userType,assignmentMode:userType==='super_admin'?'platform':userType==='admin'?(editor.assignmentMode==='platform'?'organization':editor.assignmentMode):'organization',adminNodeType:userType==='admin'?editor.adminNodeType:'',adminNodeId:userType==='admin'?editor.adminNodeId:''});
            }}>{scope?.isSuperAdmin&&<option value="super_admin">Super Admin</option>}<option value="admin">Admin</option><option value="teacher">Teacher</option><option value="mentor">Mentor</option><option value="learner">Learner</option><option value="guest">Guest</option></select></label>
            {scope?.isSuperAdmin&&editor.userType==='admin'&&<label><span>Administrator scope *</span><select value={editor.assignmentMode} onChange={e=>setEditor({...editor,assignmentMode:e.target.value as EditorState['assignmentMode'],organizationId:'',adminNodeType:'',adminNodeId:''})}><option value="organization">Organization administrator</option><option value="hierarchy">Union / Conference / District / Church administrator</option></select><small>Choose whether this administrator manages an organization tenant or a church hierarchy node.</small></label>}
            {editor.userType!=='super_admin'&&editor.assignmentMode==='organization'&&<label><span>Organization {editor.userType === 'admin' ? '*' : '(optional)'}</span><select value={editor.organizationId} onChange={e => setEditor({...editor,organizationId:e.target.value})} disabled={tenantOrganizationsLoading || (!scope?.isSuperAdmin && !!scope?.organizationId)}><option value="">{tenantOrganizationsLoading ? 'Loading organizations…' : 'Platform / no organization'}</option>{tenantOrganizations.filter(item => item.status === 'active').map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>{!scope?.isSuperAdmin && scope?.organizationId && <small>Locked to your current organisation. Organization membership takes precedence over ordinary learner/mentor/teacher assignment.</small>}{tenantOrganizations.length === 0 && !tenantOrganizationsLoading && <small>No organization tenants are available to this administrator.</small>}</label>}
            {scope?.isSuperAdmin&&editor.userType==='admin'&&editor.assignmentMode==='hierarchy'&&<>
              <label><span>Hierarchy level *</span><select value={editor.adminNodeType} onChange={e=>setEditor({...editor,adminNodeType:e.target.value as EditorState['adminNodeType'],adminNodeId:''})}><option value="">Select level</option><option value="union">Union</option><option value="conference">Conference</option><option value="district">District</option><option value="church">Church</option></select></label>
              <label><span>Hierarchy assignment *</span><select value={editor.adminNodeId} disabled={!editor.adminNodeType||hierarchyLoading} onChange={e=>setEditor({...editor,adminNodeId:e.target.value})}><option value="">{hierarchyLoading?'Loading hierarchy…':'Select assignment'}</option>{editor.adminNodeType&&hierarchyNodes[editor.adminNodeType].map(item=><option key={item.id} value={item.id}>{item.name}{item.code?' · '+item.code:''}</option>)}</select><small>This creates the corresponding union_admin, conference_admin, district_admin or church_admin role.</small></label>
            </>}
            <div className="vop-account-type-notice" style={{gridColumn:'1/-1',padding:'11px 14px',borderRadius:9,background:(editor.assignmentMode==='organization'&&editor.organizationId)?'#eff6ff':'#f8fafc',border:'1px solid '+((editor.assignmentMode==='organization'&&editor.organizationId)?'#bfdbfe':'#e2e8f0'),display:'flex',gap:10,alignItems:'flex-start'}}>
              {(editor.assignmentMode==='organization'&&editor.organizationId)?(
                <>
                  <ShieldCheck size={18} style={{color:'#2563eb',marginTop:2,flexShrink:0}}/>
                  <div>
                    <strong style={{color:'#1e40af',fontSize:12.5}}>Assumes Organisation Account Type</strong>
                    <p style={{margin:'2px 0 0',color:'#3b5b88',fontSize:11.5,lineHeight:1.4}}>
                      A personal account can manage an organisation account. Immediately an account has been assigned to an organisation, it assumes the <strong>Organisation Account</strong> type.
                    </p>
                  </div>
                </>
              ):(
                <>
                  <Users size={18} style={{color:'#64748b',marginTop:2,flexShrink:0}}/>
                  <div>
                    <strong style={{color:'#334155',fontSize:12.5}}>Personal Account</strong>
                    <p style={{margin:'2px 0 0',color:'#64748b',fontSize:11.5,lineHeight:1.4}}>
                      Personal accounts are separate from organisation accounts. Once this account is assigned to an organisation, it will automatically assume the Organisation Account type.
                    </p>
                  </div>
                </>
              )}
            </div>
            {!editor.uid && <label><span>Password <small>(optional)</small></span><input type="password" value={editor.password} onChange={e => setEditor({...editor,password:e.target.value})} placeholder="Leave blank to use reset link"/></label>}
          </div>
          {resetLink && <div className="vop-reset-link"><strong>Invitation / password reset link</strong><input readOnly value={resetLink}/><button type="button" onClick={() => void copyResetLink()}>Copy</button></div>}
          <div className="vop-user-modal-actions"><button className="vop-secondary" type="button" onClick={() => setEditor(null)} disabled={saving}>{t('common.cancel','Cancel')}</button><button className="vop-primary" type="button" onClick={() => void saveUser()} disabled={saving}>{saving ? t('common.saving','Saving…') : t('admin.save_user','Save User')}</button></div>
        </div>
      </div></ModalLayer>}

      {bulkInput && <ModalLayer><div className="vop-user-modal-backdrop" onMouseDown={() => setBulkInput(false)}>
        <div className="vop-user-modal" role="dialog" aria-modal="true" onMouseDown={event => event.stopPropagation()}>
          <div className="vop-user-modal-head"><div><h2>{t('admin.bulk_import_users','Bulk Import Users')}</h2><p>Import account records from a CSV file.</p></div><button type="button" onClick={() => setBulkInput(false)}><X size={19}/></button></div>
          <div className="vop-bulk-drop"><Upload size={28}/><strong>Select a CSV file</strong><span>Bulk import is available for operational migration; normal user assignment should use the visual organization and member controls.</span><button className="vop-secondary" type="button" onClick={() => fileRef.current?.click()}>{t('admin.choose_csv','Choose CSV')}</button><input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={async event => { const file = event.target.files?.[0]; if (!file) return; try { await importCsv(file); setBulkInput(false); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not import CSV.'); } finally { event.target.value = ''; } }}/><button type="button" className="vop-link-button" onClick={downloadTemplate}>{t('admin.download_template','Download template')}</button></div>
        </div>
      </div></ModalLayer>}
    </div>
  );
}

function Metric({ icon, tone, value, label, note }: { icon: React.ReactNode; tone: string; value: number; label: string; note: string }) {
  return <div className={'vop-user-metric ' + tone}><div className="vop-user-metric-icon">{icon}</div><div><small>{label}</small><strong>{value.toLocaleString()}</strong><span>{note}</span></div></div>;
}

function Avatar({ user, large = false }: { user: ManagedUser; large?: boolean }) {
  return user.photoURL
    ? <img className={'vop-user-avatar ' + (large ? 'large' : '')} src={user.photoURL} alt="" />
    : <div className={'vop-user-avatar vop-user-avatar-fallback ' + (large ? 'large' : '')}>{initials(user.displayName)}</div>;
}
