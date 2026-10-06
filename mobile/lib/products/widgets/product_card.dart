import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../cart/providers/cart_provider.dart';
import '../../core/providers/currency_provider.dart';
import '../../core/widgets/app_network_image.dart';
import '../../marketplace/services/recommendation_service.dart';

class ProductCard extends ConsumerWidget {
  final Map<String, dynamic> product;
  final double? width;
  final VoidCallback? onTap;

  const ProductCard({
    super.key,
    required this.product,
    this.width,
    this.onTap,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final scheme = Theme.of(context).colorScheme;
    final rawImages = product['images'] ?? product['product_images'];
    final images = (rawImages as List? ?? [])
      ..sort((a, b) =>
          ((a['display_order'] as int?) ?? 0)
              .compareTo((b['display_order'] as int?) ?? 0));
    final imageUrl = images.isNotEmpty ? images.first['url'] as String? : null;
    final title = product['title'] as String? ?? '';
    final price = (product['price'] as num?)?.toDouble() ?? 0.0;
    final compareAt = (product['compare_at_price'] as num?)?.toDouble();
    final store = product['stores'] as Map<String, dynamic>?;
    final storeName = (store?['name'] as String?) ?? (product['store_name'] as String?) ?? '';
    final badgeLabel = product['badge_label'] as String?;
    final productId = product['id'] as String? ?? '';
    final categoryId = product['category_id'] as String?;
    final storeId = (product['store_id'] as String?) ?? (store?['id'] as String?);
    final currency = ref.watch(currencyProvider).valueOrNull ?? const CurrencyConfig();

    return GestureDetector(
      onTap: () {
        if (onTap != null) {
          onTap!();
        } else {
          RecommendationService.recordInteraction(
            eventType: 'click',
            productId: productId,
            categoryId: categoryId,
            storeId: storeId,
          );
          context.push('/product/$productId');
        }
      },
      child: Container(
        width: width,
        decoration: BoxDecoration(
          color: scheme.surfaceContainerHighest.withValues(alpha: 0.35),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: scheme.outlineVariant.withValues(alpha: 0.3)),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.04),
              blurRadius: 8,
              offset: const Offset(0, 2),
            ),
          ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Image
            ClipRRect(
              borderRadius: const BorderRadius.vertical(top: Radius.circular(16)),
              child: AspectRatio(
                aspectRatio: 1.15,
                child: AppNetworkImage(
                  imageUrlOrCode: imageUrl,
                  fit: BoxFit.cover,
                  errorWidget: Container(
                    color: scheme.surfaceContainerHighest,
                    child: Center(
                      child: Icon(
                        Icons.shopping_bag_outlined,
                        size: 32,
                        color: scheme.outlineVariant,
                      ),
                    ),
                  ),
                ),
              ),
            ),
            // Info
            Expanded(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Flexible(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          if (badgeLabel != null && badgeLabel.isNotEmpty) ...[
                            Container(
                              margin: const EdgeInsets.only(bottom: 4),
                              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                              decoration: BoxDecoration(
                                color: badgeLabel == 'Best Match'
                                    ? const Color(0xFF2563EB).withValues(alpha: 0.15)
                                    : badgeLabel == 'Fresh Drop'
                                        ? const Color(0xFF059669).withValues(alpha: 0.15)
                                        : badgeLabel == 'Top Rated Seller'
                                            ? const Color(0xFFD97706).withValues(alpha: 0.15)
                                            : scheme.primaryContainer.withValues(alpha: 0.5),
                                borderRadius: BorderRadius.circular(4),
                              ),
                              child: Text(
                                badgeLabel,
                                style: TextStyle(
                                  fontSize: 9,
                                  fontWeight: FontWeight.bold,
                                  color: badgeLabel == 'Best Match'
                                      ? const Color(0xFF2563EB)
                                      : badgeLabel == 'Fresh Drop'
                                          ? const Color(0xFF059669)
                                          : badgeLabel == 'Top Rated Seller'
                                              ? const Color(0xFFD97706)
                                              : scheme.primary,
                                ),
                              ),
                            ),
                          ],
                          if (storeName.isNotEmpty) ...[
                            Text(
                              storeName,
                              style: TextStyle(
                                fontSize: 10,
                                color: scheme.outline,
                                fontWeight: FontWeight.w500,
                              ),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                            const SizedBox(height: 2),
                          ],
                          Text(
                            title,
                            style: const TextStyle(
                              fontWeight: FontWeight.w600,
                              fontSize: 12,
                              height: 1.2,
                            ),
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 4),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      crossAxisAlignment: CrossAxisAlignment.center,
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                currency.format(price),
                                style: TextStyle(
                                  fontWeight: FontWeight.bold,
                                  fontSize: 13,
                                  color: scheme.primary,
                                ),
                              ),
                              if (compareAt != null && compareAt > price)
                                Text(
                                  currency.format(compareAt),
                                  style: TextStyle(
                                    decoration: TextDecoration.lineThrough,
                                    fontSize: 10,
                                    color: scheme.outline,
                                  ),
                                ),
                            ],
                          ),
                        ),
                        InkWell(
                          onTap: () {
                            ref.read(cartProvider.notifier).addItem(
                                  productId: productId,
                                  title: title,
                                  price: price,
                                  imageUrl: imageUrl,
                                  storeId: storeId ?? (store?['id'] as String? ?? 'store'),
                                  storeName: storeName.isNotEmpty ? storeName : 'Store',
                                );
                            ScaffoldMessenger.of(context).showSnackBar(
                              SnackBar(
                                content: Text('$title added to cart!'),
                                duration: const Duration(seconds: 1),
                              ),
                            );
                          },
                          borderRadius: BorderRadius.circular(20),
                          child: Container(
                            padding: const EdgeInsets.all(6),
                            decoration: BoxDecoration(
                              color: scheme.primaryContainer,
                              shape: BoxShape.circle,
                            ),
                            child: Icon(
                              Icons.add_shopping_cart,
                              size: 14,
                              color: scheme.onPrimaryContainer,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
