import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../../core/services/supabase_service.dart';
import '../../core/providers/currency_provider.dart';

final sellerSummaryProvider = FutureProvider<Map<String, dynamic>?>((ref) async {
  final user = Supabase.instance.client.auth.currentUser;
  if (user == null) return null;

  final store = await SupabaseService.client
      .from('stores')
      .select('id, name, slug, status, total_sales, rating_avg, rating_count')
      .eq('owner_id', user.id)
      .maybeSingle();

  if (store == null) return null;

  final storeId = store['id'] as String;

  // Real wallet balances
  final wallet = await SupabaseService.client
      .from('wallet_accounts')
      .select('balance_available, balance_pending')
      .eq('store_id', storeId)
      .maybeSingle();

  // Efficient DB counts without downloading thousands of IDs
  final productsCount = await SupabaseService.client
      .from('products')
      .count(CountOption.exact)
      .eq('store_id', storeId);

  final ordersCount = await SupabaseService.client
      .from('seller_orders')
      .count(CountOption.exact)
      .eq('store_id', storeId);

  // Active subscription plan
  final sub = await SupabaseService.client
      .from('subscriptions')
      .select('status, plan:subscription_plans(name, code)')
      .eq('store_id', storeId)
      .eq('status', 'active')
      .maybeSingle();

  String planName = 'Free Seller';
  if (sub != null && sub['plan'] != null) {
    final p = sub['plan'] as Map<String, dynamic>;
    planName = (p['name'] as String?) ?? 'Free Seller';
  }

  return {
    'store': store,
    'plan_name': planName,
    'available_balance': wallet?['balance_available'] ?? 0.0,
    'pending_balance': wallet?['balance_pending'] ?? 0.0,
    'total_products': productsCount,
    'total_orders': ordersCount,
  };
});

class SellerCentreScreen extends ConsumerStatefulWidget {
  const SellerCentreScreen({super.key});

  @override
  ConsumerState<SellerCentreScreen> createState() => _SellerCentreScreenState();
}

class _SellerCentreScreenState extends ConsumerState<SellerCentreScreen> {
  bool _isOnboarding = false;

