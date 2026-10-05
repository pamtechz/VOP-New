import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/services/supabase_service.dart';
import '../../core/widgets/app_network_image.dart';
import '../../core/providers/currency_provider.dart';

// ── Provider ─────────────────────────────────────────────────────────────────
final storeDetailProvider =
    FutureProvider.family<Map<String, dynamic>?, String>((ref, slug) async {
  final data = await SupabaseService.client
      .from('stores')
      .select('''
        id, name, slug, logo_url, cover_url, description,
        status, total_sales, rating_avg, rating_count, province, city
      ''')
      .eq('slug', slug)
      .maybeSingle();
  return data;
});

final storeProductsProvider =
    FutureProvider.family<List<Map<String, dynamic>>, String>((ref, storeId) async {
  final data = await SupabaseService.client
      .from('products')
      .select('''
        id, title, price,
        product_images(url, display_order)
      ''')
      .eq('store_id', storeId)
      .eq('status', 'active')
      .order('created_at', ascending: false)
      .limit(20);
  return List<Map<String, dynamic>>.from(data as List);
});

// ── Screen ───────────────────────────────────────────────────────────────────
class StoreScreen extends ConsumerWidget {
  final String slug;
  const StoreScreen({super.key, required this.slug});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final storeAsync = ref.watch(storeDetailProvider(slug));

