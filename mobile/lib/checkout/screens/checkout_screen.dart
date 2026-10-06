import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../../auth/providers/auth_provider.dart';
import '../../core/services/supabase_service.dart';
import '../../cart/providers/cart_provider.dart';
import '../../core/providers/currency_provider.dart';

class CheckoutScreen extends ConsumerStatefulWidget {
  const CheckoutScreen({super.key});

  @override
  ConsumerState<CheckoutScreen> createState() => _CheckoutScreenState();
}

class _CheckoutScreenState extends ConsumerState<CheckoutScreen> {
  final _formKey = GlobalKey<FormState>();
  final _nameController = TextEditingController();
  final _phoneController = TextEditingController();
  final _cityController = TextEditingController();
  final _areaController = TextEditingController();
  final _addressController = TextEditingController();
  
  String _selectedPaymentMethod = 'mobile_money';
  String _deliveryMethod = 'delivery'; // 'delivery' or 'pickup'
  bool _isSubmitting = false;
  bool _isLoadingSavedAddress = true;
  Map<String, double> _storeDeliveryFees = {};
  bool _allStoresAllowPickup = true;
  final _couponController = TextEditingController();
  Map<String, dynamic>? _appliedCoupon;
  bool _isApplyingCoupon = false;
  String? _couponError;

  @override
  void initState() {
    super.initState();
    _loadInitialData();
  }

  Future<void> _loadInitialData() async {
    final user = Supabase.instance.client.auth.currentUser;
    if (user != null) {
      try {
        // 1. Try loading primary saved address from addresses table
        final addr = await SupabaseService.client
            .from('addresses')
            .select()
            .eq('user_id', user.id)
            .eq('is_default', true)
            .maybeSingle();

        if (addr != null && mounted) {
          _addressController.text = addr['street'] as String? ?? '';
          _cityController.text = addr['city'] as String? ?? '';
          _areaController.text = addr['area'] as String? ?? '';
          if (addr['phone'] != null && (addr['phone'] as String).isNotEmpty) {
            _phoneController.text = addr['phone'] as String;
          }
        }

        // 2. Load user profile name & phone if still empty
        final profile = ref.read(profileProvider).valueOrNull;
        if (profile != null && mounted) {
          if (_nameController.text.isEmpty) {
            _nameController.text = profile['full_name'] as String? ?? '';
          }
          if (_phoneController.text.isEmpty) {
            _phoneController.text = profile['phone'] as String? ?? '';
          }
        }
      } catch (_) {
        // Non-critical address prefill error
      }
    }

    // 3. Load dynamic store delivery fees from database for stores in cart
    await _loadStoreDeliveryRules();

    if (mounted) {
      setState(() => _isLoadingSavedAddress = false);
    }
  }

  Future<void> _loadStoreDeliveryRules() async {
    final cart = ref.read(cartProvider);
    final storeIds = cart.map((i) => i.storeId).toSet().toList();
    if (storeIds.isEmpty) return;

    try {
      final stores = await SupabaseService.client
          .from('stores')
          .select('id, delivery_fee, allows_pickup')
          .inFilter('id', storeIds);

      final Map<String, double> fees = {};
      bool allowPickup = true;

      for (final s in stores as List) {
        final sid = s['id'] as String;
        final fee = double.tryParse(s['delivery_fee']?.toString() ?? '25.0') ?? 25.0;
        final canPickup = s['allows_pickup'] as bool? ?? true;
        fees[sid] = fee;
        if (!canPickup) allowPickup = false;
      }

      if (mounted) {
        setState(() {
          _storeDeliveryFees = fees;
          _allStoresAllowPickup = allowPickup;
          if (!allowPickup && _deliveryMethod == 'pickup') {
            _deliveryMethod = 'delivery';
          }
        });
      }
    } catch (_) {}
  }

  @override
  void dispose() {
    _nameController.dispose();
    _phoneController.dispose();
    _cityController.dispose();
    _areaController.dispose();
    _addressController.dispose();
    _couponController.dispose();
    super.dispose();
  }

