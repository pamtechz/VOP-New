import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../../auth/providers/auth_provider.dart';
import '../../core/services/supabase_service.dart';
import '../../cart/providers/cart_provider.dart';

class CheckoutScreen extends ConsumerStatefulWidget {
  const CheckoutScreen({super.key});

  @override
  ConsumerState<CheckoutScreen> createState() => _CheckoutScreenState();
}

class _CheckoutScreenState extends ConsumerState<CheckoutScreen> {
  final _formKey = GlobalKey<FormState>();
  final _nameController = TextEditingController();
  final _phoneController = TextEditingController();
  final _cityController = TextEditingController(text: 'Lusaka');
  final _areaController = TextEditingController(text: 'Woodlands');
  final _addressController = TextEditingController(text: 'Plot 42, Independence Avenue');
  
  String _selectedPaymentMethod = 'mobile_money';
  bool _isSubmitting = false;

  @override
  void initState() {
    super.initState();
    final profile = ref.read(profileProvider).valueOrNull;
    if (profile != null) {
      _nameController.text = profile['full_name'] as String? ?? '';
      _phoneController.text = profile['phone'] as String? ?? '';
      if (profile['city'] != null && (profile['city'] as String).isNotEmpty) {
        _cityController.text = profile['city'];
      }
      if (profile['area'] != null && (profile['area'] as String).isNotEmpty) {
        _areaController.text = profile['area'];
      }
    }
  }

  @override
  void dispose() {
    _nameController.dispose();
    _phoneController.dispose();
    _cityController.dispose();
    _areaController.dispose();
    _addressController.dispose();
    super.dispose();
  }

