import { createServerSupabaseClient } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { Users, ShieldCheck, UserCheck, ShieldAlert } from 'lucide-react';

interface ProfileRow {
  id: string;
  full_name: string;
  phone: string | null;
  role: string;
  created_at: string;
}

const roleBadge = (role: string) => {
  switch (role) {
    case 'super_admin':
    case 'marketplace_admin':
      return 'bg-purple-500/10 text-purple-400 border-purple-500/20';
    case 'seller':
      return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
    case 'finance_admin':
      return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
    case 'support_agent':
      return 'bg-teal-500/10 text-teal-400 border-teal-500/20';
    default:
      return 'bg-slate-800 text-slate-300 border-slate-700';
  }
};

export default async function AdminUsersPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  async function updateUserRoleAction(formData: FormData) {
    'use server';
    const targetUserId = formData.get('targetUserId') as string;
    const newRole = formData.get('newRole') as string;
    const client = await createServerSupabaseClient();

    await client
      .from('profiles')
      .update({ role: newRole })
      .eq('id', targetUserId);

    revalidatePath('/users');
  }

  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('id, full_name, phone, role, created_at')
    .order('created_at', { ascending: false })
    .limit(100);

  const users: ProfileRow[] = (profiles ?? []) as ProfileRow[];

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Users className="w-6 h-6 text-blue-400" />
            User Access & Role-Based Access Control (RBAC)
          </h1>
          <p className="text-slate-400 text-sm">
            {users.length} registered user{users.length !== 1 ? 's' : ''} — manage permissions for platform admins, catalog moderators, sellers, and buyers.
          </p>
        </div>
        <span className="px-3 py-1 bg-purple-500/10 text-purple-400 border border-purple-500/20 text-xs font-semibold rounded-lg flex items-center gap-1.5">
          <ShieldAlert className="w-3.5 h-3.5" />
          RBAC ACTIVE
        </span>
      </div>

      {error && (
        <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-4 text-rose-400 text-sm">
          Error loading users: {error.message}
        </div>
      )}

      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <table className="w-full text-left text-sm text-slate-300">
          <thead className="bg-slate-950 text-slate-400 text-xs uppercase border-b border-slate-800">
            <tr>
              <th className="p-4">User Name</th>
              <th className="p-4">Phone</th>
              <th className="p-4">Current Role</th>
              <th className="p-4">Joined Date</th>
              <th className="p-4">Modify RBAC Role</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {users.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-8 text-center text-slate-500">
                  No users found. Users appear here after registration.
                </td>
              </tr>
            ) : (
              users.map((u) => (
                <tr key={u.id} className="hover:bg-slate-800/50">
                  <td className="p-4 font-semibold text-white">{u.full_name}</td>
                  <td className="p-4 text-xs text-slate-400">{u.phone ?? '—'}</td>
                  <td className="p-4">
                    <span className={`px-2.5 py-0.5 text-xs font-semibold rounded-full border ${roleBadge(u.role)}`}>
                      {u.role.toUpperCase()}
                    </span>
                  </td>
                  <td className="p-4 text-xs text-slate-400">
                    {new Date(u.created_at).toLocaleDateString()}
                  </td>
                  <td className="p-4">
                    <form action={updateUserRoleAction} className="flex items-center gap-2">
                      <input type="hidden" name="targetUserId" value={u.id} />
                      <select
                        name="newRole"
                        defaultValue={u.role}
                        className="px-2.5 py-1 bg-slate-950 border border-slate-800 rounded text-xs text-white focus:outline-none focus:border-purple-500"
                      >
                        <option value="buyer">buyer</option>
                        <option value="seller">seller</option>
                        <option value="support_agent">support_agent</option>
                        <option value="finance_admin">finance_admin</option>
                        <option value="marketplace_admin">marketplace_admin</option>
                        <option value="super_admin">super_admin</option>
                      </select>
                      <button
                        type="submit"
                        className="px-2.5 py-1 text-xs font-bold bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 border border-purple-500/30 rounded flex items-center gap-1 transition-colors"
                      >
                        Save Role
                      </button>
                    </form>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
