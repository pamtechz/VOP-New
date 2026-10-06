import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/services/supabase_service.dart';

final subscriptionPlansProvider =
    FutureProvider<List<Map<String, dynamic>>>((ref) async {
  final data = await SupabaseService.client
      .from('subscription_plans')
      .select('*')
      .eq('is_active', true)
      .order('price_monthly', ascending: true);
  return List<Map<String, dynamic>>.from(data as List);
});

class SubscriptionPlansScreen extends ConsumerStatefulWidget {
  const SubscriptionPlansScreen({super.key});

  @override
  ConsumerState<SubscriptionPlansScreen> createState() =>
      _SubscriptionPlansScreenState();
}

class _SubscriptionPlansScreenState
    extends ConsumerState<SubscriptionPlansScreen> {
  String _selectedCode = 'business';

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final plansAsync = ref.watch(subscriptionPlansProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Seller Subscription Plans'),
      ),
      body: plansAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Error loading plans: $e')),
        data: (plans) {
          return RefreshIndicator(
            onRefresh: () async => ref.refresh(subscriptionPlansProvider),
            child: SingleChildScrollView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.all(16.0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Upgrade Store Capacity',
                      style: theme.textTheme.titleMedium
                          ?.copyWith(fontWeight: FontWeight.bold)),
                  const SizedBox(height: 6),
                  const Text(
                    'Subscription limits are managed centrally in Supabase. Select a plan to scale your product catalogue.',
                    style: TextStyle(fontSize: 12, color: Colors.grey),
                  ),
                  const SizedBox(height: 20),
                  ...plans.map((plan) {
                    final code = plan['code'] as String? ?? '';
                    final name = plan['name'] as String? ?? 'Plan';
                    final price = double.tryParse(
                            plan['price_monthly']?.toString() ?? '0') ??
                        0.0;
                    final maxProducts = plan['max_products'] as int? ?? 10;
                    final maxImages =
                        plan['max_images_per_product'] as int? ?? 3;
                    final isSelected = _selectedCode == code;

                    return Card(
                      margin: const EdgeInsets.only(bottom: 16),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(16),
                        side: BorderSide(
                          color: isSelected
                              ? scheme.primary
                              : theme.dividerColor.withValues(alpha: 0.1),
                          width: isSelected ? 2 : 1,
                        ),
                      ),
                      child: Padding(
                        padding: const EdgeInsets.all(18.0),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                Text(name,
                                    style: const TextStyle(
                                        fontWeight: FontWeight.bold,
                                        fontSize: 16)),
                                Text(
                                  price == 0
                                      ? 'Free'
                                      : 'K${price.toStringAsFixed(0)} /mo',
                                  style: TextStyle(
                                      fontWeight: FontWeight.bold,
                                      fontSize: 16,
                                      color: scheme.primary),
                                ),
                              ],
                            ),
                            const SizedBox(height: 12),
                            Row(
                              children: [
                                const Icon(Icons.check_circle_outline,
                                    size: 16, color: Color(0xFF10B981)),
                                const SizedBox(width: 8),
                                Text('Up to $maxProducts products listed',
                                    style: const TextStyle(fontSize: 13)),
                              ],
                            ),
                            const SizedBox(height: 6),
                            Row(
                              children: [
                                const Icon(Icons.check_circle_outline,
                                    size: 16, color: Color(0xFF10B981)),
                                const SizedBox(width: 8),
                                Text(
                                    '$maxImages images per product (WebP compressed)',
                                    style: const TextStyle(fontSize: 13)),
                              ],
                            ),
                            const SizedBox(height: 16),
                            SizedBox(
                              width: double.infinity,
                              child: ElevatedButton(
                                style: ElevatedButton.styleFrom(
                                  backgroundColor: isSelected
                                      ? scheme.primary
                                      : scheme.surfaceContainerHighest,
                                  foregroundColor: isSelected
                                      ? scheme.onPrimary
                                      : scheme.onSurfaceVariant,
                                  shape: RoundedRectangleBorder(
                                      borderRadius: BorderRadius.circular(8)),
                                ),
                                onPressed: () {
                                  setState(() => _selectedCode = code);
                                  ScaffoldMessenger.of(context).showSnackBar(
                                    SnackBar(
                                        content: Text('Plan selected: $name')),
                                  );
                                },
                                child: Text(isSelected
                                    ? 'Current Active Plan'
                                    : 'Select Plan'),
                              ),
                            ),
                          ],
                        ),
                      ),
                    );
                  }),
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}
