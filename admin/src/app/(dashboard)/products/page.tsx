import { createServerSupabaseClient } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';
import { ShoppingBag, ShieldCheck } from 'lucide-react';

interface ProductRow {
  id: string;
  title: string;
  price: number;
  status: string;
  is_featured: boolean;
  created_at: string;
  stores: { name: string; slug: string } | null;
  categories: { name: string } | null;
}

export default async function AdminProductsPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: productsData, error } = await supabase
    .from('products')
    .select('id, title, price, status, is_featured, created_at, stores(name, slug), categories(name)')
    .order('created_at', { ascending: false })
    .limit(100);

  const products: ProductRow[] = (productsData ?? []) as ProductRow[];

  const statusBadge = (status: string) => {
    switch (status) {
      case 'active': return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
      case 'draft': return 'bg-slate-800 text-slate-400 border-slate-700';
      case 'archived': return 'bg-rose-500/10 text-rose-400 border-rose-500/20';
      default: return 'bg-slate-800 text-slate-400 border-slate-700';
    }
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <ShoppingBag className="w-6 h-6 text-blue-400" />
            Marketplace Products
          </h1>
          <p className="text-slate-400 text-sm">
            {products.length} product{products.length !== 1 ? 's' : ''} in catalogue
          </p>
        </div>
        <span className="px-3 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-semibold rounded-lg flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5" />
          RLS ENFORCED
        </span>
      </div>

      {error && (
        <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-4 text-rose-400 text-sm">
          Error loading products: {error.message}
        </div>
      )}

      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <table className="w-full text-left text-sm text-slate-300">
          <thead className="bg-slate-950 text-slate-400 text-xs uppercase border-b border-slate-800">
            <tr>
              <th className="p-4">Product Title</th>
              <th className="p-4">Store</th>
              <th className="p-4">Category</th>
              <th className="p-4">Price</th>
              <th className="p-4">Featured</th>
              <th className="p-4">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {products.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-8 text-center text-slate-500">
                  No products yet. Products appear when sellers list them.
                </td>
              </tr>
            ) : (
              products.map((p) => (
                <tr key={p.id} className="hover:bg-slate-800/50">
                  <td className="p-4 font-semibold text-white max-w-xs truncate">{p.title}</td>
                  <td className="p-4 text-slate-300">
                    {(p.stores as any)?.name ?? '—'}
                  </td>
                  <td className="p-4">
                    <span className="px-2 py-1 bg-slate-800 rounded text-xs text-slate-300">
                      {(p.categories as any)?.name ?? 'Uncategorised'}
                    </span>
                  </td>
                  <td className="p-4 font-bold text-blue-400">
                    K{Number(p.price).toFixed(2)}
                  </td>
                  <td className="p-4">
                    {p.is_featured ? (
                      <span className="px-2 py-0.5 text-xs font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded">
                        ★ Featured
                      </span>
                    ) : '—'}
                  </td>
                  <td className="p-4">
                    <span className={`px-2 py-0.5 text-xs font-bold border rounded ${statusBadge(p.status)}`}>
                      {p.status.toUpperCase()}
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
