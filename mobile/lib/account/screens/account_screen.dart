import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../../auth/providers/auth_provider.dart';
import '../../core/services/supabase_service.dart';

// ── Lifecycle provider ────────────────────────────────────────────────────────
final lifecycleProvider = FutureProvider<Map<String, dynamic>?>((ref) async {
  final user = Supabase.instance.client.auth.currentUser;
  if (user == null) return null;
  final data = await SupabaseService.client
      .from('account_lifecycle')
      .select('last_active_at, deletion_due_at, warning_stage')
      .eq('user_id', user.id)
      .maybeSingle();
  return data;
});

// ── Screen ───────────────────────────────────────────────────────────────────
class AccountScreen extends ConsumerStatefulWidget {
  const AccountScreen({super.key});

  @override
  ConsumerState<AccountScreen> createState() => _AccountScreenState();
}

class _AccountScreenState extends ConsumerState<AccountScreen> {
  bool _signingOut = false;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final profile = ref.watch(profileProvider);
    final lifecycle = ref.watch(lifecycleProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('My Account'),
      ),
      body: profile.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Error: $e')),
        data: (p) {
          final fullName = p?['full_name'] as String? ?? 'User';
          final avatarUrl = p?['avatar_url'] as String?;
          final phone = p?['phone'] as String? ?? '';
          final role = p?['role'] as String? ?? 'user';
          final email =
              Supabase.instance.client.auth.currentUser?.email ?? '';
          final initials = fullName
              .split(' ')
              .where((w) => w.isNotEmpty)
              .take(2)
              .map((w) => w[0].toUpperCase())
              .join();

          return SingleChildScrollView(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Profile Header
                Row(
                  children: [
                    CircleAvatar(
                      radius: 32,
                      backgroundColor: scheme.primaryContainer,
                      backgroundImage:
                          avatarUrl != null ? NetworkImage(avatarUrl) : null,
                      child: avatarUrl == null
                          ? Text(initials.isEmpty ? 'U' : initials,
                              style: TextStyle(
                                  color: scheme.onPrimaryContainer,
                                  fontWeight: FontWeight.bold,
                                  fontSize: 22))
                          : null,
                    ),
                    const SizedBox(width: 16),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(fullName,
                              style: const TextStyle(
                                  fontWeight: FontWeight.bold, fontSize: 18)),
                          if (email.isNotEmpty)
                            Text(email,
                                style: TextStyle(
                                    color: scheme.outline, fontSize: 13)),
                          if (phone.isNotEmpty)
                            Text(phone,
                                style: TextStyle(
                                    color: scheme.outline, fontSize: 12)),
                          const SizedBox(height: 4),
                          Container(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 8, vertical: 2),
                            decoration: BoxDecoration(
                              color: scheme.primaryContainer,
                              borderRadius: BorderRadius.circular(4),
                            ),
                            child: Text(
                              role.replaceAll('_', ' ').toUpperCase(),
                              style: TextStyle(
                                  fontSize: 10,
                                  fontWeight: FontWeight.bold,
                                  color: scheme.onPrimaryContainer),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 24),

                // Lifecycle warning banner
                lifecycle.when(
                  data: (lc) {
                    if (lc == null ||
                        (lc['warning_stage'] as int? ?? 0) == 0) {
                      return const SizedBox.shrink();
                    }
                    final deletion = lc['deletion_due_at'] as String?;
                    final deletionDate = deletion != null
                        ? DateTime.tryParse(deletion)
                        : null;
                    final daysLeft = deletionDate != null
                        ? deletionDate.difference(DateTime.now()).inDays
                        : 0;

                    return Column(
                      children: [
                        Container(
                          padding: const EdgeInsets.all(16),
                          decoration: BoxDecoration(
                            color: Colors.amber.shade900.withOpacity(0.15),
                            border:
                                Border.all(color: Colors.amber.shade700),
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                children: [
                                  Icon(Icons.warning_amber_rounded,
                                      color: Colors.amber.shade700),
                                  const SizedBox(width: 8),
                                  Text('Inactivity Warning',
                                      style: TextStyle(
                                          fontWeight: FontWeight.bold,
                                          color: Colors.amber.shade700)),
                                ],
                              ),
                              const SizedBox(height: 8),
                              Text(
                                'Your account is inactive. Scheduled for deletion in $daysLeft days.',
                                style: const TextStyle(
                                    fontSize: 12, height: 1.4),
                              ),
                              const SizedBox(height: 12),
                              ElevatedButton.icon(
                                icon: const Icon(
                                    Icons.check_circle_outline,
                                    size: 18),
                                label: const Text('Keep My Account'),
                                style: ElevatedButton.styleFrom(
                                  backgroundColor: Colors.amber.shade800,
                                  foregroundColor: Colors.white,
                                  padding: const EdgeInsets.symmetric(
                                      horizontal: 16, vertical: 10),
                                ),
                                onPressed: () async {
                                  await SupabaseService.touchActivity();
                                  ref.invalidate(lifecycleProvider);
                                  if (context.mounted) {
                                    ScaffoldMessenger.of(context)
                                        .showSnackBar(const SnackBar(
                                      content: Text(
                                          'Account activity confirmed! 60-day timer reset.'),
                                    ));
                                  }
                                },
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(height: 24),
                      ],
                    );
                  },
                  loading: () => const SizedBox.shrink(),
                  error: (_, __) => const SizedBox.shrink(),
                ),

                // Navigation items
                Text('Account',
                    style: theme.textTheme.titleMedium
                        ?.copyWith(fontWeight: FontWeight.bold)),
                const SizedBox(height: 8),

                ListTile(
                  leading:
                      Icon(Icons.receipt_long_outlined, color: scheme.primary),
                  title: const Text('My Orders'),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => context.push('/orders'),
                ),
                ListTile(
                  leading:
                      Icon(Icons.favorite_border_rounded, color: const Color(0xFFEF4444)),
                  title: const Text('Saved Items & Wishlist'),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => context.push('/wishlist'),
                ),
                ListTile(
                  leading:
                      Icon(Icons.account_balance_wallet_outlined, color: scheme.primary),
                  title: const Text('My Wallet'),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => context.push('/wallet'),
                ),
                ListTile(
                  leading:
                      Icon(Icons.directions_bike_outlined, color: const Color(0xFF2563EB)),
                  title: const Text('Delivery Driver Console'),
                  subtitle: const Text('Live dispatch & GPS telemetry', style: TextStyle(fontSize: 11)),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => context.push('/driver'),
                ),
                ListTile(
                  leading: Icon(Icons.storefront_outlined, color: scheme.primary),
                  title: const Text('Seller Centre'),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => context.push('/seller'),
                ),

                const Divider(height: 24),

                Text('Settings',
                    style: theme.textTheme.titleMedium
                        ?.copyWith(fontWeight: FontWeight.bold)),
                const SizedBox(height: 8),

                ListTile(
                  leading: const Icon(Icons.location_on_outlined),
                  title: const Text('Saved Addresses'),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => context.push('/addresses'),
                ),
                ListTile(
                  leading: const Icon(Icons.notifications_outlined),
                  title: const Text('Notifications'),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => context.push('/notifications'),
                ),
                ListTile(
                  leading: const Icon(Icons.security_outlined),
                  title: const Text('Security & Password'),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => context.push('/security'),
                ),
                ListTile(
                  leading: Icon(Icons.info_outline, color: scheme.primary),
                  title: const Text('About Us & Platform Policies'),
                  subtitle: const Text('Admin-managed policies & terms', style: TextStyle(fontSize: 11)),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => context.push('/about'),
                ),

                const Divider(height: 24),

                ListTile(
                  leading: Icon(Icons.logout, color: scheme.error),
                  title: Text('Sign Out',
                      style: TextStyle(color: scheme.error)),
                  onTap: _signingOut
                      ? null
                      : () async {
                          setState(() => _signingOut = true);
                          await ref
                              .read(authNotifierProvider.notifier)
                              .signOut();
                          if (context.mounted) context.go('/login');
                        },
                ),
                ListTile(
                  leading: const Icon(Icons.delete_forever_outlined,
                      color: Colors.red),
                  title: const Text('Delete Account',
                      style: TextStyle(color: Colors.red)),
                  onTap: () {
                    showDialog(
                      context: context,
                      builder: (ctx) => AlertDialog(
                        title: const Text('Delete Account'),
                        content: const Text(
                            'This will permanently delete your account and all data. This action cannot be undone.'),
                        actions: [
                          TextButton(
                              onPressed: () => Navigator.pop(ctx),
                              child: const Text('Cancel')),
                          FilledButton(
                            style: FilledButton.styleFrom(
                                backgroundColor: Colors.red),
                            onPressed: () => Navigator.pop(ctx),
                            child: const Text('Delete'),
                          ),
                        ],
                      ),
                    );
                  },
                ),

                const SizedBox(height: 40),
              ],
            ),
          );
        },
      ),
    );
  }
}
