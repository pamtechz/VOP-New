import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../../core/services/supabase_service.dart';
import '../../core/providers/currency_provider.dart';

// ── Providers ──────────────────────────────────────────────────────────────
final walletAccountProvider = FutureProvider<Map<String, dynamic>?>((ref) async {
  final user = Supabase.instance.client.auth.currentUser;
  if (user == null) return null;

  // Find user's store
  final store = await SupabaseService.client
      .from('stores')
      .select('id, name')
      .eq('owner_id', user.id)
      .maybeSingle();

  if (store == null) return null;

  final wallet = await SupabaseService.client
      .from('wallet_accounts')
      .select('id, balance_available, balance_pending')
      .eq('store_id', store['id'])
      .maybeSingle();

  return wallet;
});

final walletLedgerProvider = FutureProvider<List<Map<String, dynamic>>>((ref) async {
  final user = Supabase.instance.client.auth.currentUser;
  if (user == null) return [];

  final store = await SupabaseService.client
      .from('stores')
      .select('id')
      .eq('owner_id', user.id)
      .maybeSingle();

  if (store == null) return [];

  final wallet = await SupabaseService.client
      .from('wallet_accounts')
      .select('id')
      .eq('store_id', store['id'])
      .maybeSingle();

  if (wallet == null) return [];

  final ledger = await SupabaseService.client
      .from('wallet_ledger')
      .select('*')
      .eq('wallet_account_id', wallet['id'])
      .order('created_at', ascending: false)
      .limit(50);

  return List<Map<String, dynamic>>.from(ledger as List);
});

// ── Screen ──────────────────────────────────────────────────────────────────
class WalletLedgerScreen extends ConsumerWidget {
  const WalletLedgerScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final currency = ref.watch(currencyProvider).valueOrNull ?? const CurrencyConfig();
    final walletAsync = ref.watch(walletAccountProvider);
    final ledgerAsync = ref.watch(walletLedgerProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Financial Wallet & Ledger'),
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(walletAccountProvider);
          ref.invalidate(walletLedgerProvider);
        },
        child: SingleChildScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.all(16.0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Wallet Balance Header Card
              walletAsync.when(
                loading: () => const Center(child: Padding(padding: EdgeInsets.all(32), child: CircularProgressIndicator())),
                error: (e, _) => Card(child: Padding(padding: const EdgeInsets.all(16), child: Text('Wallet error: $e'))),
                data: (wallet) {
                  final available = double.tryParse(wallet?['balance_available']?.toString() ?? '0') ?? 0.0;
                  final pending = double.tryParse(wallet?['balance_pending']?.toString() ?? '0') ?? 0.0;

                  return Container(
                    padding: const EdgeInsets.all(20),
                    decoration: BoxDecoration(
                      color: scheme.primaryContainer,
                      borderRadius: BorderRadius.circular(16),
                    ),
                    child: Column(
                      children: [
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text('Available for Payout', style: TextStyle(color: scheme.onPrimaryContainer.withOpacity(0.8), fontSize: 12)),
                                const SizedBox(height: 4),
                                Text(
                                  currency.format(available),
                                  style: TextStyle(
                                    fontSize: 26,
                                    fontWeight: FontWeight.bold,
                                    color: scheme.onPrimaryContainer,
                                  ),
                                ),
                              ],
                            ),
                            ElevatedButton(
                              style: ElevatedButton.styleFrom(
                                backgroundColor: scheme.primary,
                                foregroundColor: scheme.onPrimary,
                              ),
                              onPressed: available > 0
                                  ? () {
                                      ScaffoldMessenger.of(context).showSnackBar(
                                        const SnackBar(content: Text('Payout request submitted for admin review!')),
                                      );
                                    }
                                  : null,
                              child: const Text('Request Payout'),
                            ),
                          ],
                        ),
                        const Divider(height: 24),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Row(
                              children: [
                                const Icon(Icons.hourglass_empty, size: 16, color: Colors.amber),
                                const SizedBox(width: 6),
                                Text('Pending Clearance: ${currency.format(pending)}', style: const TextStyle(fontSize: 12)),
                              ],
                            ),
                            const Text('T+2 Settlement', style: TextStyle(fontSize: 11, color: Colors.grey)),
                          ],
                        ),
                      ],
                    ),
                  );
                },
              ),
              const SizedBox(height: 24),

              // Ledger Transactions
              Text('Immutable Financial Ledger', style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold)),
              const SizedBox(height: 4),
              const Text('All credits and debits are strictly appended and audited.', style: TextStyle(fontSize: 12, color: Colors.grey)),
              const SizedBox(height: 12),

              ledgerAsync.when(
                loading: () => const Center(child: CircularProgressIndicator()),
                error: (e, _) => Text('Ledger error: $e'),
                data: (entries) {
                  if (entries.isEmpty) {
                    return Card(
                      child: Padding(
                        padding: const EdgeInsets.all(24),
                        child: Center(
                          child: Column(
                            children: [
                              Icon(Icons.receipt_long_outlined, size: 48, color: scheme.outline),
                              const SizedBox(height: 8),
                              const Text('No ledger entries recorded yet.'),
                            ],
                          ),
                        ),
                      ),
                    );
                  }

                  return Column(
                    children: entries.map((entry) {
                      final amount = double.tryParse(entry['amount']?.toString() ?? '0') ?? 0.0;
                      final isCredit = amount >= 0;
                      final type = entry['type'] as String? ?? 'transaction';
                      final desc = entry['description'] as String? ?? '';
                      final date = entry['created_at'] != null 
                          ? DateTime.parse(entry['created_at']).toLocal().toString().substring(0, 16)
                          : '';

                      return Card(
                        margin: const EdgeInsets.only(bottom: 8),
                        child: ListTile(
                          leading: CircleAvatar(
                            backgroundColor: isCredit ? const Color(0xFF10B981).withOpacity(0.15) : Colors.redAccent.withOpacity(0.15),
                            child: Icon(
                              isCredit ? Icons.arrow_downward : Icons.arrow_upward,
                              color: isCredit ? const Color(0xFF10B981) : Colors.redAccent,
                              size: 20,
                            ),
                          ),
                          title: Text(
                            type.replaceAll('_', ' ').toUpperCase(),
                            style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13),
                          ),
                          subtitle: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(desc, style: const TextStyle(fontSize: 12)),
                              Text(date, style: const TextStyle(fontSize: 10, color: Colors.grey)),
                            ],
                          ),
                          trailing: Text(
                            '${isCredit ? '+' : '-'}${currency.format(amount.abs())}',
                            style: TextStyle(
                              color: isCredit ? const Color(0xFF10B981) : Colors.redAccent,
                              fontWeight: FontWeight.bold,
                              fontSize: 14,
                            ),
                          ),
                        ),
                      );
                    }).toList(),
                  );
                },
              ),
            ],
          ),
        ),
      ),
    );
  }
}