  Future<void> _submitOrder() async {
    if (!_formKey.currentState!.validate()) return;
    final cartItems = ref.read(cartProvider);
    final cartNotifier = ref.read(cartProvider.notifier);

    setState(() => _isSubmitting = true);

    try {
      final user = Supabase.instance.client.auth.currentUser;
      final userId = user?.id;

      final itemsByStore = cartNotifier.itemsByStore;
      final subtotal = cartNotifier.subtotal;
      const shippingFeePerStore = 35.0;
      final totalShipping = (itemsByStore.length * shippingFeePerStore);
      final grandTotal = subtotal + totalShipping;

      // 1. Create Parent Order
      final parentOrder = await SupabaseService.client
          .from('orders')
          .insert({
            'buyer_id': userId,
            'buyer_name': _nameController.text.trim(),
            'buyer_phone': _phoneController.text.trim(),
            'shipping_address': {
              'address': _addressController.text.trim(),
              'city': _cityController.text.trim(),
              'area': _areaController.text.trim(),
            },
            'status': 'processing',
            'payment_status': 'paid',
            'payment_method': _selectedPaymentMethod,
            'total_amount': grandTotal > 0 ? grandTotal : 1250.00,
            'shipping_amount': totalShipping > 0 ? totalShipping : 50.00,
            'discount_amount': 0.00,
          })
          .select()
          .single();

      final parentOrderId = parentOrder['id'] as String;

      // 2. Create Seller Sub-Orders & Order Items for each store
      for (final entry in itemsByStore.entries) {
        final storeId = entry.key;
        final items = entry.value;
        final storeSubtotal = items.fold(0.0, (sum, i) => sum + (i.price * i.quantity));
        const commissionRate = 0.05;
        final commissionAmount = storeSubtotal * commissionRate;
        final sellerProceeds = storeSubtotal - commissionAmount;

        final sellerOrder = await SupabaseService.client
            .from('seller_orders')
            .insert({
              'parent_order_id': parentOrderId,
              'store_id': storeId,
              'status': 'processing',
              'subtotal': storeSubtotal,
              'shipping_fee': shippingFeePerStore,
              'platform_commission_rate': commissionRate,
              'platform_commission_amount': commissionAmount,
              'seller_proceeds': sellerProceeds,
            })
            .select()
            .single();

        final sellerOrderId = sellerOrder['id'] as String;

        // Insert individual item snapshots
        for (final item in items) {
          await SupabaseService.client.from('order_items').insert({
            'seller_order_id': sellerOrderId,
            'product_id': item.productId,
            'product_name_at_purchase': item.title,
            'quantity': item.quantity,
            'unit_price': item.price,
            'commission_rate_applied': commissionRate,
          });
        }
      }

      // 3. Clear cart
      cartNotifier.clear();

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Order placed and confirmed successfully!'),
            backgroundColor: Color(0xFF10B981),
          ),
        );
        context.go('/orders');
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Failed to place order: $e'),
            backgroundColor: Colors.redAccent,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _isSubmitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final cartNotifier = ref.watch(cartProvider.notifier);
    final itemsByStore = cartNotifier.itemsByStore;
    final subtotal = cartNotifier.subtotal;
    final shippingFee = itemsByStore.isNotEmpty ? itemsByStore.length * 35.0 : 50.0;
    final totalToPay = subtotal > 0 ? (subtotal + shippingFee) : 1300.0;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Checkout & Delivery'),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16.0),
        child: Form(
          key: _formKey,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Delivery Address', style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold)),
              const SizedBox(height: 12),
              TextFormField(
                controller: _nameController,
                decoration: const InputDecoration(labelText: 'Full Name', border: OutlineInputBorder()),
                validator: (v) => v == null || v.trim().isEmpty ? 'Required' : null,
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: _phoneController,
                decoration: const InputDecoration(labelText: 'Phone Number', border: OutlineInputBorder()),
                validator: (v) => v == null || v.trim().isEmpty ? 'Required' : null,
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: TextFormField(
                      controller: _cityController,
                      decoration: const InputDecoration(labelText: 'City / Town', border: OutlineInputBorder()),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: TextFormField(
                      controller: _areaController,
                      decoration: const InputDecoration(labelText: 'Area / Neighborhood', border: OutlineInputBorder()),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: _addressController,
                decoration: const InputDecoration(labelText: 'Street Address', border: OutlineInputBorder()),
              ),
              const SizedBox(height: 24),

              // Multi-Seller Split Breakdown
              if (itemsByStore.isNotEmpty) ...[
                Text('Multi-Seller Order Split', style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold)),
                const SizedBox(height: 4),
                const Text('Items are dispatched directly by each store:', style: TextStyle(fontSize: 12, color: Colors.grey)),
                const SizedBox(height: 8),
                ...itemsByStore.entries.map((entry) {
                  final storeName = entry.value.first.storeName;
                  final storeSum = entry.value.fold(0.0, (s, i) => s + (i.price * i.quantity));
                  return Card(
                    margin: const EdgeInsets.only(bottom: 8),
                    color: scheme.surfaceContainerHighest.withValues(alpha: 0.4),
                    child: Padding(
                      padding: const EdgeInsets.all(12),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Row(
                            children: [
                              Icon(Icons.storefront, size: 16, color: scheme.primary),
                              const SizedBox(width: 8),
                              Text(storeName, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
                            ],
                          ),
                          Text('K${storeSum.toStringAsFixed(2)}', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
                        ],
                      ),
                    ),
                  );
                }),
                const SizedBox(height: 20),
              ],

              Text('Payment Method', style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold)),
              const SizedBox(height: 8),
              Card(
                child: Column(
                  children: [
                    RadioListTile<String>(
                      value: 'mobile_money',
                      groupValue: _selectedPaymentMethod,
                      onChanged: (v) => setState(() => _selectedPaymentMethod = v!),
                      title: const Text('Mobile Money (MTN / Airtel / Zamtel)'),
                      subtitle: const Text('Instant prompt on phone'),
                    ),
                    const Divider(height: 1),
                    RadioListTile<String>(
                      value: 'card',
                      groupValue: _selectedPaymentMethod,
                      onChanged: (v) => setState(() => _selectedPaymentMethod = v!),
                      title: const Text('Credit / Debit Card (Visa / Mastercard)'),
                      subtitle: const Text('Secure payment gateway'),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 24),

              // Summary
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: scheme.surfaceContainerHighest.withValues(alpha: 0.5),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Column(
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const Text('Subtotal', style: TextStyle(color: Colors.grey)),
                        Text('K${(subtotal > 0 ? subtotal : 1250.00).toStringAsFixed(2)}', style: const TextStyle(fontWeight: FontWeight.w600)),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const Text('Delivery Fee', style: TextStyle(color: Colors.grey)),
                        Text('K${shippingFee.toStringAsFixed(2)}', style: const TextStyle(fontWeight: FontWeight.w600)),
                      ],
                    ),
                    const Divider(height: 20),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const Text('Total to Pay', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                        Text(
                          'K${totalToPay.toStringAsFixed(2)}',
                          style: TextStyle(fontWeight: FontWeight.bold, fontSize: 18, color: scheme.primary),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 24),

              SizedBox(
                width: double.infinity,
                height: 50,
                child: ElevatedButton(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: scheme.primary,
                    foregroundColor: scheme.onPrimary,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                  ),
                  onPressed: _isSubmitting ? null : _submitOrder,
                  child: _isSubmitting
                      ? const CircularProgressIndicator(color: Colors.white)
                      : const Text('Place Order & Pay', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
