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
      .select('id, store_id, balance_available, balance_pending, currency')
      .eq('store_id', store['id'])
      .maybeSingle();

  if (wallet == null) return null;

  final payoutSetting = await SupabaseService.client
      .from('platform_settings')
      .select('value')
      .eq('key', 'minimum_payout_amount')
      .maybeSingle();
  final minimumPayout =
      double.tryParse(payoutSetting?['value']?.toString() ?? '') ?? 100.0;

  return {
    ...wallet,
    'store_name': store['name'],
    'minimum_payout': minimumPayout,
  };
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
class WalletLedgerScreen extends ConsumerStatefulWidget {
  const WalletLedgerScreen({super.key});

  @override
  ConsumerState<WalletLedgerScreen> createState() => _WalletLedgerScreenState();
}

class _WalletLedgerScreenState extends ConsumerState<WalletLedgerScreen> {
  bool _isRequestingPayout = false;

  Future<void> _showPayoutDialog(
    BuildContext context,
    String storeId,
    double availableBalance,
    double minimumPayout,
    CurrencyConfig currency,
  ) async {
    final amountController = TextEditingController(text: availableBalance.toStringAsFixed(2));
    final phoneController = TextEditingController();
    String selectedProvider = 'airtel';

    final confirmed = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (ctx) => StatefulBuilder(
        builder: (context, setModalState) {
          final scheme = Theme.of(context).colorScheme;

          return Padding(
            padding: EdgeInsets.only(
              left: 20,
              right: 20,
              top: 20,
              bottom: MediaQuery.of(context).viewInsets.bottom + 20,
            ),
            child: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Center(
                    child: Container(
                      width: 40,
                      height: 4,
                      decoration: BoxDecoration(
                        color: scheme.outlineVariant,
                        borderRadius: BorderRadius.circular(4),
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),
                  const Text('Request Wallet Payout', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                  const SizedBox(height: 6),
                  Text(
                    'Available balance: ${currency.format(availableBalance)} (Minimum payout: ${currency.format(minimumPayout)})',
                    style: const TextStyle(fontSize: 12, color: Colors.grey),
                  ),
                  const SizedBox(height: 16),

                  TextFormField(
                    controller: amountController,
                    keyboardType: const TextInputType.numberWithOptions(decimal: true),
                    decoration: InputDecoration(
                      labelText: 'Payout Amount (${currency.code})',
                      prefixText: '${currency.symbol} ',
                      border: const OutlineInputBorder(),
                    ),
                  ),
                  const SizedBox(height: 14),

                  const Text('Payout Destination', style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: Colors.grey)),
                  const SizedBox(height: 8),
                  DropdownButtonFormField<String>(
                    value: selectedProvider,
                    decoration: const InputDecoration(border: OutlineInputBorder(), contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 8)),
                    items: const [
                      DropdownMenuItem(value: 'airtel', child: Text('Airtel Money')),
                      DropdownMenuItem(value: 'mtn', child: Text('MTN MoMo')),
                      DropdownMenuItem(value: 'zamtel', child: Text('Zamtel Kwacha')),
                      DropdownMenuItem(value: 'bank', child: Text('Local Bank Transfer')),
                    ],
                    onChanged: (val) => setModalState(() => selectedProvider = val!),
                  ),
                  const SizedBox(height: 12),

                  TextFormField(
                    controller: phoneController,
                    keyboardType: TextInputType.phone,
                    decoration: InputDecoration(
                      labelText: selectedProvider == 'bank' ? 'Account Number & Bank Name' : 'Registered Mobile Money Number',
                      hintText: selectedProvider == 'bank' ? 'e.g. 0123456789 (ZANACO)' : 'e.g. +260 971 234567',
                      border: const OutlineInputBorder(),
                    ),
                  ),
                  const SizedBox(height: 20),

                  SizedBox(
                    width: double.infinity,
                    height: 48,
                    child: FilledButton(
                      onPressed: () {
                        final amt = double.tryParse(amountController.text.trim());
                        final dest = phoneController.text.trim();
                        if (amt == null || amt <= 0 || dest.isEmpty) {
                          ScaffoldMessenger.of(context).showSnackBar(
                            const SnackBar(content: Text('Please enter a valid amount and destination')),
                          );
                          return;
                        }
                        if (amt < minimumPayout) {
                          ScaffoldMessenger.of(context).showSnackBar(
                            SnackBar(content: Text('Minimum payout is ${currency.format(minimumPayout)}')),
                          );
                          return;
                        }
                        if (amt > availableBalance) {
                          ScaffoldMessenger.of(context).showSnackBar(
                            const SnackBar(content: Text('Requested amount exceeds available balance')),
                          );
                          return;
                        }
                        Navigator.pop(ctx, true);
                      },
                      child: const Text('Submit Payout Request'),
                    ),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );

    if (confirmed == true) {
      final amt = double.tryParse(amountController.text.trim()) ?? 0.0;
      final dest = phoneController.text.trim();

      setState(() => _isRequestingPayout = true);

      try {
        final res = await SupabaseService.client.rpc('request_payout', params: {
          'p_store_id': storeId,
          'p_amount': amt,
          'p_destination_info': {
            'provider': selectedProvider,
            'account': dest,
            'currency': currency.code,
          },
        });

        ref.invalidate(walletAccountProvider);
        ref.invalidate(walletLedgerProvider);

        if (mounted) {
          final resMap = res as Map<String, dynamic>?;
          final refCode = resMap?['public_ref'] ?? 'PO';
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text('Payout request $refCode created for ${currency.format(amt)}!'),
              backgroundColor: const Color(0xFF10B981),
            ),
          );
        }
      } catch (e) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text('Payout failed: ${e.toString().replaceAll("Exception: ", "")}'),
              backgroundColor: Colors.redAccent,
            ),
          );
        }
      } finally {
        if (mounted) setState(() => _isRequestingPayout = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
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
                  if (wallet == null) {
                    return Card(
                      child: Padding(
                        padding: const EdgeInsets.all(20),
                        child: Column(
                          children: [
                            const Icon(Icons.account_balance_wallet_outlined, size: 48, color: Colors.grey),
                            const SizedBox(height: 8),
                            const Text('No seller wallet found for this account.'),
                            const SizedBox(height: 4),
                            const Text('Open a merchant store in Seller Centre to activate your wallet.', style: TextStyle(fontSize: 12, color: Colors.grey)),
                          ],
                        ),
                      ),
                    );
                  }

                  final storeId = wallet['store_id'] as String;
                  final available = double.tryParse(wallet['balance_available']?.toString() ?? '0') ?? 0.0;
                  final pending = double.tryParse(wallet['balance_pending']?.toString() ?? '0') ?? 0.0;
                  final minimumPayout = double.tryParse(wallet['minimum_payout']?.toString() ?? '100') ?? 100.0;

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
                              onPressed: (available >= minimumPayout && !_isRequestingPayout)
                                  ? () => _showPayoutDialog(
                                        context,
                                        storeId,
                                        available,
                                        minimumPayout,
                                        currency,
                                      )
                                  : null,
                              child: _isRequestingPayout
                                  ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                                  : const Text('Request Payout'),
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
                            const Text('T+2 Settlement Engine', style: TextStyle(fontSize: 11, color: Colors.grey)),
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
