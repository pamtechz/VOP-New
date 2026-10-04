import { createServerSupabaseClient } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';
import { Tag, Plus, FolderTree, ShieldCheck } from 'lucide-react';

interface CategoryRow {
  id: string;
  name: string;
  slug: string;
  display_order: number;
  is_active: boolean;
  products: { count: number }[];
}

export default async function AdminCategoriesPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: categoriesData } = await supabase
    .from('categories')
    .select('id, name, slug, display_order, is_active, products(count)')
    .order('display_order', { ascending: true });

  const categories: CategoryRow[] = (categoriesData ?? []) as unknown as CategoryRow[];

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Tag className="w-6 h-6 text-blue-400" />
            Categories Management
          </h1>
          <p className="text-slate-400 text-sm">
            {categories.length} active marketplace product categories in PostgreSQL.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="px-3 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-semibold rounded-lg flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5" />
            RLS ENFORCED
          </span>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <table className="w-full text-left text-sm text-slate-300">
          <thead className="bg-slate-950 text-slate-400 text-xs uppercase border-b border-slate-800">
            <tr>
              <th className="p-4">Display Order</th>
              <th className="p-4">Category Name</th>
              <th className="p-4">Slug</th>
              <th className="p-4">Products</th>
              <th className="p-4">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {categories.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-8 text-center text-slate-500">
                  No categories found in database.
                </td>
              </tr>
            ) : (
              categories.map((cat) => (
                <tr key={cat.id} className="hover:bg-slate-800/50">
                  <td className="p-4 font-mono font-bold text-slate-400">#{cat.display_order}</td>
                  <td className="p-4 font-semibold text-white flex items-center gap-2">
                    <FolderTree className="w-4 h-4 text-blue-400" />
                    {cat.name}
                  </td>
                  <td className="p-4 font-mono text-xs text-slate-400">/{cat.slug}</td>
                  <td className="p-4 font-bold text-white">
                    {cat.products?.[0]?.count ?? 0}
                  </td>
                  <td className="p-4">
                    <span className={`px-2.5 py-0.5 text-xs font-semibold rounded-full border ${
                      cat.is_active 
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                        : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                    }`}>
                      {cat.is_active ? 'Active' : 'Inactive'}
                    </span>
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
