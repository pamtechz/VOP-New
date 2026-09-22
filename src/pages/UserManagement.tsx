import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity, ChevronLeft, ChevronRight, Download, Edit3, Eye, Filter, KeyRound, MoreVertical,
  Plus, Search, Shield, ShieldCheck, Trash2, Upload, UserCheck, UserPlus, Users, X
} from 'lucide-react';
import { auth } from '../lib/firebase';
import './userManagement.css';

type ManagedUser = {
  uid: string;
  userCode: string;
  displayName: string;
  email: string;
  phoneNumber?: string;
  photoURL?: string;
  role: string;
  roleLabel: string;
  roleColor: 'admin' | 'teacher' | 'learner' | 'guest';
  userType: 'super_admin' | 'admin' | 'teacher' | 'learner' | 'guest';
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
};

type OrganizationOption = { id: string; name: string; type: string };

type EditorState = {
  uid?: string;
  displayName: string;
  email: string;
  phoneNumber: string;
  userType: ManagedUser['userType'];
  adminNodeType: string;
  adminNodeId: string;
  password: string;
};

type Props = { onBack: () => void };

async function userApi(action: string, payload: Record<string, unknown> = {}) {
  if (!auth?.currentUser) throw new Error('Your session has expired. Sign in again.');
  const token = await auth.currentUser.getIdToken();
  const response = await fetch('/api/admin/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({ action, ...payload }),
  });
  const body = await response.json().catch(() => ({})) as { error?: string; items?: ManagedUser[]; item?: { resetLink?: string } };
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
  return { displayName: '', email: '', phoneNumber: '', userType: 'learner', adminNodeType: '', adminNodeId: '', password: '' };
}

