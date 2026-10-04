import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../../core/services/supabase_service.dart';

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
                    leading: ClipRRect(
                      borderRadius: BorderRadius.circular(8),
                      child: Container(
                        width: 54,
                        height: 54,
                        color: scheme.surfaceVariant,
                        child: imageUrl != null && imageUrl.isNotEmpty
                            ? Image.network(imageUrl, fit: BoxFit.cover, errorBuilder: (_, __, ___) => const Icon(Icons.broken_image))
                            : const Icon(Icons.shopping_bag_outlined),
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
                    trailing: IconButton(
                      icon: const Icon(Icons.chevron_right),
                      onPressed: () => context.push('/product/${p['id']}'),
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