    return Scaffold(
      body: storeAsync.when(
        loading: () =>
            const Center(child: CircularProgressIndicator()),
        error: (e, _) => Scaffold(
          appBar: AppBar(title: Text('Store: $slug')),
          body: Center(
            child: Text('Error: $e',
                style: const TextStyle(color: Colors.red)),
          ),
        ),
        data: (store) {
          if (store == null) {
            return Scaffold(
              appBar: AppBar(title: const Text('Store Not Found')),
              body: const Center(child: Text('This store does not exist.')),
            );
          }

          final storeId = store['id'] as String;
          final storeName = store['name'] as String? ?? 'Store';
          final productsAsync = ref.watch(storeProductsProvider(storeId));

          return CustomScrollView(
            slivers: [
              SliverAppBar(
                expandedHeight: 180,
                pinned: true,
                flexibleSpace: FlexibleSpaceBar(
                  title: Text(storeName,
                      style: const TextStyle(
                          fontWeight: FontWeight.bold, fontSize: 16)),
                  background: AppNetworkImage(
                    imageUrlOrCode: store['cover_url'] as String?,
                    fit: BoxFit.cover,
                    errorWidget: Container(
                      color: scheme.primaryContainer,
                      child: Icon(Icons.storefront_rounded,
                          size: 80,
                          color: scheme.onPrimaryContainer
                              .withOpacity(0.3)),
                    ),
                  ),
                ),
              ),

              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // Store header row
                      Row(
                        children: [
                          CircleAvatar(
                            radius: 30,
                            backgroundColor: scheme.primaryContainer,
                            backgroundImage: store['logo_url'] != null
                                ? NetworkImage(store['logo_url'] as String)
                                : null,
                            child: store['logo_url'] == null
                                ? Icon(Icons.store,
                                    size: 30, color: scheme.primary)
                                : null,
                          ),
                          const SizedBox(width: 16),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(storeName,
                                    style: theme.textTheme.titleLarge?.copyWith(
                                        fontWeight: FontWeight.bold)),
                                if (store['city'] != null)
                                  Text(
                                    '${store['city']}${store['province'] != null ? ', ${store['province']}' : ''}',
                                    style: TextStyle(
                                        color: scheme.outline, fontSize: 12),
                                  ),
                              ],
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 12),

                      // Stats row
                      Row(
                        children: [
                          _StatChip(
                            icon: Icons.star_rounded,
                            color: Colors.amber,
                            label: (store['rating_count'] as int? ?? 0) > 0
                                ? '${(store['rating_avg'] as num?)?.toStringAsFixed(1)} (${store['rating_count']})'
                                : 'No ratings yet',
                          ),
                          const SizedBox(width: 8),
                          _StatChip(
                            icon: Icons.shopping_bag_outlined,
                            color: scheme.primary,
                            label:
                                '${ref.watch(currencyProvider).valueOrNull?.format((store['total_sales'] as num? ?? 0).toDouble()) ?? 'K ${(store['total_sales'] as num? ?? 0).toStringAsFixed(0)}'} sales',
                          ),
                        ],
                      ),

                      if (store['description'] != null &&
                          (store['description'] as String).isNotEmpty) ...[
                        const SizedBox(height: 12),
                        Text(store['description'] as String,
                            style: TextStyle(
                                color: scheme.onSurfaceVariant, height: 1.5)),
                      ],

                      const SizedBox(height: 20),
                      Text('Products',
                          style: theme.textTheme.titleMedium
                              ?.copyWith(fontWeight: FontWeight.bold)),
                    ],
                  ),
                ),
              ),

              // Products grid
              productsAsync.when(
                loading: () => const SliverToBoxAdapter(
                    child: Center(child: CircularProgressIndicator())),
                error: (e, _) => SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Text('Error loading products: $e',
                        style: const TextStyle(color: Colors.red)),
                  ),
                ),
                data: (products) {
                  if (products.isEmpty) {
                    return const SliverToBoxAdapter(
                      child: Padding(
                        padding: EdgeInsets.all(32),
                        child: Center(
                          child: Text('No products listed yet.',
                              style: TextStyle(color: Colors.grey)),
                        ),
                      ),
                    );
                  }
                  return SliverPadding(
                    padding: const EdgeInsets.all(12),
                    sliver: SliverGrid(
                      delegate: SliverChildBuilderDelegate(
                        (ctx, i) {
                          final p = products[i];
                          final images = (p['product_images'] as List? ?? [])
                            ..sort((a, b) =>
                                ((a['display_order'] as int?) ?? 0).compareTo(
                                    (b['display_order'] as int?) ?? 0));
                          final imgUrl = images.isNotEmpty
                              ? images.first['url'] as String?
                              : null;
                          final price =
                              (p['price'] as num?)?.toDouble() ?? 0.0;

                          return GestureDetector(
                            onTap: () => ctx.push('/product/${p['id']}'),
                            child: Container(
                              decoration: BoxDecoration(
                                color: scheme.surface,
                                borderRadius: BorderRadius.circular(12),
                                border:
                                    Border.all(color: scheme.outlineVariant),
                              ),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  ClipRRect(
                                    borderRadius: const BorderRadius.vertical(
                                        top: Radius.circular(12)),
                                    child: AspectRatio(
                                      aspectRatio: 1,
                                      child: AppNetworkImage(
                                        imageUrlOrCode: imgUrl,
                                        fit: BoxFit.cover,
                                        errorWidget: Container(
                                          color: scheme.surfaceContainerHighest,
                                          child: Icon(
                                              Icons.image_outlined,
                                              color: scheme.outline),
                                        ),
                                      ),
                                    ),
                                  ),
                                  Padding(
                                    padding: const EdgeInsets.all(8),
                                    child: Column(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.start,
                                      children: [
                                        Text(
                                          p['title'] as String? ?? '',
                                          style: const TextStyle(
                                              fontWeight: FontWeight.w600,
                                              fontSize: 12),
                                          maxLines: 2,
                                          overflow: TextOverflow.ellipsis,
                                        ),
                                        const SizedBox(height: 4),
                                        Text(
                                          ref.watch(currencyProvider).valueOrNull?.format(price) ?? 'K ${price.toStringAsFixed(2)}',
                                          style: TextStyle(
                                              fontWeight: FontWeight.bold,
                                              color: scheme.primary,
                                              fontSize: 13),
                                        ),
                                      ],
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          );
                        },
                        childCount: products.length,
                      ),
                      gridDelegate:
                          const SliverGridDelegateWithFixedCrossAxisCount(
                        crossAxisCount: 2,
                        crossAxisSpacing: 10,
                        mainAxisSpacing: 10,
                        childAspectRatio: 0.75,
                      ),
                    ),
                  );
                },
              ),

              const SliverToBoxAdapter(child: SizedBox(height: 40)),
            ],
          );
        },
      ),
    );
  }
}

class _StatChip extends StatelessWidget {
  final IconData icon;
  final Color color;
  final String label;
  const _StatChip(
      {required this.icon, required this.color, required this.label});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: color.withOpacity(0.08),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: color.withOpacity(0.2)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 14, color: color),
          const SizedBox(width: 4),
          Text(label,
              style: TextStyle(
                  fontSize: 12, color: color, fontWeight: FontWeight.w500)),
        ],
      ),
    );
  }
}
