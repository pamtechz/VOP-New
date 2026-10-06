import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../core/services/supabase_service.dart';
import '../../core/providers/currency_provider.dart';

final orderDetailProvider =
    FutureProvider.family<Map<String, dynamic>?, String>((ref, orderId) async {
  final data = await SupabaseService.client
      .from('orders')
      .select('''
        id, public_ref, status, payment_status, total_amount, shipping_amount, created_at,
        buyer_id, buyer_name, shipping_address,
        seller_orders(
          id, public_ref, status, store_id, subtotal, shipping_fee,
          stores(id, name, logo_url),
          order_items(
            id, product_id, quantity, unit_price,
            product_name_at_purchase
          )
        ),
        delivery_jobs(
          id, public_ref, status, pickup_pin, dropoff_pin, delivery_fee,
          estimated_distance_km, estimated_duration_mins, pickup_address, dropoff_address,
          driver_profiles(id, full_name, phone, vehicle_type, vehicle_plate, rating_avg, current_lat, current_lng)
        )
      ''')
      .or('id.eq.$orderId,public_ref.eq.$orderId')
      .maybeSingle();

  return data;
});

class OrderTrackingScreen extends ConsumerWidget {
  final String orderId;
  const OrderTrackingScreen({super.key, required this.orderId});

<<<<<<< HEAD
=======
  Future<void> _callCourier(BuildContext context, String? phone) async {
    final normalized = phone?.replaceAll(RegExp(r'[^0-9+]'), '') ?? '';
    if (normalized.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Courier phone number is not available.')),
      );
      return;
    }

    final uri = Uri(scheme: 'tel', path: normalized);
    if (!await launchUrl(uri)) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Could not open the phone dialer.')),
        );
      }
    }
  }

