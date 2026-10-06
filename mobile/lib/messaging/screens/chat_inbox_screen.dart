import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../../core/services/supabase_service.dart';

class ChatInboxScreen extends ConsumerStatefulWidget {
  const ChatInboxScreen({super.key});

  @override
  ConsumerState<ChatInboxScreen> createState() => _ChatInboxScreenState();
}

class _ChatInboxScreenState extends ConsumerState<ChatInboxScreen> {
  final List<Map<String, dynamic>> _conversations = [];
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _fetchConversations();
  }

  Future<void> _fetchConversations() async {
    final user = Supabase.instance.client.auth.currentUser;
    if (user == null) {
      if (mounted) setState(() => _isLoading = false);
      return;
    }

    try {
      final data = await SupabaseService.client
          .from('conversations')
          .select('''
            id, store_id, product_id, updated_at,
            stores (id, name, logo_url),
            messages (content, created_at, sender_id)
          ''')
          .or('buyer_id.eq.${user.id}')
          .order('updated_at', ascending: false);

      if (mounted) {
        setState(() {
          _conversations.clear();
          _conversations.addAll(List<Map<String, dynamic>>.from(data as List));
          _isLoading = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;

    return Scaffold(
      appBar: AppBar(
        title: const Text('My Messages & Active Chats', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 18)),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: _fetchConversations,
          ),
        ],
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : _conversations.isEmpty
              ? Center(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.forum_outlined, size: 54, color: scheme.outline),
                      const SizedBox(height: 12),
                      const Text('No active message conversations found.'),
                      const SizedBox(height: 4),
                      const Text(
                        'Start a chat from any product or store page.',
                        style: TextStyle(fontSize: 12, color: Colors.grey),
                      ),
                    ],
                  ),
                )
              : RefreshIndicator(
                  onRefresh: _fetchConversations,
                  child: ListView.builder(
                    padding: const EdgeInsets.all(12),
                    itemCount: _conversations.length,
                    itemBuilder: (context, index) {
                      final item = _conversations[index];
                      final store = item['stores'] as Map<String, dynamic>?;
                      final storeName = store?['name'] as String? ?? 'Store Support';
                      final storeId = item['store_id'] as String? ?? '';
                      final productId = item['product_id'] as String?;
                      final rawMessages = item['messages'] as List? ?? [];
                      
                      String lastMsgText = 'No messages yet';
                      String lastTimeStr = '';
                      if (rawMessages.isNotEmpty) {
                        final lastMsg = rawMessages.last as Map<String, dynamic>;
                        lastMsgText = lastMsg['content'] as String? ?? '';
                        final dtStr = lastMsg['created_at'] as String?;
                        if (dtStr != null) {
                          final dt = DateTime.parse(dtStr).toLocal();
                          lastTimeStr = '${dt.hour.toString().padLeft(2, '0')}:${dt.minute.toString().padLeft(2, '0')}';
                        }
                      }

                      return Card(
                        elevation: 1.5,
                        margin: const EdgeInsets.only(bottom: 10),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                        child: ListTile(
                          contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
                          leading: CircleAvatar(
                            backgroundColor: scheme.primaryContainer,
                            child: Icon(Icons.storefront, color: scheme.onPrimaryContainer),
                          ),
                          title: Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Expanded(
                                child: Text(
                                  storeName,
                                  style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15),
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ),
                              if (lastTimeStr.isNotEmpty)
                                Text(lastTimeStr, style: const TextStyle(fontSize: 11, color: Colors.grey)),
                            ],
                          ),
                          subtitle: Text(
                            lastMsgText,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(fontSize: 13, color: scheme.onSurfaceVariant),
                          ),
                          trailing: const Icon(Icons.chevron_right),
                          onTap: () {
                            final uri = productId != null
                                ? '/chat/$storeId?productId=$productId'
                                : '/chat/$storeId';
                            context.push(uri).then((_) => _fetchConversations());
                          },
                        ),
                      );
                    },
                  ),
                ),
    );
  }
}