export default function UserManagement({ onBack }: Props) {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [conferenceFilter, setConferenceFilter] = useState('all');
  const [districtFilter, setDistrictFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<ManagedUser | null>(null);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [saving, setSaving] = useState(false);
  const [menuUid, setMenuUid] = useState<string | null>(null);
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [bulkInput, setBulkInput] = useState(false);
  const [resetLink, setResetLink] = useState('');
  const fileRef = useRef<HTMLInputElement | null>(null);
  const pageSize = 8;

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

  useEffect(() => { void load(); }, []);
  useEffect(() => { setPage(1); }, [search, roleFilter, statusFilter, conferenceFilter, districtFilter]);

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
        && (districtFilter === 'all' || user.districtId === districtFilter);
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
    setEditor(emptyEditor());
    setSelected(null);
  };

  const openEdit = (user: ManagedUser) => {
    setResetLink('');
    setEditor({
      uid: user.uid,
      displayName: user.displayName,
      email: user.email,
      phoneNumber: user.phoneNumber || '',
      userType: user.userType,
      adminNodeType: user.adminNodeType || '',
      adminNodeId: user.adminNodeId || '',
      password: '',
    });
    setMenuUid(null);
  };

  const saveUser = async () => {
    if (!editor) return;
    if (!editor.displayName.trim() || !editor.email.trim()) {
      setError('Name and email are required.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const body = await userApi(editor.uid ? 'update' : 'create', {
        ...(editor.uid ? { uid: editor.uid } : {}),
        displayName: editor.displayName.trim(),
        email: editor.email.trim(),
        phoneNumber: editor.phoneNumber.trim(),
        userType: editor.userType,
        adminNodeType: editor.adminNodeType,
        adminNodeId: editor.adminNodeId,
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
    setMenuUid(null);
    try {
      await userApi('setStatus', { uid: user.uid, disabled });
      await load();
      flash(disabled ? 'User account disabled.' : 'User account activated.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not change account status.');
    }
  };

  const resetPassword = async (user: ManagedUser) => {
    setMenuUid(null);
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
    setMenuUid(null);
    if (!window.confirm('Delete this user account and its profile?')) return;
    try {
      await userApi('delete', { uid: user.uid });
      setSelected(null);
      await load();
      flash('User deleted.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not delete user.');
    }
  };

  const exportUsers = () => {
    const headers = ['User Code', 'Name', 'Email', 'Role', 'Status', 'Conference', 'District', 'Last Login'];
    const rows = filtered.map(user => [user.userCode, user.displayName, user.email, user.roleLabel, user.status, user.conferenceName || '', user.districtName || '', user.lastLogin || '']);
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
    const csv = 'displayName,email,phoneNumber,userType,adminNodeType,adminNodeId\n';
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
        adminNodeType: values[indexOf('adminNodeType')]?.trim() || '',
        adminNodeId: values[indexOf('adminNodeId')]?.trim() || '',
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
          <div><h1>User Management</h1><p>Manage system users, roles, permissions and access.</p></div>
        </div>
        <button className="vop-primary" type="button" onClick={openCreate}><Plus size={18}/>Add User</button>
      </div>

      <div className="vop-user-layout">
        <div className="vop-user-main">
          <div className="vop-user-metrics">
            <Metric icon={<Users/>} tone="blue" value={metrics.total} label="Total Users" note="All time"/>
            <Metric icon={<UserCheck/>} tone="green" value={metrics.active} label="Active Users" note={metrics.total ? ((metrics.active / metrics.total) * 100).toFixed(1) + '%' : '0%'}/>
            <Metric icon={<UserCheck/>} tone="red" value={metrics.inactive} label="Inactive Users" note={metrics.total ? ((metrics.inactive / metrics.total) * 100).toFixed(1) + '%' : '0%'}/>
            <Metric icon={<ShieldCheck/>} tone="purple" value={metrics.admins} label="Admins" note={metrics.total ? ((metrics.admins / metrics.total) * 100).toFixed(1) + '%' : '0%'}/>
            <Metric icon={<UserPlus/>} tone="orange" value={metrics.teachers} label="Teachers" note={metrics.total ? ((metrics.teachers / metrics.total) * 100).toFixed(1) + '%' : '0%'}/>
            <Metric icon={<Users/>} tone="blue" value={metrics.learners} label="Learners" note={metrics.total ? ((metrics.learners / metrics.total) * 100).toFixed(1) + '%' : '0%'}/>
          </div>

          <div className="vop-user-toolbar">
            <div className="vop-user-search"><Search size={18}/><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name, email or role..."/></div>
            <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)}><option value="all">All Roles</option>{roles.map(role => <option key={role}>{role}</option>)}</select>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}><option value="all">All Statuses</option><option value="active">Active</option><option value="inactive">Inactive</option></select>
            <select value={conferenceFilter} onChange={e => setConferenceFilter(e.target.value)}><option value="all">All Conferences</option>{conferences.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
            <select value={districtFilter} onChange={e => setDistrictFilter(e.target.value)}><option value="all">All Districts</option>{districts.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
            <button className="vop-primary vop-user-filter" type="button"><Filter size={17}/>Filter</button>
          </div>

          <div className="vop-user-table-wrap">
            {loading ? <div className="vop-user-empty">Loading users…</div> : pageRows.length === 0 ? <div className="vop-user-empty">No users match the current filters.</div> : (
              <table className="vop-user-table">
                <thead><tr>
                  <th><input type="checkbox" checked={pageRows.length > 0 && pageRows.every(user => selectedRows.has(user.uid))} onChange={toggleAll}/></th>
                  <th>#</th><th>User</th><th>Email</th><th>Role</th><th>Conference / District</th><th>Status</th><th>Last Login</th><th>Actions</th>
                </tr></thead>
                <tbody>
                  {pageRows.map((user, index) => (
                    <tr key={user.uid}>
                      <td><input type="checkbox" checked={selectedRows.has(user.uid)} onChange={() => toggleRow(user.uid)}/></td>
                      <td>{(page - 1) * pageSize + index + 1}</td>
                      <td><div className="vop-user-cell"><Avatar user={user}/><div><strong>{user.displayName}</strong><span>{user.userCode}</span></div></div></td>
                      <td>{user.email || 'Not recorded'}</td>
                      <td><span className={'vop-user-role-pill ' + user.roleColor}>{user.roleLabel}</span></td>
                      <td><div className="vop-org-cell"><span>{user.conferenceName || 'Not assigned'}</span><small>{user.districtName || 'Not assigned'}</small></div></td>
                      <td><span className={'vop-user-status ' + (user.disabled ? 'inactive' : 'active')}>{user.disabled ? 'Inactive' : 'Active'}</span></td>
                      <td>{formatLastLogin(user.lastLogin)}</td>
                      <td>
                        <div className="vop-user-actions">
                          <button type="button" title="View" onClick={() => { setSelected(user); setMenuUid(null); }}><Eye size={16}/></button>
                          <button type="button" title="Edit" onClick={() => openEdit(user)}><Edit3 size={16}/></button>
                          <button type="button" title="More" onClick={() => setMenuUid(current => current === user.uid ? null : user.uid)}><MoreVertical size={16}/></button>
                          {menuUid === user.uid && <div className="vop-user-menu">
                            <button type="button" onClick={() => openEdit(user)}><Edit3 size={15}/>Edit User</button>
                            <button type="button" onClick={() => void setStatus(user, !user.disabled)}><Activity size={15}/>{user.disabled ? 'Activate User' : 'Disable User'}</button>
                            <button type="button" onClick={() => void resetPassword(user)}><KeyRound size={15}/>Reset Password</button>
                            <button type="button" className="danger" onClick={() => void deleteUser(user)}><Trash2 size={15}/>Delete User</button>
                          </div>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="vop-user-pager">
            <span>Showing {filtered.length ? ((page - 1) * pageSize + 1) : 0}–{Math.min(page * pageSize, filtered.length)} of {filtered.length} users</span>
            <div><button type="button" disabled={page === 1} onClick={() => setPage(value => Math.max(1, value - 1))}><ChevronLeft size={17}/></button>{Array.from({ length: totalPages }, (_, index) => index + 1).slice(0, 5).map(number => <button key={number} type="button" className={number === page ? 'active' : ''} onClick={() => setPage(number)}>{number}</button>)}<button type="button" disabled={page === totalPages} onClick={() => setPage(value => Math.min(totalPages, value + 1))}><ChevronRight size={17}/></button></div>
          </div>
        </div>

        <aside className="vop-user-side">
          <section className="vop-user-side-card">
            <h3><Shield size={16}/>Quick Actions</h3>
            <button type="button" onClick={openCreate}><Plus size={15}/>Add New User</button>
            <button type="button" onClick={() => { setBulkInput(true); setEditor(null); }}><Upload size={15}/>Bulk Import (CSV)</button>
            <button type="button" onClick={exportUsers}><Download size={15}/>Export Users</button>
            <button type="button" onClick={() => flash('Role options are derived from current account data and permissions.')}><ShieldCheck size={15}/>Manage Roles</button>
            <button type="button" onClick={() => flash('Select a user and use Reset Password from the action menu.')}><KeyRound size={15}/>Reset Password</button>
            <button type="button" onClick={() => flash('Invitation is generated from the Add User workflow.')}><UserPlus size={15}/>Send Invitation</button>
          </section>
          <section className="vop-user-side-card">
            <h3><ShieldCheck size={16}/>User Roles</h3>
            {roles.map(role => <div className="vop-role-info" key={role}><span className="vop-role-dot"/><div><strong>{role}</strong><small>{users.filter(user => user.roleLabel === role).length} account{users.filter(user => user.roleLabel === role).length === 1 ? '' : 's'}</small></div></div>)}
          </section>
          <section className="vop-user-side-card">
            <h3><Shield size={16}/>Security & Access</h3>
            <p>Account access is managed through the secured administrator workflow.</p>
            <button type="button" onClick={() => flash('Audit history is retained by server-side administrative actions.')}><ShieldCheck size={15}/>View Audit Logs</button>
          </section>
        </aside>
      </div>

      {message && <div className="vop-toast vop-user-toast">{message}</div>}
      {error && <div className="vop-user-alert"><X size={16}/><span>{error}</span><button type="button" onClick={() => setError('')}><X size={15}/></button></div>}

      {selected && <div className="vop-user-modal-backdrop" onMouseDown={() => setSelected(null)}>
        <div className="vop-user-modal" role="dialog" aria-modal="true" onMouseDown={event => event.stopPropagation()}>
          <div className="vop-user-modal-head"><div><h2>User Details</h2><p>{selected.displayName}</p></div><button type="button" onClick={() => setSelected(null)}><X size={19}/></button></div>
          <div className="vop-user-profile-summary"><Avatar user={selected} large/><div><h3>{selected.displayName}</h3><span>{selected.email}</span><div className="vop-user-modal-pills"><span className={'vop-user-role-pill ' + selected.roleColor}>{selected.roleLabel}</span><span className={'vop-user-status ' + (selected.disabled ? 'inactive' : 'active')}>{selected.disabled ? 'Inactive' : 'Active'}</span></div></div></div>
          <div className="vop-user-detail-grid">
            <div><small>User ID</small><strong>{selected.userCode}</strong></div><div><small>Last Login</small><strong>{formatLastLogin(selected.lastLogin)}</strong></div>
            <div><small>Conference</small><strong>{selected.conferenceName || 'Not assigned'}</strong></div><div><small>District</small><strong>{selected.districtName || 'Not assigned'}</strong></div>
            <div><small>Union</small><strong>{selected.unionName || 'Not assigned'}</strong></div><div><small>Email Verified</small><strong>{selected.emailVerified ? 'Verified' : 'Not verified'}</strong></div>
          </div>
          {resetLink && <div className="vop-reset-link"><strong>Password reset link</strong><input readOnly value={resetLink}/><button type="button" onClick={() => void copyResetLink()}>Copy</button></div>}
          <div className="vop-user-modal-actions"><button className="vop-secondary" type="button" onClick={() => setSelected(null)}>Close</button><button className="vop-primary" type="button" onClick={() => openEdit(selected)}><Edit3 size={16}/>Edit User</button></div>
        </div>
      </div>}

      {editor && <div className="vop-user-modal-backdrop" onMouseDown={() => !saving && setEditor(null)}>
        <div className="vop-user-modal vop-user-editor-modal" role="dialog" aria-modal="true" onMouseDown={event => event.stopPropagation()}>
          <div className="vop-user-modal-head"><div><h2>{editor.uid ? 'Edit User' : 'Add User'}</h2><p>Manage account identity, role and access.</p></div><button type="button" onClick={() => !saving && setEditor(null)}><X size={19}/></button></div>
          <div className="vop-user-form-grid">
            <label><span>Full Name *</span><input value={editor.displayName} onChange={e => setEditor({...editor,displayName:e.target.value})}/></label>
            <label><span>Email *</span><input type="email" value={editor.email} onChange={e => setEditor({...editor,email:e.target.value})}/></label>
            <label><span>Phone</span><input value={editor.phoneNumber} onChange={e => setEditor({...editor,phoneNumber:e.target.value})}/></label>
            <label><span>Role</span><select value={editor.userType} onChange={e => setEditor({...editor,userType:e.target.value as EditorState['userType']})}><option value="super_admin">Super Admin</option><option value="admin">Admin</option><option value="teacher">Teacher</option><option value="learner">Learner</option><option value="guest">Guest</option></select></label>
            {editor.userType === 'admin' && <><label><span>Admin Scope</span><select value={editor.adminNodeType} onChange={e => setEditor({...editor,adminNodeType:e.target.value,adminNodeId:''})}><option value="">Select scope</option>{Array.from(new Set(organizations.map(item => item.type))).map(type => <option key={type} value={type}>{type[0].toUpperCase() + type.slice(1)}</option>)}</select></label><label><span>Organization</span><select value={editor.adminNodeId} onChange={e => setEditor({...editor,adminNodeId:e.target.value})}><option value="">Select organization</option>{organizations.filter(item => item.type === editor.adminNodeType).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></>}
            {!editor.uid && <label><span>Password <small>(optional)</small></span><input type="password" value={editor.password} onChange={e => setEditor({...editor,password:e.target.value})} placeholder="Leave blank to use reset link"/></label>}
          </div>
          {resetLink && <div className="vop-reset-link"><strong>Invitation / password reset link</strong><input readOnly value={resetLink}/><button type="button" onClick={() => void copyResetLink()}>Copy</button></div>}
          <div className="vop-user-modal-actions"><button className="vop-secondary" type="button" onClick={() => setEditor(null)} disabled={saving}>Cancel</button><button className="vop-primary" type="button" onClick={() => void saveUser()} disabled={saving}>{saving ? 'Saving…' : 'Save User'}</button></div>
        </div>
      </div>}

      {bulkInput && <div className="vop-user-modal-backdrop" onMouseDown={() => setBulkInput(false)}>
        <div className="vop-user-modal" role="dialog" aria-modal="true" onMouseDown={event => event.stopPropagation()}>
          <div className="vop-user-modal-head"><div><h2>Bulk Import Users</h2><p>Import account records from a CSV file.</p></div><button type="button" onClick={() => setBulkInput(false)}><X size={19}/></button></div>
          <div className="vop-bulk-drop"><Upload size={28}/><strong>Select a CSV file</strong><span>Use displayName, email, phoneNumber, userType, adminNodeType and adminNodeId columns.</span><button className="vop-secondary" type="button" onClick={() => fileRef.current?.click()}>Choose CSV</button><input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={async event => { const file = event.target.files?.[0]; if (!file) return; try { await importCsv(file); setBulkInput(false); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not import CSV.'); } finally { event.target.value = ''; } }}/><button type="button" className="vop-link-button" onClick={downloadTemplate}>Download template</button></div>
        </div>
      </div>}
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
