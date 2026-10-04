import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/services/supabase_service.dart';

// ── Real Products Provider for Cart ──────────────────────────────────────────
final cartProductsProvider = FutureProvider<List<Map<String, dynamic>>>((ref) async {
  final data = await SupabaseService.client
      .from('products')
      .select('''
        id, title, price, status,
        product_images(url, display_order),
        stores(id, name, slug)
      ''')
      .eq('status', 'active')
      .limit(5);
  return List<Map<String, dynamic>>.from(data as List);
});

class CartScreen extends ConsumerStatefulWidget {
  const CartScreen({super.key});

  @override
  ConsumerState<CartScreen> createState() => _CartScreenState();
}

class _CartScreenState extends ConsumerState<CartScreen> {
  final Map<String, int> _quantities = {};

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final productsAsync = ref.watch(cartProductsProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Shopping Cart'),
      ),
      body: productsAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.error_outline, size: 48, color: Colors.rose),
                const SizedBox(height: 12),
                Text('Error loading cart: $e', textAlign: TextAlign.center),
                const SizedBox(height: 16),
                ElevatedButton(
                  onPressed: () => ref.refresh(cartProductsProvider),
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
                  Icon(Icons.shopping_cart_outlined, size: 64, color: scheme.outline),
                  const SizedBox(height: 16),
                  Text('Your cart is empty', style: theme.textTheme.titleMedium),
                  const SizedBox(height: 12),
                  ElevatedButton(
                    onPressed: () => context.go('/'),
                    child: const Text('Start Shopping'),
                  ),
                ],
              ),
            );
          }

          // Initialize default quantities for available products
          for (final p in products) {
            final id = p['id'] as String;
            _quantities.putIfAbsent(id, () => 1);
          }

          // Group products by Store
          final Map<String, List<Map<String, dynamic>>> storeGroups = {};
          final Map<String, String> storeNames = {};

          for (final p in products) {
            final store = p['stores'] as Map<String, dynamic>?;
            final storeId = store?['id'] as String? ?? 'default';
            final storeName = store?['name'] as String? ?? 'Marketplace Seller';
            storeGroups.putIfAbsent(storeId, () => []).add(p);
            storeNames[storeId] = storeName;
          }

          double totalAmount = 0.0;
          for (final p in products) {
            final id = p['id'] as String;
            final qty = _quantities[id] ?? 1;
            final price = double.tryParse(p['price']?.toString() ?? '0') ?? 0.0;
            totalAmount += price * qty;
          }

          return Column(
            children: [
              Expanded(
                child: ListView(
                  padding: const EdgeInsets.all(16),
                  children: [
                    ...storeGroups.entries.map((entry) {
                      final storeId = entry.key;
                      final storeName = storeNames[storeId] ?? 'Seller';
                      final items = entry.value;

                      return Card(
                        margin: const EdgeInsets.only(bottom: 16),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                        child: Padding(
                          padding: const EdgeInsets.all(14),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                children: [
                                  Icon(Icons.storefront_rounded, size: 20, color: scheme.primary),
                                  const SizedBox(width: 8),
                                  Text(
                                    storeName,
                                    style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15),
                                  ),
                                ],
                              ),
                              const Divider(height: 20),
                              ...items.map((item) {
                                final id = item['id'] as String;
                                final title = item['title'] as String? ?? 'Product';
                                final price = double.tryParse(item['price']?.toString() ?? '0') ?? 0.0;
                                final images = item['product_images'] as List? ?? [];
                                final imageUrl = images.isNotEmpty ? (images[0]['url'] as String?) : null;
                                final qty = _quantities[id] ?? 1;

                                return Padding(
                                  padding: const EdgeInsets.symmetric(vertical: 8),
                                  child: Row(
                                    children: [
                                      ClipRRect(
                                        borderRadius: BorderRadius.circular(8),
                                        child: Container(
                                          width: 56,
                                          height: 56,
                                          color: scheme.surfaceVariant,
                                          child: imageUrl != null && imageUrl.isNotEmpty
                                              ? Image.network(
                                                  imageUrl,
                                                  fit: BoxFit.cover,
                                                  errorBuilder: (_, __, ___) => const Icon(Icons.broken_image),
                                                )
                                              : const Icon(Icons.shopping_bag_outlined),
                                        ),
                                      ),
                                      const SizedBox(width: 12),
                                      Expanded(
                                        child: Column(
                                          crossAxisAlignment: CrossAxisAlignment.start,
                                          children: [
                                            Text(
                                              title,
                                              maxLines: 1,
                                              overflow: TextOverflow.ellipsis,
                                              style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14),
                                            ),
                                            const SizedBox(height: 4),
                                            Text(
                                              'K${price.toStringAsFixed(2)}',
                                              style: TextStyle(
                                                color: scheme.primary,
                                                fontWeight: FontWeight.bold,
                                                fontSize: 13,
                                              ),
                                            ),
                                          ],
                                        ),
                                      ),
                                      Row(
                                        mainAxisSize: MainAxisSize.min,
                                        children: [
                                          IconButton(
                                            icon: const Icon(Icons.remove_circle_outline, size: 20),
                                            onPressed: qty > 1
                                                ? () => setState(() => _quantities[id] = qty - 1)
                                                : null,
                                          ),
                                          Text('$qty', style: const TextStyle(fontWeight: FontWeight.bold)),
                                          IconButton(
                                            icon: const Icon(Icons.add_circle_outline, size: 20),
                                            onPressed: () => setState(() => _quantities[id] = qty + 1),
                                          ),
                                        ],
                                      ),
                                    ],
                                  ),
                                );
                              }),
                            ],
                          ),
                        ),
                      );
                    }),
                  ],
                ),
              ),

              // Checkout bottom bar
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: scheme.surface,
                  border: Border(top: BorderSide(color: scheme.outlineVariant)),
                ),
                child: SafeArea(
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Text('Total Amount', style: TextStyle(fontSize: 12, color: Colors.grey)),
                          Text(
                            'K${totalAmount.toStringAsFixed(2)}',
                            style: TextStyle(
                              fontSize: 20,
                              fontWeight: FontWeight.bold,
                              color: scheme.primary,
                            ),
                          ),
                        ],
                      ),
                      ElevatedButton(
                        style: ElevatedButton.styleFrom(
                          padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 14),
                          backgroundColor: scheme.primary,
                          foregroundColor: scheme.onPrimary,
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                        ),
                        onPressed: () => context.push('/checkout'),
                        child: const Text('Proceed to Checkout', style: TextStyle(fontWeight: FontWeight.bold)),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}
