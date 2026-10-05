import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../../core/services/supabase_service.dart';

// ── Provider ─────────────────────────────────────────────────────────────────
final myOrdersProvider = FutureProvider<List<Map<String, dynamic>>>((ref) async {
  final user = Supabase.instance.client.auth.currentUser;

  var query = SupabaseService.client
      .from('orders')
      .select('''
        id, public_ref, status, payment_status, total_amount, created_at,
        seller_orders(
          id,
          order_items(
            id, quantity, unit_price,
            product_name_at_purchase, variant_name_at_purchase
          )
        )
      ''');

  if (user != null) {
    query = query.eq('buyer_id', user.id);
  }

  final data = await query.order('created_at', ascending: false).limit(30);
  return List<Map<String, dynamic>>.from(data as List);
});

// ── Screen ───────────────────────────────────────────────────────────────────
class OrdersScreen extends ConsumerWidget {
  const OrdersScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final ordersAsync = ref.watch(myOrdersProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('My Orders'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: () => ref.invalidate(myOrdersProvider),
          ),
        ],
      ),
      body: ordersAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.error_outline, size: 48, color: scheme.error),
                const SizedBox(height: 12),
                Text('Failed to load orders',
                    style: theme.textTheme.titleMedium),
                const SizedBox(height: 8),
                FilledButton(
                    onPressed: () => ref.invalidate(myOrdersProvider),
                    child: const Text('Retry')),
              ],
            ),
          ),
        ),
        data: (orders) {
          if (orders.isEmpty) {
            return Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(Icons.receipt_long_outlined,
                      size: 64, color: scheme.outline),
                  const SizedBox(height: 16),
                  Text('No orders yet',
                      style: theme.textTheme.titleMedium
                          ?.copyWith(color: scheme.outline)),
                  const SizedBox(height: 8),
                  Text('Your orders will appear here',
                      style: TextStyle(color: scheme.outline, fontSize: 13)),
                ],
              ),
            );
          }

          return ListView.builder(
            padding: const EdgeInsets.all(16),
            itemCount: orders.length,
            itemBuilder: (ctx, i) {
              final order = orders[i];
              final ref = order['public_ref'] as String? ??
                  (order['id'] as String).substring(0, 8).toUpperCase();
              final status = order['payment_status'] as String? ?? 'pending';
              final total = (order['total_amount'] as num?)?.toDouble() ?? 0.0;
              final createdAt = DateTime.tryParse(
                  order['created_at'] as String? ?? '');

              return Card(
                margin: const EdgeInsets.only(bottom: 12),
                shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(14)),
                clipBehavior: Clip.antiAlias,
                child: InkWell(
                  onTap: () => context.push('/orders/${order['id']}'),
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Text(ref,
                                style: TextStyle(
                                    fontWeight: FontWeight.bold,
                                    color: scheme.primary,
                                    fontFamily: 'monospace')),
                            _StatusBadge(status: status),
                          ],
                        ),
                        if (createdAt != null) ...[
                          const SizedBox(height: 4),
                          Text(
                            '${createdAt.day}/${createdAt.month}/${createdAt.year}',
                            style: TextStyle(
                                color: scheme.outline, fontSize: 12),
                          ),
                        ],
                        const Divider(height: 20),

                        // Items via seller_orders → order_items
                        ...() {
                          final sellerOrders = order['seller_orders'] as List? ?? [];
                          final allItems = <Map<String, dynamic>>[];
                          for (final so in sellerOrders) {
                            final soItems = (so as Map)['order_items'] as List? ?? [];
                            allItems.addAll(soItems.cast<Map<String, dynamic>>());
                          }
                          return allItems.map((item) {
                            final qty = item['quantity'] as int? ?? 1;
                            final unitPrice = (item['unit_price'] as num?)?.toDouble() ?? 0.0;
                            final name = item['product_name_at_purchase'] as String? ?? 'Product';
                            return Padding(
                              padding: const EdgeInsets.only(bottom: 6),
                              child: Row(
                                children: [
                                  Expanded(
                                    child: Text(
                                      name,
                                      style: const TextStyle(fontSize: 13),
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                    ),
                                  ),
                                  const SizedBox(width: 8),
                                  Text(
                                    '${qty}x K ${unitPrice.toStringAsFixed(2)}',
                                    style: TextStyle(fontSize: 13, color: scheme.outline),
                                  ),
                                ],
                              ),
                            );
                          }).toList();
                        }(),

                        const Divider(height: 16),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Row(
                              children: [
                                Icon(Icons.local_shipping_outlined, size: 16, color: scheme.primary),
                                const SizedBox(width: 6),
                                Text(
                                  'Track Delivery',
                                  style: TextStyle(
                                    fontSize: 12,
                                    fontWeight: FontWeight.w600,
                                    color: scheme.primary,
                                  ),
                                ),
                              ],
                            ),
                            Text(
                              'K ${total.toStringAsFixed(2)}',
                              style: TextStyle(
                                  fontWeight: FontWeight.bold,
                                  fontSize: 16,
                                  color: scheme.primary),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ),
              );
            },
          );
        },
      ),
    );
  }
}

class _StatusBadge extends StatelessWidget {
  final String status;
  const _StatusBadge({required this.status});

  @override
  Widget build(BuildContext context) {
    Color bg, fg;
    String label;
    switch (status) {
      case 'paid':
        bg = Colors.green.withOpacity(0.1);
        fg = Colors.green;
        label = 'PAID';
        break;
      case 'pending':
        bg = Colors.amber.withOpacity(0.1);
        fg = Colors.amber.shade700;
        label = 'PENDING';
        break;
      case 'failed':
        bg = Colors.red.withOpacity(0.1);
        fg = Colors.red;
        label = 'FAILED';
        break;
      default:
        bg = Colors.grey.withOpacity(0.1);
        fg = Colors.grey;
        label = status.toUpperCase();
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
          color: bg,
          borderRadius: BorderRadius.circular(6),
          border: Border.all(color: fg.withOpacity(0.3))),
      child:
          Text(label, style: TextStyle(fontSize: 11, color: fg, fontWeight: FontWeight.bold)),
    );
  }
}