>>>>>>> 1babfb190376a67ce2ed11a361066ca33f8142da
  void _showReviewDialog(
    BuildContext context,
    WidgetRef ref, {
    required String orderId,
    required String storeId,
    required String storeName,
    required String productId,
    required String productName,
  }) {
    int selectedRating = 5;
    final commentController = TextEditingController();
    bool submitting = false;

    showDialog(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (context, setDialogState) {
          final scheme = Theme.of(context).colorScheme;
          return AlertDialog(
            title: Row(
              children: [
                const Icon(Icons.rate_review_outlined, color: Color(0xFFD97706)),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    'Review $productName',
                    style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              ],
            ),
            content: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text('Sold by $storeName', style: TextStyle(color: scheme.outline, fontSize: 12)),
                  const SizedBox(height: 16),
                  const Text('How was your purchase?', style: TextStyle(fontWeight: FontWeight.bold)),
                  const SizedBox(height: 8),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: List.generate(5, (index) {
                      final star = index + 1;
                      return IconButton(
                        icon: Icon(
                          star <= selectedRating ? Icons.star : Icons.star_border,
                          color: const Color(0xFFF59E0B),
                          size: 32,
                        ),
                        onPressed: () => setDialogState(() => selectedRating = star),
                      );
                    }),
                  ),
                  const SizedBox(height: 16),
                  TextField(
                    controller: commentController,
                    maxLines: 3,
                    decoration: const InputDecoration(
                      hintText: 'Write your honest review (quality, delivery, seller speed)...',
                      border: OutlineInputBorder(),
                    ),
                  ),
                ],
              ),
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(ctx),
                child: const Text('Cancel'),
              ),
              FilledButton(
                onPressed: submitting
                    ? null
                    : () async {
                        final user = SupabaseService.client.auth.currentUser;
                        if (user == null) return;

                        setDialogState(() => submitting = true);
                        try {
                          await SupabaseService.client.from('reviews').insert({
                            'order_id': orderId,
                            'store_id': storeId,
                            'product_id': productId,
                            'buyer_id': user.id,
                            'rating': selectedRating,
                            'comment': commentController.text.trim(),
                          });

                          if (context.mounted) {
                            Navigator.pop(ctx);
                            ScaffoldMessenger.of(context).showSnackBar(
                              const SnackBar(
                                content: Text('Thank you! Your verified review has been published.'),
                                backgroundColor: Color(0xFF10B981),
                              ),
                            );
                            ref.invalidate(orderDetailProvider(orderId));
                          }
                        } catch (e) {
                          if (context.mounted) {
                            setDialogState(() => submitting = false);
                            ScaffoldMessenger.of(context).showSnackBar(
                              SnackBar(content: Text('Could not post review: $e')),
                            );
                          }
                        }
                      },
                child: submitting
                    ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
                    : const Text('Submit Review'),
              ),
            ],
          );
        },
      ),
    );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final orderAsync = ref.watch(orderDetailProvider(orderId));

    return Scaffold(
      appBar: AppBar(
        title: const Text('Order & Delivery Tracking'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: () => ref.invalidate(orderDetailProvider(orderId)),
          ),
        ],
      ),
      body: orderAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Error loading order: $e')),
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
          final total = double.tryParse(order['total_amount']?.toString() ?? '0') ?? 0.0;
          final dateStr = order['created_at'] != null
              ? DateTime.tryParse(order['created_at'])?.toLocal().toString().substring(0, 16) ?? ''
              : '';
          final address = order['shipping_address'] as Map<String, dynamic>?;
          final addressStr = address != null
              ? '${address['address'] ?? ''}, ${address['area'] ?? ''}, ${address['city'] ?? ''}'
              : 'Standard Delivery';

          final sellerOrders = order['seller_orders'] as List? ?? [];
          final deliveryJobs = order['delivery_jobs'] as List? ?? [];
          final activeJob = deliveryJobs.isNotEmpty ? deliveryJobs.first as Map<String, dynamic> : null;
          final driver = activeJob?['driver_profiles'] as Map<String, dynamic>?;
          final dropoffPin = activeJob?['dropoff_pin'] as String?;

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
                            color: status == 'delivered' ? const Color(0xFF10B981) : scheme.primary,
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: Text(
                            status.toUpperCase(),
                            style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.bold),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 16),

                // Secure Delivery PIN (OTP) Card
                if (dropoffPin != null && status != 'delivered') ...[
                  Card(
                    color: const Color(0xFFFEF3C7),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(14),
                      side: const BorderSide(color: Color(0xFFF59E0B)),
                    ),
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Row(
                        children: [
                          Container(
                            padding: const EdgeInsets.all(10),
                            decoration: BoxDecoration(
                              color: const Color(0xFFD97706).withValues(alpha: 0.2),
                              shape: BoxShape.circle,
                            ),
                            child: const Icon(Icons.phonelink_lock, color: Color(0xFFD97706), size: 24),
                          ),
                          const SizedBox(width: 14),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                const Text(
                                  'Delivery Verification PIN (OTP)',
                                  style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12, color: Color(0xFF92400E)),
                                ),
                                const SizedBox(height: 2),
                                Text(
                                  'Give this 4-digit PIN to your driver upon arrival to confirm delivery:',
                                  style: TextStyle(fontSize: 11, color: Colors.amber.shade900),
                                ),
                              ],
                            ),
                          ),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                            decoration: BoxDecoration(
                              color: Colors.white,
                              borderRadius: BorderRadius.circular(8),
                              border: Border.all(color: const Color(0xFFD97706)),
                            ),
                            child: Text(
                              dropoffPin,
                              style: const TextStyle(
                                fontSize: 20,
                                fontWeight: FontWeight.bold,
                                letterSpacing: 4,
                                color: Color(0xFFD97706),
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),
                ],

                // Yango/inDrive Live Driver Telemetry Card
                if (driver != null) ...[
                  Card(
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              const Row(
                                children: [
                                  Icon(Icons.directions_bike_rounded, color: Color(0xFF2563EB)),
                                  SizedBox(width: 8),
                                  Text('Assigned Driver', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
                                ],
                              ),
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                                decoration: BoxDecoration(
                                  color: const Color(0xFF2563EB).withValues(alpha: 0.1),
                                  borderRadius: BorderRadius.circular(6),
                                ),
                                child: Text(
                                  activeJob?['status']?.toString().replaceAll('_', ' ').toUpperCase() ?? 'IN TRANSIT',
                                  style: const TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: Color(0xFF2563EB)),
                                ),
                              ),
                            ],
                          ),
                          const Divider(height: 20),
                          Row(
                            children: [
                              CircleAvatar(
                                radius: 22,
                                backgroundColor: scheme.primaryContainer,
                                child: Text(
                                  (driver['full_name'] as String? ?? 'D')[0].toUpperCase(),
                                  style: TextStyle(fontWeight: FontWeight.bold, color: scheme.onPrimaryContainer),
                                ),
                              ),
                              const SizedBox(width: 12),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(driver['full_name'] as String? ?? 'Delivery Driver', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
                                    const SizedBox(height: 2),
                                    Text(
                                      '${driver['vehicle_type']?.toString().toUpperCase()} • ${driver['vehicle_plate'] ?? ''}',
                                      style: TextStyle(fontSize: 12, color: scheme.outline),
                                    ),
                                  ],
                                ),
                              ),
                              Row(
                                children: [
                                  const Icon(Icons.star, size: 16, color: Color(0xFFF59E0B)),
                                  const SizedBox(width: 4),
                                  Text(
                                    driver['rating_avg']?.toString() ?? '5.0',
                                    style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13),
                                  ),
                                ],
                              ),
                            ],
                          ),
