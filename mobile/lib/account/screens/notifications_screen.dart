import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../../core/services/supabase_service.dart';

final notificationsProvider = FutureProvider<List<Map<String, dynamic>>>((ref) async {
  final user = Supabase.instance.client.auth.currentUser;
  if (user == null) return [];

  final data = await SupabaseService.client
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', ascending: false)
      .limit(50);

  return List<Map<String, dynamic>>.from(data as List);
});

class NotificationsScreen extends ConsumerStatefulWidget {
  const NotificationsScreen({super.key});

  @override
  ConsumerState<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends ConsumerState<NotificationsScreen> with SingleTickerProviderStateMixin {
  late TabController _tabController;
  bool _orderUpdates = true;
  bool _chatAlerts = true;
  bool _promoAlerts = true;
  bool _inactivityAlerts = true;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  Future<void> _markAllAsRead() async {
    final user = Supabase.instance.client.auth.currentUser;
    if (user == null) return;

    try {
      await SupabaseService.client
          .from('notifications')
          .update({'is_read': true})
          .eq('user_id', user.id);

      ref.invalidate(notificationsProvider);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('All notifications marked as read'),
            behavior: SnackBarBehavior.floating,
          ),
        );
      }
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final notificationsAsync = ref.watch(notificationsProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Notifications'),
        bottom: TabBar(
          controller: _tabController,
          tabs: const [
            Tab(text: 'Feed'),
            Tab(text: 'Preferences'),
          ],
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.done_all_rounded),
            tooltip: 'Mark All Read',
            onPressed: _markAllAsRead,
          ),
          IconButton(
            icon: const Icon(Icons.refresh),
            tooltip: 'Refresh',
            onPressed: () => ref.invalidate(notificationsProvider),
          ),
        ],
      ),
      body: TabBarView(
        controller: _tabController,
        children: [
          // ── Feed Tab ──────────────────────────────────────────────────────
          notificationsAsync.when(
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (e, _) => Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Text('Error loading notifications: $e', style: TextStyle(color: scheme.error)),
              ),
            ),
            data: (notifications) {
              if (notifications.isEmpty) {
                return Center(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Container(
                          width: 64,
                          height: 64,
                          decoration: BoxDecoration(
                            color: scheme.primary.withValues(alpha: 0.1),
                            shape: BoxShape.circle,
                          ),
                          child: Icon(Icons.notifications_none_rounded, size: 36, color: scheme.primary),
                        ),
                        const SizedBox(height: 16),
                        Text('No notifications yet', style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold)),
                        const SizedBox(height: 6),
                        const Text(
                          'Order updates, store messages, and security notices will appear here.',
                          textAlign: TextAlign.center,
                          style: TextStyle(color: Colors.grey, fontSize: 13),
                        ),
                      ],
                    ),
                  ),
                );
              }

              return RefreshIndicator(
                onRefresh: () async => ref.invalidate(notificationsProvider),
                child: ListView.separated(
                  padding: const EdgeInsets.all(16),
                  itemCount: notifications.length,
                  separatorBuilder: (_, __) => const SizedBox(height: 10),
                  itemBuilder: (ctx, i) {
                    final n = notifications[i];
                    final title = n['title'] as String? ?? 'Notification';
                    final body = n['body'] as String? ?? '';
                    final isRead = n['is_read'] as bool? ?? false;
                    final type = n['type'] as String? ?? 'general';
                    final createdAt = n['created_at'] != null ? DateTime.tryParse(n['created_at']) : null;
                    final timeStr = createdAt != null
                        ? '${createdAt.day}/${createdAt.month} ${createdAt.hour.toString().padLeft(2, '0')}:${createdAt.minute.toString().padLeft(2, '0')}'
                        : '';

                    IconData iconData = Icons.notifications_outlined;
                    Color iconColor = scheme.primary;

                    if (type == 'order') {
                      iconData = Icons.local_shipping_rounded;
                      iconColor = const Color(0xFF10B981);
                    } else if (type == 'inactivity' || type == 'warning') {
                      iconData = Icons.warning_amber_rounded;
                      iconColor = Colors.amber.shade800;
                    } else if (type == 'chat') {
                      iconData = Icons.chat_bubble_outline_rounded;
                      iconColor = const Color(0xFF8B5CF6);
                    }

                    return Card(
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(14),
                        side: isRead
                            ? BorderSide(color: scheme.outlineVariant.withValues(alpha: 0.2))
                            : BorderSide(color: scheme.primary.withValues(alpha: 0.5), width: 1.2),
                      ),
                      child: ListTile(
                        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                        leading: CircleAvatar(
                          backgroundColor: iconColor.withValues(alpha: 0.15),
                          child: Icon(iconData, color: iconColor, size: 22),
                        ),
                        title: Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Expanded(
                              child: Text(
                                title,
                                style: TextStyle(
                                  fontWeight: isRead ? FontWeight.w600 : FontWeight.bold,
                                  fontSize: 14,
                                ),
                              ),
                            ),
                            if (timeStr.isNotEmpty)
                              Text(timeStr, style: TextStyle(fontSize: 11, color: scheme.outline)),
                          ],
                        ),
                        subtitle: Padding(
                          padding: const EdgeInsets.only(top: 4),
                          child: Text(
                            body,
                            style: TextStyle(
                              fontSize: 12,
                              color: isRead ? scheme.outline : scheme.onSurface,
                            ),
                          ),
                        ),
                      ),
                    );
                  },
                ),
              );
            },
          ),

          // ── Preferences Tab ───────────────────────────────────────────────
          ListView(
            padding: const EdgeInsets.all(16),
            children: [
              Text('Alert Channels & Categories', style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold)),
              const SizedBox(height: 12),
              Card(
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                child: Column(
                  children: [
                    SwitchListTile(
                      title: const Text('Order & Delivery Updates', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
                      subtitle: const Text('Status updates on checkout, dispatch and deliveries', style: TextStyle(fontSize: 12)),
                      value: _orderUpdates,
                      onChanged: (val) {
                        setState(() => _orderUpdates = val);
                      },
                    ),
                    const Divider(height: 1),
                    SwitchListTile(
                      title: const Text('Direct Store Messages', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
                      subtitle: const Text('Notifications when sellers reply to inquiries', style: TextStyle(fontSize: 12)),
                      value: _chatAlerts,
                      onChanged: (val) {
                        setState(() => _chatAlerts = val);
                      },
                    ),
                    const Divider(height: 1),
                    SwitchListTile(
                      title: const Text('Promotions & Discounts', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
                      subtitle: const Text('Verified merchant discounts and featured promotions', style: TextStyle(fontSize: 12)),
                      value: _promoAlerts,
                      onChanged: (val) {
                        setState(() => _promoAlerts = val);
                      },
                    ),
                    const Divider(height: 1),
                    SwitchListTile(
                      title: const Text('Account Lifecycle & Inactivity', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
                      subtitle: const Text('Inactivity notices before automatic deletion under 2-month policy', style: TextStyle(fontSize: 12)),
                      value: _inactivityAlerts,
                      onChanged: (val) {
                        setState(() => _inactivityAlerts = val);
                      },
                    ),
                  ],
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
