import { createServerSupabaseClient } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { Tag, Plus, FolderTree, ShieldCheck, Trash2, Pencil } from 'lucide-react';

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

  async function createCategoryAction(formData: FormData) {
    'use server';
    const name = formData.get('name') as string;
    const slug = formData.get('slug') as string || name.toLowerCase().replace(/\s+/g, '-');
    const displayOrder = parseInt(formData.get('displayOrder') as string || '0', 10);
    const client = await createServerSupabaseClient();

    await client.from('categories').insert({
      name,
      slug,
      display_order: displayOrder,
      is_active: true,
    });

    revalidatePath('/categories');
  }

  async function updateCategoryAction(formData: FormData) {
    'use server';
    const categoryId = String(formData.get('categoryId') ?? '');
    const name = String(formData.get('name') ?? '').trim();
    const slug = String(formData.get('slug') ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const displayOrder = Number.parseInt(String(formData.get('displayOrder') ?? '0'), 10);
    if (!categoryId || !name || !slug) throw new Error('Category name and slug are required.');

    const client = await createServerSupabaseClient();
    const { error } = await client
      .from('categories')
      .update({ name, slug, display_order: Number.isFinite(displayOrder) ? displayOrder : 0 })
      .eq('id', categoryId);
    if (error) throw new Error(error.message);

    revalidatePath('/categories');
  }

  async function toggleCategoryActiveAction(formData: FormData) {
    'use server';
    const categoryId = formData.get('categoryId') as string;
    const currentActive = formData.get('currentActive') === 'true';
    const client = await createServerSupabaseClient();

    await client
      .from('categories')
      .update({ is_active: !currentActive })
      .eq('id', categoryId);

    revalidatePath('/categories');
  }

  async function deleteCategoryAction(formData: FormData) {
    'use server';
    const categoryId = formData.get('categoryId') as string;
    const client = await createServerSupabaseClient();

    const { count, error: countError } = await client
      .from('products')
      .select('id', { count: 'exact', head: true })
      .eq('category_id', categoryId);
    if (countError) throw new Error(countError.message);

    if ((count ?? 0) > 0) {
      const { error } = await client.from('categories').update({ is_active: false }).eq('id', categoryId);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await client.from('categories').delete().eq('id', categoryId);
      if (error) throw new Error(error.message);
    }
    revalidatePath('/categories');
  }

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
            Category & Attribute Builder
          </h1>
          <p className="text-slate-400 text-sm">
            {categories.length} active marketplace product categories in PostgreSQL — define hierarchy, display order, and taxonomy.
          </p>
        </div>
        <span className="px-3 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-semibold rounded-lg flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5" />
          SERVER AUTHORIZED
        </span>
      </div>

      {/* Add New Category Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
        <h2 className="text-sm font-bold text-white uppercase tracking-wider mb-3 flex items-center gap-2">
          <Plus className="w-4 h-4 text-blue-400" />
          Create New Category Taxonomy
        </h2>
        <form action={createCategoryAction} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Category Name</label>
            <input
              type="text"
              name="name"
              required
              placeholder="e.g. Home Appliances"
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">URL Slug</label>
            <input
              type="text"
              name="slug"
              placeholder="e.g. home-appliances"
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Display Order</label>
            <input
              type="number"
              name="displayOrder"
              defaultValue={categories.length + 1}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm rounded-lg flex items-center justify-center gap-2 transition-colors"
          >
            <Plus className="w-4 h-4" /> Add Category
          </button>
        </form>
      </div>

      {/* Categories Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <table className="w-full text-left text-sm text-slate-300">
          <thead className="bg-slate-950 text-slate-400 text-xs uppercase border-b border-slate-800">
            <tr>
              <th className="p-4">Order</th>
              <th className="p-4">Category Name</th>
              <th className="p-4">Slug</th>
              <th className="p-4">Products</th>
              <th className="p-4">Status</th>
              <th className="p-4">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {categories.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-8 text-center text-slate-500">
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
                  <td className="p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <details className="relative">
                        <summary className="list-none cursor-pointer p-1 text-slate-400 hover:text-blue-400" title="Edit category">
                          <Pencil className="w-4 h-4" />
                        </summary>
                        <form action={updateCategoryAction} className="absolute right-0 z-20 mt-2 w-72 space-y-2 rounded-xl border border-slate-700 bg-slate-950 p-3 shadow-2xl">
                          <input type="hidden" name="categoryId" value={cat.id} />
                          <input name="name" required defaultValue={cat.name} className="w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-white" />
                          <input name="slug" required defaultValue={cat.slug} className="w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-white" />
                          <input name="displayOrder" type="number" defaultValue={cat.display_order} className="w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-white" />
                          <button className="w-full rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white hover:bg-blue-500">Save changes</button>
                        </form>
                      </details>
                      <form action={toggleCategoryActiveAction}>
                        <input type="hidden" name="categoryId" value={cat.id} />
                        <input type="hidden" name="currentActive" value={String(cat.is_active)} />
                        <button
                          type="submit"
                          className={`px-2.5 py-1 text-xs font-bold rounded border transition-colors ${
                            cat.is_active
                              ? 'bg-amber-500/10 text-amber-400 border-amber-500/20 hover:bg-amber-500/20'
                              : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20'
                          }`}
                        >
                          {cat.is_active ? 'Disable' : 'Enable'}
                        </button>
                      </form>

                      <form action={deleteCategoryAction}>
                        <input type="hidden" name="categoryId" value={cat.id} />
                        <button
                          type="submit"
                          className="p-1 text-slate-500 hover:text-rose-400 transition-colors"
                          title="Delete Category"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </form>
                    </div>
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