<<<<<<< HEAD
=======
                          const SizedBox(height: 12),
                          SizedBox(
                            width: double.infinity,
                            child: OutlinedButton.icon(
                              onPressed: () => _callCourier(
                                context,
                                driver['phone']?.toString(),
                              ),
                              icon: const Icon(Icons.call_outlined, size: 18),
                              label: const Text('Call Courier'),
                            ),
                          ),
>>>>>>> 1babfb190376a67ce2ed11a361066ca33f8142da
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),
                ],

                // Delivery Status Timeline
                Card(
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                  child: Padding(
                    padding: const EdgeInsets.all(16.0),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Fulfillment Progress', style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold)),
                        const SizedBox(height: 16),
                        _buildTimelineStep(context, 'Order Placed & Confirmed', 'Payment verified by Pamtechz Marketplace', true, true),
                        _buildTimelineStep(context, 'Store Packing & Preparing', 'Seller is assembling items', status != 'pending', true),
                        _buildTimelineStep(context, 'Goods Picked Up by Driver', 'Courier verified seller pickup PIN', status == 'goods_picked_up' || status == 'in_transit' || status == 'delivered', true),
                        _buildTimelineStep(context, 'Delivered & Handshake Verified', 'Verified via buyer 4-digit OTP', status == 'delivered', false),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 16),

                // Purchased Items & Review Actions
                ...sellerOrders.map((so) {
                  final store = so['stores'] as Map<String, dynamic>?;
                  final storeId = store?['id'] as String? ?? '';
                  final storeName = store?['name'] as String? ?? 'Seller';
                  final items = so['order_items'] as List? ?? [];

                  return Card(
                    margin: const EdgeInsets.only(bottom: 12),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                    child: Padding(
                      padding: const EdgeInsets.all(16),
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
                            ],
                          ),
                          const Divider(height: 16),
                          ...items.map((it) {
                            final title = it['product_name_at_purchase'] as String? ?? 'Item';
                            final productId = it['product_id'] as String? ?? '';
                            final qty = it['quantity'] as int? ?? 1;
                            final uPrice = double.tryParse(it['unit_price']?.toString() ?? '0') ?? 0.0;
                            final curr = ref.watch(currencyProvider).valueOrNull ?? const CurrencyConfig();

                            return Padding(
                              padding: const EdgeInsets.symmetric(vertical: 6),
                              child: Column(
                                children: [
                                  Row(
                                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                    children: [
                                      Expanded(child: Text('$qty× $title', style: const TextStyle(fontSize: 13))),
                                      Text(curr.format(uPrice * qty), style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
                                    ],
                                  ),
                                  if (status == 'delivered') ...[
                                    const SizedBox(height: 6),
                                    Align(
                                      alignment: Alignment.centerRight,
                                      child: OutlinedButton.icon(
                                        icon: const Icon(Icons.star_outline, size: 14),
                                        label: const Text('Write Review', style: TextStyle(fontSize: 11)),
                                        style: OutlinedButton.styleFrom(
                                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                                          visualDensity: VisualDensity.compact,
                                        ),
                                        onPressed: () => _showReviewDialog(
                                          context,
                                          ref,
                                          orderId: order['id'] as String,
                                          storeId: storeId,
                                          storeName: storeName,
                                          productId: productId,
                                          productName: title,
                                        ),
                                      ),
                                    ),
                                  ],
                                ],
                              ),
                            );
                          }),
                        ],
                      ),
                    ),
                  );
                }),
                const SizedBox(height: 12),

                // Delivery & Grand Total
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(16.0),
                    child: Column(
                      children: [
                        Row(
                          children: [
                            const Icon(Icons.location_on_outlined, color: Colors.blue, size: 18),
                            const SizedBox(width: 8),
                            Expanded(child: Text(addressStr, style: const TextStyle(fontSize: 12))),
                          ],
                        ),
                        const Divider(height: 20),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            const Text('Total Paid', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
                            Text(
                              ref.watch(currencyProvider).valueOrNull?.format(total) ?? 'K ${total.toStringAsFixed(2)}',
                              style: TextStyle(fontWeight: FontWeight.bold, fontSize: 18, color: scheme.primary),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 24),
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
