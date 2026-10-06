import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../../core/services/supabase_service.dart';
import '../../core/widgets/app_network_image.dart';

final sellerProductsProvider = FutureProvider<List<Map<String, dynamic>>>((ref) async {
  final user = Supabase.instance.client.auth.currentUser;
  if (user == null) return [];

  // Get user's store
  final store = await SupabaseService.client
      .from('stores')
      .select('id')
      .eq('owner_id', user.id)
      .maybeSingle();

  var query = SupabaseService.client
      .from('products')
      .select('''
        id, title, price, status, is_featured,
        product_images(url, display_order),
        inventory(quantity)
      ''');

  if (store != null) {
    query = query.eq('store_id', store['id']);
  }

  final data = await query.order('created_at', ascending: false);
  return List<Map<String, dynamic>>.from(data as List);
});

class ManageProductsScreen extends ConsumerWidget {
  const ManageProductsScreen({super.key});

  Future<void> _editProduct(
    BuildContext context,
    WidgetRef ref,
    Map<String, dynamic> product,
  ) async {
    final titleController = TextEditingController(text: product['title']?.toString() ?? '');
    final priceController = TextEditingController(text: product['price']?.toString() ?? '0');
    final inventoryRows = product['inventory'] as List? ?? const [];
    final initialStock = inventoryRows.isNotEmpty
        ? (inventoryRows.first['quantity']?.toString() ?? '0')
        : '0';
    final stockController = TextEditingController(text: initialStock);
    String status = product['status']?.toString() ?? 'active';

    final save = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (ctx) => StatefulBuilder(
        builder: (context, setModalState) => Padding(
          padding: EdgeInsets.fromLTRB(
            20,
            20,
            20,
            MediaQuery.of(context).viewInsets.bottom + 20,
          ),
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('Edit Product', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                const SizedBox(height: 16),
                TextField(
                  controller: titleController,
                  decoration: const InputDecoration(labelText: 'Title', border: OutlineInputBorder()),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: priceController,
                  keyboardType: const TextInputType.numberWithOptions(decimal: true),
                  decoration: const InputDecoration(labelText: 'Price', prefixText: 'K ', border: OutlineInputBorder()),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: stockController,
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(labelText: 'Stock', border: OutlineInputBorder()),
                ),
                const SizedBox(height: 12),
                DropdownButtonFormField<String>(
                  value: status,
                  decoration: const InputDecoration(labelText: 'Status', border: OutlineInputBorder()),
                  items: const [
                    DropdownMenuItem(value: 'active', child: Text('Active')),
                    DropdownMenuItem(value: 'draft', child: Text('Draft')),
                    DropdownMenuItem(value: 'archived', child: Text('Archived')),
                    DropdownMenuItem(value: 'out_of_stock', child: Text('Out of stock')),
                  ],
                  onChanged: (value) {
                    if (value != null) setModalState(() => status = value);
                  },
                ),
                const SizedBox(height: 20),
                SizedBox(
                  width: double.infinity,
                  child: FilledButton(
                    onPressed: () => Navigator.pop(ctx, true),
                    child: const Text('Save Changes'),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );

    if (save != true) return;

    final title = titleController.text.trim();
    final price = double.tryParse(priceController.text.trim());
    final stock = int.tryParse(stockController.text.trim());
    if (title.isEmpty || price == null || price < 0 || stock == null || stock < 0) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Enter a valid title, price, and stock quantity.')),
        );
      }
      return;
    }

    try {
      await SupabaseService.client.from('products').update({
        'title': title,
        'price': price,
        'status': status,
        'updated_at': DateTime.now().toUtc().toIso8601String(),
      }).eq('id', product['id']);

      await SupabaseService.client
          .from('inventory')
          .update({
            'quantity': stock,
            'updated_at': DateTime.now().toUtc().toIso8601String(),
          })
          .eq('product_id', product['id'])
          .isFilter('variant_id', null);

      ref.invalidate(sellerProductsProvider);
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Product updated successfully.')),
        );
      }
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Could not update product: $e')),
        );
      }
    }
  }

  Future<void> _deleteProduct(
    BuildContext context,
    WidgetRef ref,
    Map<String, dynamic> product,
  ) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Remove product?'),
        content: Text(
          'Remove “${product['title'] ?? 'this product'}”? '
          'If it has already been sold, it will be archived instead of erased so order and financial history remain intact.',
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Remove'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;

    try {
      final references = await SupabaseService.client
          .from('order_items')
          .select('id')
          .eq('product_id', product['id'])
          .limit(1);

      final hasSales = (references as List).isNotEmpty;
      if (hasSales) {
        await SupabaseService.client
            .from('products')
            .update({
              'status': 'archived',
              'updated_at': DateTime.now().toUtc().toIso8601String(),
            })
            .eq('id', product['id']);
      } else {
        await SupabaseService.client
            .from('products')
            .delete()
            .eq('id', product['id']);
      }

      ref.invalidate(sellerProductsProvider);
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(hasSales
                ? 'Product archived because it has sales history.'
                : 'Product deleted.'),
          ),
        );
      }
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Could not remove product: $e')),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final productsAsync = ref.watch(sellerProductsProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Manage Products'),
        actions: [
          IconButton(
            icon: const Icon(Icons.add),
            tooltip: 'Add Product',
            onPressed: () => context.push('/seller/products/add'),
          ),
        ],
      ),
      body: productsAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.error_outline, size: 48, color: Colors.redAccent),
                const SizedBox(height: 12),
                Text('Error loading products: $e', textAlign: TextAlign.center),
                const SizedBox(height: 16),
                ElevatedButton(
                  onPressed: () => ref.refresh(sellerProductsProvider),
                  child: const Text('Retry'),
                ),
              ],
            ),
          ),
        ),
        data: (products) {
          if (products.isEmpty) {
            return Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.inventory_2_outlined, size: 64, color: scheme.outline),
                  const SizedBox(height: 16),
                  Text('No products listed yet', style: theme.textTheme.titleMedium),
                  const SizedBox(height: 12),
                  ElevatedButton.icon(
                    icon: const Icon(Icons.add),
                    onPressed: () => context.push('/seller/products/add'),
                    label: const Text('Add Your First Product'),
                  ),
                ],
              ),
            );
          }

          return RefreshIndicator(
            onRefresh: () async => ref.refresh(sellerProductsProvider),
            child: ListView.separated(
              padding: const EdgeInsets.all(16),
              itemCount: products.length,
              separatorBuilder: (_, __) => const SizedBox(height: 10),
              itemBuilder: (context, i) {
                final p = products[i];
                final title = p['title'] as String? ?? 'Untitled';
                final price = double.tryParse(p['price']?.toString() ?? '0') ?? 0.0;
                final status = p['status'] as String? ?? 'active';
                final images = p['product_images'] as List? ?? [];
                final imageUrl = images.isNotEmpty ? (images[0]['url'] as String?) : null;
                final inv = p['inventory'] as List? ?? [];
                final stock = inv.isNotEmpty ? (inv[0]['quantity'] as int? ?? 0) : 0;

                return Card(
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  child: ListTile(
                    contentPadding: const EdgeInsets.all(12),
                    leading: AppNetworkImage(
                      imageUrlOrCode: imageUrl,
                      width: 54,
                      height: 54,
                      borderRadius: BorderRadius.circular(8),
                      fit: BoxFit.cover,
                      errorWidget: Container(
                        width: 54,
                        height: 54,
                        decoration: BoxDecoration(
                          color: scheme.surfaceVariant,
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: const Icon(Icons.shopping_bag_outlined),
                      ),
                    ),
                    title: Text(title, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
                    subtitle: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const SizedBox(height: 4),
                        Text(
                          'Price: K${price.toStringAsFixed(2)} | Stock: $stock',
                          style: TextStyle(fontSize: 12, color: scheme.onSurfaceVariant),
                        ),
                        const SizedBox(height: 4),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                          decoration: BoxDecoration(
                            color: status == 'active' ? const Color(0xFF10B981).withOpacity(0.15) : Colors.amber.withOpacity(0.15),
                            borderRadius: BorderRadius.circular(4),
                          ),
                          child: Text(
                            status.toUpperCase(),
                            style: TextStyle(
                              fontSize: 9,
                              fontWeight: FontWeight.bold,
                              color: status == 'active' ? const Color(0xFF10B981) : Colors.amber,
                            ),
                          ),
                        ),
                      ],
                    ),
                    onTap: () => context.push('/product/${p['id']}'),
                    trailing: PopupMenuButton<String>(
                      tooltip: 'Product actions',
                      onSelected: (action) {
                        if (action == 'edit') {
                          _editProduct(context, ref, p);
                        } else if (action == 'delete') {
                          _deleteProduct(context, ref, p);
                        }
                      },
                      itemBuilder: (_) => const [
                        PopupMenuItem(
                          value: 'edit',
                          child: ListTile(
                            dense: true,
                            leading: Icon(Icons.edit_outlined),
                            title: Text('Edit'),
                          ),
                        ),
                        PopupMenuItem(
                          value: 'delete',
                          child: ListTile(
                            dense: true,
                            leading: Icon(Icons.delete_outline, color: Colors.redAccent),
                            title: Text('Delete / archive'),
                          ),
                        ),
                      ],
                    ),
                  ),
                );
              },
            ),
          );
        },
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => context.push('/seller/products/add'),
        icon: const Icon(Icons.add),
        label: const Text('Add Product'),
      ),
    );
  }
}