  Future<void> _quickOnboardStore() async {
    final user = Supabase.instance.client.auth.currentUser;
    if (user == null) return;

    final nameController = TextEditingController();
    final slugController = TextEditingController();

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Open Your Merchant Store'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Start selling on Pamtechz. Automatically creates your store profile, seller wallet, and active Free tier.',
              style: TextStyle(fontSize: 12, color: Colors.grey),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: nameController,
              decoration: const InputDecoration(
                labelText: 'Store Name',
                hintText: 'e.g. Pamtechz Direct Store',
                border: OutlineInputBorder(),
              ),
              onChanged: (val) {
                slugController.text = val.trim().toLowerCase().replaceAll(RegExp(r'[^a-z0-9]+'), '-');
              },
            ),
            const SizedBox(height: 12),
            TextField(
              controller: slugController,
              decoration: const InputDecoration(
                labelText: 'Store Handle / Slug',
                hintText: 'e.g. pamtechz-direct',
                border: OutlineInputBorder(),
              ),
            ),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          FilledButton(
            onPressed: () {
              if (nameController.text.trim().isNotEmpty) {
                Navigator.pop(ctx, true);
              }
            },
            child: const Text('Confirm & Start'),
          ),
        ],
      ),
    );

    if (confirmed == true && nameController.text.trim().isNotEmpty) {
      setState(() => _isOnboarding = true);
      try {
        final storeName = nameController.text.trim();
        var slug = slugController.text.trim();
        if (slug.isEmpty) {
          slug = storeName.toLowerCase().replaceAll(RegExp(r'[^a-z0-9]+'), '-');
        }

        await SupabaseService.client.rpc('start_selling_onboard_store', params: {
          'p_store_name': storeName,
          'p_store_slug': '$slug-${DateTime.now().millisecondsSinceEpoch % 10000}',
          'p_description': 'Official seller storefront.',
        });

        ref.invalidate(sellerSummaryProvider);

        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text('Store "$storeName" created! Welcome to Seller Centre.'),
              backgroundColor: const Color(0xFF10B981),
            ),
          );
        }
      } catch (e) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Onboarding failed: $e'), backgroundColor: Colors.redAccent),
          );
        }
      } finally {
        if (mounted) setState(() => _isOnboarding = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final currency = ref.watch(currencyProvider).valueOrNull ?? const CurrencyConfig();
    final summaryAsync = ref.watch(sellerSummaryProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Seller Centre'),
        actions: [
          IconButton(
            icon: const Icon(Icons.wallet_outlined),
            tooltip: 'Wallet & Payouts',
            onPressed: () => context.push('/wallet'),
          ),
        ],
      ),
      body: summaryAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Error loading seller centre: $e')),
        data: (data) {
          if (data == null) {
            return Center(
              child: Padding(
                padding: const EdgeInsets.all(24.0),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(Icons.store_outlined, size: 72, color: scheme.primary),
                    const SizedBox(height: 16),
                    Text('Start Selling on Pamtechz', style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold)),
                    const SizedBox(height: 8),
                    const Text(
                      'You do not have an active merchant store yet. Open your store in 30 seconds with automatic Free tier privileges.',
                      textAlign: TextAlign.center,
                      style: TextStyle(color: Colors.grey),
                    ),
                    const SizedBox(height: 24),
                    FilledButton.icon(
                      onPressed: _isOnboarding ? null : _quickOnboardStore,
                      icon: const Icon(Icons.add_business),
                      label: _isOnboarding
                          ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                          : const Text('Open Store & Start Selling'),
                    ),
                  ],
                ),
              ),
            );
          }

          final store = data['store'] as Map<String, dynamic>?;
          final storeName = store?['name'] as String? ?? 'My Store';
          final planName = data['plan_name'] as String? ?? 'Free Seller';
          final availableBalance = double.tryParse(data['available_balance']?.toString() ?? '0') ?? 0.0;
          final pendingBalance = double.tryParse(data['pending_balance']?.toString() ?? '0') ?? 0.0;
          final totalSales = double.tryParse(store?['total_sales']?.toString() ?? '0') ?? 0.0;
          final totalOrders = data['total_orders'] as int? ?? 0;
          final totalProducts = data['total_products'] as int? ?? 0;

          return RefreshIndicator(
            onRefresh: () async => ref.refresh(sellerSummaryProvider),
            child: SingleChildScrollView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.all(16.0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Store & Subscription Plan Card
                  Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: scheme.primaryContainer,
                      borderRadius: BorderRadius.circular(16),
                    ),
                    child: Row(
                      children: [
                        CircleAvatar(
                          radius: 24,
                          backgroundColor: scheme.primary,
                          child: const Icon(Icons.store, color: Colors.white),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(storeName, style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold)),
                              const SizedBox(height: 2),
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                                decoration: BoxDecoration(
                                  color: scheme.primary,
                                  borderRadius: BorderRadius.circular(4),
                                ),
                                child: Text(
                                  planName.toUpperCase(),
                                  style: const TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.bold),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 20),

                  // Overview Metrics Grid
                  Text('Performance Overview', style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold)),
                  const SizedBox(height: 12),
                  GridView.count(
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    crossAxisCount: 2,
                    childAspectRatio: 1.5,
                    crossAxisSpacing: 12,
                    mainAxisSpacing: 12,
                    children: [
                      _buildMetricCard(context, 'Total Sales', currency.format(totalSales), Icons.trending_up, const Color(0xFF10B981)),
                      _buildMetricCard(context, 'Total Orders', '$totalOrders', Icons.shopping_bag, Colors.blue),
                      _buildMetricCard(context, 'Available Balance', currency.format(availableBalance), Icons.account_balance_wallet, Colors.purple),
                      _buildMetricCard(context, 'Pending Funds', currency.format(pendingBalance), Icons.hourglass_empty, Colors.amber),
                    ],
                  ),
                  const SizedBox(height: 24),

                  // Shortcuts
                  Text('Catalogue & Operations', style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold)),
                  const SizedBox(height: 12),
                  Card(
                    child: Column(
                      children: [
                        ListTile(
                          leading: const Icon(Icons.inventory_2_outlined, color: Colors.blue),
                          title: const Text('Manage Products'),
                          subtitle: Text('$totalProducts product(s) in store catalogue'),
                          trailing: const Icon(Icons.chevron_right),
                          onTap: () => context.push('/seller/products'),
                        ),
                        const Divider(height: 1),
                        ListTile(
                          leading: const Icon(Icons.add_box_outlined, color: Color(0xFF10B981)),
                          title: const Text('Add New Product'),
                          subtitle: const Text('Upload images and publish item'),
                          trailing: const Icon(Icons.chevron_right),
                          onTap: () => context.push('/seller/products/add'),
                        ),
                        const Divider(height: 1),
                        ListTile(
                          leading: const Icon(Icons.account_balance_wallet_outlined, color: Colors.purple),
                          title: const Text('Wallet & Payouts'),
                          subtitle: const Text('View financial ledger & request settlement'),
                          trailing: const Icon(Icons.chevron_right),
                          onTap: () => context.push('/wallet'),
                        ),
                        const Divider(height: 1),
                        ListTile(
                          leading: const Icon(Icons.card_membership_outlined, color: Colors.orange),
                          title: const Text('Subscription Plans & Limits'),
                          subtitle: const Text('Manage catalogue tier, limits & quotas'),
                          trailing: const Icon(Icons.chevron_right),
                          onTap: () => context.push('/plans'),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 20),

                  // Zero-cost user-owned cloud media guide banner
                  Card(
                    color: scheme.surfaceContainerHighest.withValues(alpha: 0.4),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Container(
                                padding: const EdgeInsets.all(8),
                                decoration: BoxDecoration(
                                  color: const Color(0xFF10B981).withValues(alpha: 0.15),
                                  shape: BoxShape.circle,
                                ),
                                child: const Icon(Icons.cloud_done_rounded, color: Color(0xFF10B981), size: 20),
                              ),
                              const SizedBox(width: 10),
                              const Text(
                                'Zero-Cost Media Hosting',
                                style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14),
                              ),
                            ],
                          ),
                          const SizedBox(height: 10),
                          Text(
                            'To keep store listing completely free, product images are hosted on your own free personal Cloudinary, Google Drive, or Dropbox accounts. Simply paste your shared links when adding products!',
                            style: TextStyle(fontSize: 12, color: scheme.outline, height: 1.4),
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 40),
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  Widget _buildMetricCard(BuildContext context, String title, String value, IconData icon, Color color) {
    return Card(
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: BorderSide(color: Theme.of(context).dividerColor.withValues(alpha: 0.1)),
      ),
      child: Padding(
        padding: const EdgeInsets.all(12.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(title, style: const TextStyle(fontSize: 11, color: Colors.grey, fontWeight: FontWeight.w500)),
                Icon(icon, size: 16, color: color),
              ],
            ),
            Text(value, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.bold)),
          ],
        ),
      ),
    );
  }
}
