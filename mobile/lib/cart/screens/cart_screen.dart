import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../providers/cart_provider.dart';
import '../../core/widgets/app_network_image.dart';

class CartScreen extends ConsumerWidget {
  const CartScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final cartItems = ref.watch(cartProvider);
    final cartNotifier = ref.read(cartProvider.notifier);

    final subtotal = cartNotifier.subtotal;
    final itemsByStore = cartNotifier.itemsByStore;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Shopping Cart'),
        actions: [
          if (cartItems.isNotEmpty)
            IconButton(
              icon: const Icon(Icons.delete_sweep_outlined),
              tooltip: 'Clear Cart',
              onPressed: () {
                showDialog(
                  context: context,
                  builder: (ctx) => AlertDialog(
                    title: const Text('Clear Cart?'),
                    content: const Text('Are you sure you want to remove all items from your cart?'),
                    actions: [
                      TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
                      FilledButton(
                        onPressed: () {
                          cartNotifier.clear();
                          Navigator.pop(ctx);
                        },
                        child: const Text('Clear'),
                      ),
                    ],
                  ),
                );
              },
            ),
        ],
      ),
      body: cartItems.isEmpty
          ? Center(
              child: Padding(
                padding: const EdgeInsets.all(32.0),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.shopping_cart_outlined, size: 72, color: scheme.outline),
                    const SizedBox(height: 16),
                    Text('Your Cart is Empty', style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.bold)),
                    const SizedBox(height: 8),
                    const Text(
                      'Explore products from local verified stores and start shopping.',
                      textAlign: TextAlign.center,
                      style: TextStyle(color: Colors.grey),
                    ),
                    const SizedBox(height: 24),
                    ElevatedButton.icon(
                      icon: const Icon(Icons.storefront),
                      label: const Text('Browse Marketplace'),
                      style: ElevatedButton.styleFrom(
                        padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
                      ),
                      onPressed: () => context.go('/'),
                    ),
                  ],
                ),
              ),
            )
          : Column(
              children: [
                Expanded(
                  child: ListView(
                    padding: const EdgeInsets.all(16),
                    children: itemsByStore.entries.map((entry) {
                      final storeItems = entry.value;
                      final storeName = storeItems.first.storeName;

                      return Card(
                        margin: const EdgeInsets.only(bottom: 16),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                        child: Padding(
                          padding: const EdgeInsets.all(14),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                children: [
                                  Icon(Icons.storefront_rounded, size: 18, color: scheme.primary),
                                  const SizedBox(width: 8),
                                  Text(
                                    storeName,
                                    style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14),
                                  ),
                                ],
                              ),
                              const Divider(height: 20),
                              ...storeItems.map((item) {
                                return Padding(
                                  padding: const EdgeInsets.symmetric(vertical: 8),
                                  child: Row(
                                    crossAxisAlignment: CrossAxisAlignment.center,
                                    children: [
                                      AppNetworkImage(
                                        imageUrlOrCode: item.imageUrl,
                                        width: 60,
                                        height: 60,
                                        borderRadius: BorderRadius.circular(8),
                                        fit: BoxFit.cover,
                                        errorWidget: Container(
                                          width: 60,
                                          height: 60,
                                          decoration: BoxDecoration(
                                            color: scheme.surfaceContainerHighest,
                                            borderRadius: BorderRadius.circular(8),
                                          ),
                                          child: const Icon(Icons.shopping_bag_outlined),
                                        ),
                                      ),
                                      const SizedBox(width: 12),
                                      Expanded(
                                        child: Column(
                                          crossAxisAlignment: CrossAxisAlignment.start,
                                          children: [
                                            Text(
                                              item.title,
                                              maxLines: 2,
                                              overflow: TextOverflow.ellipsis,
                                              style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13),
                                            ),
                                            const SizedBox(height: 4),
                                            Text(
                                              'K${item.price.toStringAsFixed(2)}',
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
                                            onPressed: () => cartNotifier.updateQuantity(item.productId, item.quantity - 1),
                                          ),
                                          Text('${item.quantity}', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
                                          IconButton(
                                            icon: const Icon(Icons.add_circle_outline, size: 20),
                                            onPressed: () => cartNotifier.updateQuantity(item.productId, item.quantity + 1),
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
                    }).toList(),
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
                              'K${subtotal.toStringAsFixed(2)}',
                              style: TextStyle(
                                fontSize: 22,
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
            ),
    );
  }
}
