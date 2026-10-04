import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../../core/services/supabase_service.dart';

// ── Provider ─────────────────────────────────────────────────────────────────
final productDetailProvider =
    FutureProvider.family<Map<String, dynamic>?, String>((ref, id) async {
  final data = await SupabaseService.client
      .from('products')
      .select('''
        id, title, description, price, compare_at_price, status, is_featured,
        product_images(url, display_order),
        stores(id, name, slug, logo_url),
        categories(name),
        inventory(quantity, reserved_quantity)
      ''')
      .eq('id', id)
      .maybeSingle();
  return data;
});

// ── Screen ───────────────────────────────────────────────────────────────────
class ProductDetailScreen extends ConsumerStatefulWidget {
  final String productId;
  const ProductDetailScreen({super.key, required this.productId});

  @override
  ConsumerState<ProductDetailScreen> createState() =>
      _ProductDetailScreenState();
}

class _ProductDetailScreenState extends ConsumerState<ProductDetailScreen> {
  int selectedQuantity = 1;
  int _imageIndex = 0;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final productAsync = ref.watch(productDetailProvider(widget.productId));

    return Scaffold(
      appBar: AppBar(
        title: const Text('Product Details'),
        actions: [
          IconButton(
            icon: const Icon(Icons.shopping_cart_outlined),
            onPressed: () => context.push('/cart'),
          ),
        ],
      ),
      body: productAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.error_outline, size: 48, color: scheme.error),
                const SizedBox(height: 12),
                Text('Failed to load product',
                    style: theme.textTheme.titleMedium),
                const SizedBox(height: 8),
                Text(e.toString(),
                    textAlign: TextAlign.center,
                    style: TextStyle(color: scheme.outline, fontSize: 12)),
                const SizedBox(height: 16),
                FilledButton(
                  onPressed: () =>
                      ref.invalidate(productDetailProvider(widget.productId)),
                  child: const Text('Retry'),
                ),
              ],
            ),
          ),
        ),
        data: (product) {
          if (product == null) {
            return const Center(child: Text('Product not found.'));
          }

          final images = (product['product_images'] as List? ?? [])
            ..sort((a, b) =>
                ((a['display_order'] as int?) ?? 0)
                    .compareTo((b['display_order'] as int?) ?? 0));
          final imageUrls =
              images.map((img) => img['url'] as String?).whereType<String>().toList();

          final store = product['stores'] as Map<String, dynamic>?;
          final storeName = store?['name'] as String? ?? 'Unknown Store';
          final storeSlug = store?['slug'] as String? ?? '';
          final storeId = store?['id'] as String? ?? '';

          final price = (product['price'] as num?)?.toDouble() ?? 0.0;
          final compareAt = (product['compare_at_price'] as num?)?.toDouble();
          final title = product['title'] as String? ?? 'Product';

          // Stock from inventory
          final inventoryList = product['inventory'] as List? ?? [];
          final stockQty = inventoryList.isNotEmpty
              ? ((inventoryList.first['quantity'] as int? ?? 0) -
                  (inventoryList.first['reserved_quantity'] as int? ?? 0))
              : 0;

          return SingleChildScrollView(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Image Carousel
                SizedBox(
                  height: 300,
                  child: imageUrls.isEmpty
                      ? Container(
                          color: scheme.surfaceContainerHighest,
                          child: Center(
                            child: Icon(Icons.image_outlined,
                                size: 80, color: scheme.outline),
                          ),
                        )
                      : Stack(
                          children: [
                            PageView.builder(
                              itemCount: imageUrls.length,
                              onPageChanged: (i) =>
                                  setState(() => _imageIndex = i),
                              itemBuilder: (_, i) => Image.network(
                                imageUrls[i],
                                fit: BoxFit.cover,
                                width: double.infinity,
                                errorBuilder: (_, __, ___) => Container(
                                  color: scheme.surfaceContainerHighest,
                                  child: Icon(Icons.broken_image,
                                      size: 48, color: scheme.outline),
                                ),
                              ),
                            ),
                            if (imageUrls.length > 1)
                              Positioned(
                                bottom: 12,
                                right: 12,
                                child: Container(
                                  padding: const EdgeInsets.symmetric(
                                      horizontal: 10, vertical: 4),
                                  decoration: BoxDecoration(
                                    color: Colors.black54,
                                    borderRadius: BorderRadius.circular(12),
                                  ),
                                  child: Text(
                                    '${_imageIndex + 1}/${imageUrls.length}',
                                    style: const TextStyle(
                                        color: Colors.white, fontSize: 12),
                                  ),
                                ),
                              ),
                          ],
                        ),
                ),

                Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // Store link
                      InkWell(
                        onTap: () => context.push('/store/$storeSlug'),
                        child: Row(
                          children: [
                            CircleAvatar(
                              radius: 14,
                              backgroundColor: scheme.primaryContainer,
                              child: Icon(Icons.store,
                                  size: 16, color: scheme.primary),
                            ),
                            const SizedBox(width: 8),
                            Text(storeName,
                                style: const TextStyle(
                                    fontWeight: FontWeight.bold, fontSize: 13)),
                            const Icon(Icons.chevron_right,
                                size: 16, color: Colors.grey),
                          ],
                        ),
                      ),
                      const SizedBox(height: 12),

                      // Title & Price
                      Text(title,
                          style: theme.textTheme.titleLarge
                              ?.copyWith(fontWeight: FontWeight.bold)),
                      const SizedBox(height: 8),
                      Row(
                        children: [
                          Text(
                            'KES ${price.toStringAsFixed(0)}',
                            style: TextStyle(
                                fontSize: 22,
                                fontWeight: FontWeight.bold,
                                color: scheme.primary),
                          ),
                          if (compareAt != null && compareAt > price) ...[
                            const SizedBox(width: 10),
                            Text(
                              'KES ${compareAt.toStringAsFixed(0)}',
                              style: const TextStyle(
                                  fontSize: 14,
                                  decoration: TextDecoration.lineThrough,
                                  color: Colors.grey),
                            ),
                            const SizedBox(width: 8),
                            Container(
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 6, vertical: 2),
                              decoration: BoxDecoration(
                                color: Colors.red.shade50,
                                borderRadius: BorderRadius.circular(4),
                              ),
                              child: Text(
                                '-${((1 - price / compareAt) * 100).toStringAsFixed(0)}%',
                                style: TextStyle(
                                    fontSize: 12,
                                    color: Colors.red.shade700,
                                    fontWeight: FontWeight.bold),
                              ),
                            ),
                          ],
                        ],
                      ),
                      const SizedBox(height: 8),

                      // Stock badge
                      Row(
                        children: [
                          Icon(
                            stockQty > 0
                                ? Icons.check_circle_outline
                                : Icons.cancel_outlined,
                            size: 16,
                            color: stockQty > 0 ? Colors.green : Colors.red,
                          ),
                          const SizedBox(width: 4),
                          Text(
                            stockQty > 0
                                ? '$stockQty in stock'
                                : 'Out of stock',
                            style: TextStyle(
                                fontSize: 13,
                                color: stockQty > 0
                                    ? Colors.green
                                    : Colors.red),
                          ),
                        ],
                      ),
                      const SizedBox(height: 20),

                      // Quantity selector (only if in stock)
                      if (stockQty > 0) ...[
                        Row(
                          children: [
                            const Text('Quantity:',
                                style: TextStyle(fontWeight: FontWeight.bold)),
                            const SizedBox(width: 16),
                            IconButton(
                              icon: const Icon(Icons.remove_circle_outline),
                              onPressed: selectedQuantity > 1
                                  ? () => setState(() => selectedQuantity--)
                                  : null,
                            ),
                            Text('$selectedQuantity',
                                style: const TextStyle(
                                    fontWeight: FontWeight.bold, fontSize: 16)),
                            IconButton(
                              icon: const Icon(Icons.add_circle_outline),
                              onPressed: selectedQuantity < stockQty
                                  ? () => setState(() => selectedQuantity++)
                                  : null,
                            ),
                          ],
                        ),
                        const SizedBox(height: 20),
                      ],

                      // Description
                      if (product['description'] != null &&
                          (product['description'] as String).isNotEmpty) ...[
                        Text('Description',
                            style: theme.textTheme.titleMedium
                                ?.copyWith(fontWeight: FontWeight.bold)),
                        const SizedBox(height: 6),
                        Text(
                          product['description'] as String,
                          style: TextStyle(
                              color: scheme.onSurfaceVariant, height: 1.5),
                        ),
                        const SizedBox(height: 30),
                      ],
                    ],
                  ),
                ),
              ],
            ),
          );
        },
      ),
      bottomNavigationBar: productAsync.maybeWhen(
        data: (product) {
          if (product == null) return null;
          final inventoryList = product['inventory'] as List? ?? [];
          final stockQty = inventoryList.isNotEmpty
              ? ((inventoryList.first['quantity'] as int? ?? 0) -
                  (inventoryList.first['reserved_quantity'] as int? ?? 0))
              : 0;
          final store = product['stores'] as Map<String, dynamic>?;
          final storeId = store?['id'] as String? ?? '';

          return SafeArea(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Row(
                children: [
                  OutlinedButton.icon(
                    icon: const Icon(Icons.chat_bubble_outline),
                    label: const Text('Chat'),
                    onPressed: storeId.isNotEmpty
                        ? () => context.push('/chat/$storeId')
                        : null,
                    style: OutlinedButton.styleFrom(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 16, vertical: 14)),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: FilledButton.icon(
                      icon: const Icon(Icons.add_shopping_cart),
                      label: Text(stockQty > 0 ? 'Add to Cart' : 'Out of Stock'),
                      onPressed: stockQty > 0
                          ? () {
                              ScaffoldMessenger.of(context).showSnackBar(
                                const SnackBar(
                                    content: Text('Added to cart!')),
                              );
                              context.push('/cart');
                            }
                          : null,
                    ),
                  ),
                ],
              ),
            ),
          );
        },
        orElse: () => null,
      ),
    );
  }
}