  Future<void> _applyCoupon() async {
    final code = _couponController.text.trim().toUpperCase();
    if (code.isEmpty) return;

    setState(() {
      _isApplyingCoupon = true;
      _couponError = null;
    });

    try {
      final res = await SupabaseService.client
          .from('promotions')
          .select('id, code, discount_type, discount_value, min_order_amount, max_discount_amount, is_active')
          .eq('code', code)
          .eq('is_active', true)
          .maybeSingle();

      if (res == null) {
        if (mounted) setState(() => _couponError = 'Invalid or expired promo code.');
        return;
      }

      final minAmount = (res['min_order_amount'] as num?)?.toDouble() ?? 0.0;
      final cartSubtotal = ref.read(cartProvider.notifier).subtotal;
      if (cartSubtotal < minAmount) {
        if (mounted) {
          setState(() => _couponError = 'Order subtotal must be at least K${minAmount.toStringAsFixed(2)} to use this coupon.');
        }
        return;
      }

      if (mounted) {
        setState(() {
          _appliedCoupon = res;
          _couponError = null;
        });
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Coupon $code applied successfully!'),
            backgroundColor: const Color(0xFF10B981),
          ),
        );
      }
    } catch (_) {
      if (mounted) setState(() => _couponError = 'Failed to validate promo code.');
    } finally {
      if (mounted) setState(() => _isApplyingCoupon = false);
    }
  }

  Future<void> _submitOrder() async {
    if (!_formKey.currentState!.validate()) return;
    final cartNotifier = ref.read(cartProvider.notifier);
    final cartItems = ref.read(cartProvider);

    if (cartItems.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Your cart is empty. Add products before checkout.')),
      );
      return;
    }

    setState(() => _isSubmitting = true);

    try {
      final user = Supabase.instance.client.auth.currentUser;
      if (user == null) {
        throw Exception('You must be signed in to checkout');
      }

      // Build authoritative cart items payload for server checkout RPC
      final itemsPayload = cartItems.map((item) => {
        'product_id': item.productId,
        'variant_id': null,
        'quantity': item.quantity,
      }).toList();

      final shippingAddress = {
        'full_name': _nameController.text.trim(),
        'phone': _phoneController.text.trim(),
        'city': _deliveryMethod == 'pickup' ? 'Store Pickup' : _cityController.text.trim(),
        'area': _deliveryMethod == 'pickup' ? 'Store Pickup' : _areaController.text.trim(),
        'address': _deliveryMethod == 'pickup' ? 'Customer Pickup' : _addressController.text.trim(),
      };

      // Call authoritative atomic server checkout RPC with inventory reservation
      final response = await SupabaseService.client.rpc(
        'create_server_checkout_with_promotion',
        params: {
          'p_items': itemsPayload,
          'p_shipping_address': shippingAddress,
          'p_delivery_method': _deliveryMethod,
          'p_payment_method': _selectedPaymentMethod,
          'p_promotion_code': _appliedCoupon?['code'],
        },
      );

      final orderData = response as Map<String, dynamic>;
      final publicRef = orderData['public_ref'] as String? ?? 'ORD';
      final serverDiscount =
          (orderData['discount_amount'] as num?)?.toDouble() ?? 0.0;
      final serverTotal =
          (orderData['total_amount'] as num?)?.toDouble();

      // Clear local cart now that the server has recorded the order & inventory reservations
      cartNotifier.clear();

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              serverDiscount > 0 && serverTotal != null
                  ? 'Order $publicRef created. Promo saved ${currency.format(serverDiscount)} — total ${currency.format(serverTotal)}.'
                  : 'Order $publicRef created! Reserved for 30 minutes.',
            ),
            backgroundColor: const Color(0xFF10B981),
            duration: const Duration(seconds: 4),
          ),
        );
        context.go('/orders');
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Checkout failed: ${e.toString().replaceAll("Exception: ", "")}'),
            backgroundColor: Colors.redAccent,
            duration: const Duration(seconds: 5),
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
    final currency = ref.watch(currencyProvider).valueOrNull ?? const CurrencyConfig();
    final cartItems = ref.watch(cartProvider);
    final cartNotifier = ref.watch(cartProvider.notifier);
    final itemsByStore = cartNotifier.itemsByStore;
    final subtotal = cartNotifier.subtotal;

    if (cartItems.isEmpty) {
      return Scaffold(
        appBar: AppBar(title: const Text('Checkout')),
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(24.0),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(Icons.shopping_cart_outlined, size: 72, color: scheme.outline),
                const SizedBox(height: 16),
                Text('Your cart is empty', style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold)),
                const SizedBox(height: 8),
                const Text('Discover products in the marketplace to proceed with checkout.', textAlign: TextAlign.center, style: TextStyle(color: Colors.grey)),
                const SizedBox(height: 24),
                FilledButton.icon(
                  onPressed: () => context.go('/'),
                  icon: const Icon(Icons.storefront),
                  label: const Text('Explore Marketplace'),
                ),
              ],
            ),
          ),
        ),
      );
    }

    // Authoritative dynamic shipping calculation from loaded store rules
    double calculatedShipping = 0.0;
    if (_deliveryMethod == 'delivery') {
      for (final storeId in itemsByStore.keys) {
        calculatedShipping += (_storeDeliveryFees[storeId] ?? 25.0);
      }
    }

    double discountAmount = 0.0;
    if (_appliedCoupon != null) {
      final type = _appliedCoupon!['discount_type'] as String?;
      final val = (_appliedCoupon!['discount_value'] as num?)?.toDouble() ?? 0.0;
      if (type == 'percentage') {
        discountAmount = subtotal * (val / 100.0);
      } else {
        discountAmount = val;
      }
      final maxDiscount =
          (_appliedCoupon!['max_discount_amount'] as num?)?.toDouble();
      if (maxDiscount != null && discountAmount > maxDiscount) {
        discountAmount = maxDiscount;
      }
      if (discountAmount > subtotal) discountAmount = subtotal;
    }

    final totalToPay = (subtotal - discountAmount + calculatedShipping).clamp(0.0, double.infinity);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Checkout & Delivery'),
      ),
      body: _isLoadingSavedAddress
          ? const Center(child: CircularProgressIndicator())
          : SingleChildScrollView(
              padding: const EdgeInsets.all(16.0),
              child: Form(
                key: _formKey,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Delivery vs Pickup Selection
                    Text('Fulfillment Option', style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold)),
                    const SizedBox(height: 8),
                    Card(
                      child: Column(
                        children: [
                          RadioListTile<String>(
                            value: 'delivery',
                            groupValue: _deliveryMethod,
                            onChanged: (v) => setState(() => _deliveryMethod = v!),
                            title: const Text('Home / Office Delivery'),
                            subtitle: const Text('Dispatched directly by each store'),
                            secondary: const Icon(Icons.local_shipping_outlined),
                          ),
                          if (_allStoresAllowPickup) ...[
                            const Divider(height: 1),
                            RadioListTile<String>(
                            value: 'pickup',
                            groupValue: _deliveryMethod,
                            onChanged: (v) => setState(() => _deliveryMethod = v!),
                            title: const Text('Store Pickup (Free)'),
                            subtitle: const Text('Collect directly from merchant premises'),
                            secondary: const Icon(Icons.storefront_outlined),
                          ),
                          ],
                        ],
                      ),
                    ),
                    const SizedBox(height: 20),

                    // Delivery Address or Contact Details
                    Text(
                      _deliveryMethod == 'delivery' ? 'Delivery Address' : 'Recipient Contact Details',
                      style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold),
                    ),
                    const SizedBox(height: 12),
                    TextFormField(
                      controller: _nameController,
                      decoration: const InputDecoration(
                        labelText: 'Full Name',
                        hintText: 'e.g. Chanda Mwape',
                        border: OutlineInputBorder(),
                      ),
                      validator: (v) => v == null || v.trim().isEmpty ? 'Full name is required' : null,
                    ),
                    const SizedBox(height: 12),
                    TextFormField(
                      controller: _phoneController,
                      keyboardType: TextInputType.phone,
                      decoration: const InputDecoration(
                        labelText: 'Phone Number',
                        hintText: 'e.g. +260 971 234567',
                        border: OutlineInputBorder(),
                      ),
                      validator: (v) => v == null || v.trim().isEmpty ? 'Phone number is required' : null,
                    ),
                    if (_deliveryMethod == 'delivery') ...[
                      const SizedBox(height: 12),
                      Row(
                        children: [
                          Expanded(
                            child: TextFormField(
                              controller: _cityController,
                              decoration: const InputDecoration(
                                labelText: 'City / Town',
                                hintText: 'e.g. Lusaka',
                                border: OutlineInputBorder(),
                              ),
                              validator: (v) => v == null || v.trim().isEmpty ? 'City is required' : null,
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: TextFormField(
                              controller: _areaController,
                              decoration: const InputDecoration(
                                labelText: 'Area / Neighborhood',
                                hintText: 'e.g. Woodlands',
                                border: OutlineInputBorder(),
                              ),
                              validator: (v) => v == null || v.trim().isEmpty ? 'Area is required' : null,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 12),
                      TextFormField(
                        controller: _addressController,
                        decoration: const InputDecoration(
                          labelText: 'Street Address',
                          hintText: 'e.g. Plot 42, Independence Avenue',
                          border: OutlineInputBorder(),
                        ),
                        validator: (v) => v == null || v.trim().isEmpty ? 'Street address is required' : null,
                      ),
                    ],
                    const SizedBox(height: 24),

                    // Multi-Seller Split Breakdown
                    Text('Multi-Seller Order Split', style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold)),
                    const SizedBox(height: 4),
                    const Text('Items are dispatched directly by each store:', style: TextStyle(fontSize: 12, color: Colors.grey)),
                    const SizedBox(height: 8),
                    ...itemsByStore.entries.map((entry) {
                      final storeName = entry.value.first.storeName;
                      final storeSum = entry.value.fold(0.0, (s, i) => s + (i.price * i.quantity));
                      final storeShipping = _deliveryMethod == 'pickup' ? 0.0 : (_storeDeliveryFees[entry.key] ?? 25.0);

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
                                  Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text(storeName, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
                                      Text(
                                        _deliveryMethod == 'pickup'
                                            ? 'Pickup: Free'
                                            : 'Delivery: ${currency.format(storeShipping)}',
                                        style: const TextStyle(fontSize: 11, color: Colors.grey),
                                      ),
                                    ],
                                  ),
                                ],
                              ),
                              Text(currency.format(storeSum), style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
                            ],
                          ),
                        ),
                      );
                    }),
                    const SizedBox(height: 20),

                    // Payment Method Selection
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
                            subtitle: const Text('Instant prompt on registered phone'),
                            secondary: const Icon(Icons.phone_android),
                          ),
                          const Divider(height: 1),
                          RadioListTile<String>(
                            value: 'card',
                            groupValue: _selectedPaymentMethod,
                            onChanged: (v) => setState(() => _selectedPaymentMethod = v!),
                            title: const Text('Credit / Debit Card (Visa / Mastercard)'),
                            subtitle: const Text('Authoritative 3D-Secure transaction'),
                            secondary: const Icon(Icons.credit_card),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 24),

                    // Promo Code Redemption
                    Text('Promo Code & Discount', style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold)),
                    const SizedBox(height: 8),
                    Card(
                      child: Padding(
                        padding: const EdgeInsets.all(12),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                Expanded(
                                  child: TextField(
                                    controller: _couponController,
                                    textCapitalization: TextCapitalization.characters,
                                    decoration: InputDecoration(
                                      hintText: 'Enter code (e.g. PAMTECHZ10)',
                                      isDense: true,
                                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                                      contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                                    ),
                                  ),
                                ),
                                const SizedBox(width: 8),
                                ElevatedButton(
                                  onPressed: _isApplyingCoupon ? null : _applyCoupon,
                                  style: ElevatedButton.styleFrom(
                                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                                  ),
                                  child: _isApplyingCoupon
                                      ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
                                      : const Text('Apply'),
                                ),
                              ],
                            ),
                            if (_couponError != null) ...[
                              const SizedBox(height: 6),
                              Text(_couponError!, style: const TextStyle(color: Colors.redAccent, fontSize: 12)),
                            ],
                            if (_appliedCoupon != null) ...[
                              const SizedBox(height: 8),
                              Row(
                                children: [
                                  const Icon(Icons.check_circle, size: 16, color: Colors.green),
                                  const SizedBox(width: 6),
                                  Text(
                                    'Code ${_appliedCoupon!['code']} Applied!',
                                    style: const TextStyle(fontWeight: FontWeight.bold, color: Colors.green, fontSize: 13),
                                  ),
                                ],
                              ),
                            ],
                          ],
                        ),
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
                              Text(currency.format(subtotal), style: const TextStyle(fontWeight: FontWeight.w600)),
                            ],
                          ),
                          if (discountAmount > 0) ...[
                            const SizedBox(height: 8),
                            Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                const Text('Promo Discount', style: TextStyle(color: Colors.green, fontWeight: FontWeight.w600)),
                                Text('- ${currency.format(discountAmount)}', style: const TextStyle(fontWeight: FontWeight.bold, color: Colors.green)),
                              ],
                            ),
                          ],
                          const SizedBox(height: 8),
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Text(
                                _deliveryMethod == 'pickup' ? 'Store Pickup' : 'Delivery Total',
                                style: const TextStyle(color: Colors.grey),
                              ),
                              Text(
                                _deliveryMethod == 'pickup' ? 'FREE' : currency.format(calculatedShipping),
                                style: const TextStyle(fontWeight: FontWeight.w600),
                              ),
                            ],
                          ),
                          const Divider(height: 20),
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              const Text('Total to Pay', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                              Text(
                                currency.format(totalToPay),
                                style: TextStyle(fontWeight: FontWeight.bold, fontSize: 18, color: scheme.primary),
                              ),
                            ],
                          ),
                          const SizedBox(height: 8),
                          const Row(
                            children: [
                              Icon(Icons.shield_outlined, size: 14, color: Colors.green),
                              SizedBox(width: 6),
                              Expanded(
                                child: Text(
                                  'Inventory is reserved for 30 minutes upon order placement.',
                                  style: TextStyle(fontSize: 11, color: Colors.grey),
                                ),
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
                            : Text(
                                'Place Order (${currency.format(totalToPay)})',
                                style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                              ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
    );
  }
}
