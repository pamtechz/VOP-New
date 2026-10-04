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
      .limit(30);

  return List<Map<String, dynamic>>.from(data as List);
});

class NotificationsScreen extends ConsumerWidget {
  const NotificationsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final notificationsAsync = ref.watch(notificationsProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Notifications'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: () => ref.invalidate(notificationsProvider),
          ),
        ],
      ),
      body: notificationsAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Error: $e')),
        data: (notifications) {
          if (notifications.isEmpty) {
            return Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.notifications_none_outlined, size: 64, color: scheme.outline),
                  const SizedBox(height: 16),
                  Text('No notifications yet', style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold)),
                  const SizedBox(height: 8),
                  const Text('Order updates and announcements will appear here.', style: TextStyle(color: Colors.grey, fontSize: 13)),
                ],
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
                final createdAt = n['created_at'] != null
                    ? DateTime.tryParse(n['created_at'])
                    : null;
                final timeStr = createdAt != null
                    ? '${createdAt.day}/${createdAt.month} ${createdAt.hour}:${createdAt.minute.toString().padLeft(2, '0')}'
                    : '';

                IconData typeIcon = Icons.notifications_outlined;
                Color typeColor = scheme.primary;
                if (type == 'order') {
                  typeIcon = Icons.local_shipping_outlined;
                  typeColor = const Color(0xFF10B981);
                } else if (type == 'inactivity') {
                  typeIcon = Icons.warning_amber_rounded;
                  typeColor = Colors.amber;
                }

                return Card(
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                    side: isRead ? BorderSide.none : BorderSide(color: scheme.primary.withValues(alpha: 0.4)),
                  ),
                  child: ListTile(
                    contentPadding: const EdgeInsets.all(12),
                    leading: CircleAvatar(
                      backgroundColor: typeColor.withValues(alpha: 0.15),
                      child: Icon(typeIcon, color: typeColor, size: 22),
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
                          Text(timeStr, style: const TextStyle(fontSize: 10, color: Colors.grey)),
                      ],
                    ),
                    subtitle: Padding(
                      padding: const EdgeInsets.only(top: 4),
                      child: Text(body, style: TextStyle(fontSize: 12, color: scheme.onSurfaceVariant)),
                    ),
                  ),
                );
              },
            ),
          );
        },
      ),
    );
  }
}
