import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../../core/services/supabase_service.dart';
import '../../core/providers/currency_provider.dart';
import '../../products/widgets/product_card.dart';
import '../../marketplace/services/recommendation_service.dart';

final wishlistItemsProvider = FutureProvider<List<Map<String, dynamic>>>((ref) async {
  final user = Supabase.instance.client.auth.currentUser;
  if (user == null) return [];

  final data = await SupabaseService.client
      .from('wishlists')
      .select('''
        created_at,
        products (
          id, title, price, compare_at_price, category_id, store_id, status, is_featured, is_sponsored,
          stores (id, name, rating_avg),
          product_images (id, url, display_order)
        )
      ''')
      .eq('user_id', user.id)
      .order('created_at', ascending: false);

  final list = <Map<String, dynamic>>[];
  for (final row in (data as List)) {
    final prod = row['products'] as Map<String, dynamic>?;
    if (prod != null && prod['status'] == 'active') {
      list.add(prod);
    }
  }
  return list;
});

class WishlistScreen extends ConsumerWidget {
  const WishlistScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final wishlistAsync = ref.watch(wishlistItemsProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Saved Items & Wishlist'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: () => ref.invalidate(wishlistItemsProvider),
          ),
        ],
      ),
      body: wishlistAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.error_outline, size: 48, color: scheme.error),
                const SizedBox(height: 12),
                Text('Could not load saved items', style: theme.textTheme.titleMedium),
                const SizedBox(height: 16),
                FilledButton(
                  onPressed: () => ref.invalidate(wishlistItemsProvider),
                  child: const Text('Retry'),
                ),
              ],
            ),
          ),
        ),
        data: (products) {
          if (products.isEmpty) {
            return Center(
              child: Padding(
                padding: const EdgeInsets.all(32),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Container(
                      padding: const EdgeInsets.all(20),
                      decoration: BoxDecoration(
                        color: scheme.primaryContainer.withValues(alpha: 0.3),
                        shape: BoxShape.circle,
                      ),
                      child: Icon(Icons.favorite_border_rounded, size: 48, color: scheme.primary),
                    ),
                    const SizedBox(height: 16),
                    Text('Your wishlist is empty', style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.bold)),
                    const SizedBox(height: 8),
                    Text(
                      'Tap the heart icon on any product to save it for later.',
                      textAlign: TextAlign.center,
                      style: TextStyle(color: scheme.outline),
                    ),
                    const SizedBox(height: 24),
                    FilledButton.icon(
                      icon: const Icon(Icons.shopping_bag_outlined),
                      label: const Text('Explore Products'),
                      onPressed: () => context.go('/'),
                    ),
                  ],
                ),
              ),
            );
          }

          return GridView.builder(
            padding: const EdgeInsets.all(16),
            itemCount: products.length,
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 2,
              crossAxisSpacing: 12,
              mainAxisSpacing: 12,
              childAspectRatio: 0.54,
            ),
            itemBuilder: (ctx, i) => ProductCard(product: products[i]),
          );
        },
      ),
    );
  }
}
