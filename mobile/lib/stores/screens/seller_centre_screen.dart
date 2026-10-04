import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../../core/services/supabase_service.dart';

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

  final wallet = await SupabaseService.client
      .from('wallet_accounts')
      .select('balance_available, balance_pending')
      .eq('store_id', storeId)
      .maybeSingle();

  final products = await SupabaseService.client
      .from('products')
      .select('id')
      .eq('store_id', storeId);

  final orders = await SupabaseService.client
      .from('seller_orders')
      .select('id')
      .eq('store_id', storeId);

  return {
    'store': store,
    'available_balance': wallet?['balance_available'] ?? 0.0,
    'pending_balance': wallet?['balance_pending'] ?? 0.0,
    'total_products': (products as List).length,
    'total_orders': (orders as List).length,
  };
});

class SellerCentreScreen extends ConsumerWidget {
  const SellerCentreScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final summaryAsync = ref.watch(sellerSummaryProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Seller Centre'),
        actions: [
          IconButton(
            icon: const Icon(Icons.wallet_outlined),
            onPressed: () => context.push('/wallet'),
          ),
        ],
      ),
      body: summaryAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Error loading seller centre: $e')),
        data: (data) {
          final store = data?['store'] as Map<String, dynamic>?;
          final storeName = store?['name'] as String? ?? 'My Store';
          final availableBalance = double.tryParse(data?['available_balance']?.toString() ?? '0') ?? 0.0;
          final pendingBalance = double.tryParse(data?['pending_balance']?.toString() ?? '0') ?? 0.0;
          final totalSales = double.tryParse(store?['total_sales']?.toString() ?? '0') ?? 0.0;
          final totalOrders = data?['total_orders'] as int? ?? 0;
          final totalProducts = data?['total_products'] as int? ?? 0;

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
                                  color: Colors.blue.shade800,
                                  borderRadius: BorderRadius.circular(4),
                                ),
                                child: const Text(
                                  'BUSINESS SELLER',
                                  style: TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.bold),
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
                      _buildMetricCard(context, 'Total Sales', 'K${totalSales.toStringAsFixed(2)}', Icons.trending_up, const Color(0xFF10B981)),
                      _buildMetricCard(context, 'Total Orders', '$totalOrders', Icons.shopping_bag, Colors.blue),
                      _buildMetricCard(context, 'Available Balance', 'K${availableBalance.toStringAsFixed(2)}', Icons.account_balance_wallet, Colors.purple),
                      _buildMetricCard(context, 'Pending Funds', 'K${pendingBalance.toStringAsFixed(2)}', Icons.hourglass_empty, Colors.amber),
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
        side: BorderSide(color: Theme.of(context).dividerColor.withOpacity(0.1)),
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
