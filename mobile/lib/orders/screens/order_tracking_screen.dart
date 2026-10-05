import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/services/supabase_service.dart';
import '../../core/providers/currency_provider.dart';

final orderDetailProvider =
    FutureProvider.family<Map<String, dynamic>?, String>((ref, orderId) async {
  final data = await SupabaseService.client
      .from('orders')
      .select('''
        id, public_ref, status, payment_status, total_amount, shipping_amount, created_at,
        buyer_name, shipping_address,
        seller_orders(
          id, public_ref, status, subtotal, shipping_fee,
          stores(name),
          order_items(
            id, quantity, unit_price,
            product_name_at_purchase
          )
        )
      ''')
      .or('id.eq.$orderId,public_ref.eq.$orderId')
      .maybeSingle();

  return data;
});

class OrderTrackingScreen extends ConsumerWidget {
  final String orderId;
  const OrderTrackingScreen({super.key, required this.orderId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final orderAsync = ref.watch(orderDetailProvider(orderId));

    return Scaffold(
      appBar: AppBar(
        title: const Text('Order & Delivery Tracking'),
      ),
      body: orderAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Error: $e')),
        data: (order) {
          if (order == null) {
            return Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.search_off, size: 64, color: scheme.outline),
                  const SizedBox(height: 12),
                  const Text('Order not found'),
                ],
              ),
            );
          }

          final refStr = order['public_ref'] as String? ?? (order['id'] as String).substring(0, 8).toUpperCase();
          final status = order['status'] as String? ?? 'processing';
          final paymentStatus = order['payment_status'] as String? ?? 'paid';
          final total = double.tryParse(order['total_amount']?.toString() ?? '0') ?? 0.0;
          final dateStr = order['created_at'] != null
              ? DateTime.tryParse(order['created_at'])?.toLocal().toString().substring(0, 16) ?? ''
              : '';
          final address = order['shipping_address'] as Map<String, dynamic>?;
          final addressStr = address != null
              ? '${address['address'] ?? ''}, ${address['area'] ?? ''}, ${address['city'] ?? ''}'
              : 'Standard Delivery';

          final sellerOrders = order['seller_orders'] as List? ?? [];

          return SingleChildScrollView(
            padding: const EdgeInsets.all(16.0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Order Reference Banner
                Card(
                  color: scheme.primaryContainer,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                  child: Padding(
                    padding: const EdgeInsets.all(16.0),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('ORDER REFERENCE', style: TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: scheme.onPrimaryContainer.withValues(alpha: 0.7))),
                            const SizedBox(height: 2),
                            Text(refStr, style: TextStyle(fontWeight: FontWeight.bold, fontSize: 18, color: scheme.onPrimaryContainer)),
                            Text(dateStr, style: TextStyle(fontSize: 12, color: scheme.onPrimaryContainer.withValues(alpha: 0.8))),
                          ],
                        ),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                          decoration: BoxDecoration(
                            color: scheme.primary,
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: Text(
                            status.toUpperCase(),
                            style: TextStyle(color: scheme.onPrimary, fontSize: 11, fontWeight: FontWeight.bold),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 24),

                // Tracking Timeline
                Text('Delivery Progress', style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold)),
                const SizedBox(height: 12),
                Card(
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                  child: Padding(
                    padding: const EdgeInsets.all(16.0),
                    child: Column(
                      children: [
                        _buildTimelineStep(context, 'Order Placed', 'Payment confirmed ($paymentStatus)', true, true),
                        _buildTimelineStep(context, 'Store Processing', 'Merchant packing items', status != 'pending', true),
                        _buildTimelineStep(context, 'Out for Delivery', 'Dispatched with local courier', status == 'shipped' || status == 'delivered', true),
                        _buildTimelineStep(context, 'Delivered & Completed', 'Delivered to recipient address', status == 'completed' || status == 'delivered', false),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 24),

                // Multi-Seller Sub-Orders Breakdown
                Text('Package Breakdown (${sellerOrders.length} Seller${sellerOrders.length != 1 ? 's' : ''})', style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold)),
                const SizedBox(height: 12),
                ...sellerOrders.map((so) {
                  final storeName = (so['stores'] as Map?)?['name'] as String? ?? 'Merchant';
                  final items = so['order_items'] as List? ?? [];
                  final subtotal = double.tryParse(so['subtotal']?.toString() ?? '0') ?? 0.0;
                  final soStatus = so['status'] as String? ?? 'processing';

                  return Card(
                    margin: const EdgeInsets.only(bottom: 12),
                    child: Padding(
                      padding: const EdgeInsets.all(14.0),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Row(
                                children: [
                                  Icon(Icons.storefront, size: 18, color: scheme.primary),
                                  const SizedBox(width: 8),
                                  Text(storeName, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
                                ],
                              ),
                              Text(
                                soStatus.toUpperCase(),
                                style: const TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: Color(0xFF10B981)),
                              ),
                            ],
                          ),
                          const Divider(height: 16),
                          ...items.map((it) {
                            final title = it['product_name_at_purchase'] as String? ?? 'Item';
                            final qty = it['quantity'] as int? ?? 1;
                            final uPrice = double.tryParse(it['unit_price']?.toString() ?? '0') ?? 0.0;
                            final curr = ref.watch(currencyProvider).valueOrNull ?? const CurrencyConfig();
                            return Padding(
                              padding: const EdgeInsets.symmetric(vertical: 4),
                              child: Row(
                                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                children: [
                                  Expanded(child: Text('$qty× $title', style: const TextStyle(fontSize: 13))),
                                  Text(curr.format(uPrice * qty), style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
                                ],
                              ),
                            );
                          }),
                          const SizedBox(height: 6),
                          Align(
                            alignment: Alignment.centerRight,
                            child: Text('Store Subtotal: ${ref.watch(currencyProvider).valueOrNull?.format(subtotal) ?? 'K ${subtotal.toStringAsFixed(2)}'}', style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: scheme.primary)),
                          ),
                        ],
                      ),
                    ),
                  );
                }),
                const SizedBox(height: 16),

                // Delivery Info
                Card(
                  child: ListTile(
                    leading: const Icon(Icons.location_on_outlined, color: Colors.blue),
                    title: const Text('Delivery Address', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
                    subtitle: Text(addressStr, style: const TextStyle(fontSize: 12)),
                  ),
                ),
                const SizedBox(height: 12),

                // Grand Total
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(16.0),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const Text('Total Amount Paid', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
                        Text(ref.watch(currencyProvider).valueOrNull?.format(total) ?? 'K ${total.toStringAsFixed(2)}', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16, color: scheme.primary)),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 20),
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _buildTimelineStep(BuildContext context, String title, String subtitle, bool isDone, bool showLine) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Column(
          children: [
            CircleAvatar(
              radius: 10,
              backgroundColor: isDone ? const Color(0xFF10B981) : Colors.grey.shade400,
              child: Icon(Icons.check, size: 12, color: isDone ? Colors.white : Colors.transparent),
            ),
            if (showLine)
              Container(
                width: 2,
                height: 32,
                color: isDone ? const Color(0xFF10B981) : Colors.grey.shade300,
              ),
          ],
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title, style: TextStyle(fontWeight: isDone ? FontWeight.bold : FontWeight.normal, fontSize: 13)),
              Text(subtitle, style: const TextStyle(fontSize: 11, color: Colors.grey)),
              const SizedBox(height: 14),
            ],
          ),
        ),
      ],
    );
  }
}
