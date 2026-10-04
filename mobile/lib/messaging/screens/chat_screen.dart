import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../../core/services/supabase_service.dart';

final chatMessagesProvider =
    FutureProvider.family<List<Map<String, dynamic>>, String>((ref, storeId) async {
  final user = Supabase.instance.client.auth.currentUser;
  if (user == null) return [];

  // Find conversation
  final conv = await SupabaseService.client
      .from('conversations')
      .select('id')
      .eq('buyer_id', user.id)
      .eq('store_id', storeId)
      .maybeSingle();

  if (conv == null) return [];

  final data = await SupabaseService.client
      .from('messages')
      .select('*')
      .eq('conversation_id', conv['id'])
      .order('created_at', ascending: true);

  return List<Map<String, dynamic>>.from(data as List);
});

class ChatScreen extends ConsumerStatefulWidget {
  final String storeId;
  final String? productId;
  final String? orderId;

  const ChatScreen({
    super.key,
    required this.storeId,
    this.productId,
    this.orderId,
  });

  @override
  ConsumerState<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends ConsumerState<ChatScreen> {
  final TextEditingController _messageController = TextEditingController();
  final List<Map<String, dynamic>> _localMessages = [];

  @override
  void dispose() {
    _messageController.dispose();
    super.dispose();
  }

  void _sendMessage() {
    final text = _messageController.text.trim();
    if (text.isEmpty) return;

    setState(() {
      _localMessages.add({
        'id': 'local-${DateTime.now().millisecondsSinceEpoch}',
        'sender_id': 'me',
        'content': text,
        'created_at': DateTime.now().toIso8601String(),
      });
      _messageController.clear();
    });
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final messagesAsync = ref.watch(chatMessagesProvider(widget.storeId));
    final currentUser = Supabase.instance.client.auth.currentUser;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Store Chat & Support'),
      ),
      body: Column(
        children: [
          Expanded(
            child: messagesAsync.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (e, _) => Center(child: Text('Error: $e')),
              data: (serverMessages) {
                final all = [...serverMessages, ..._localMessages];

                if (all.isEmpty) {
                  return Center(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.chat_bubble_outline, size: 48, color: scheme.outline),
                        const SizedBox(height: 12),
                        const Text('Start a conversation with this merchant.'),
                      ],
                    ),
                  );
                }

                return ListView.builder(
                  padding: const EdgeInsets.all(16),
                  itemCount: all.length,
                  itemBuilder: (context, index) {
                    final msg = all[index];
                    final isMe = msg['sender_id'] == currentUser?.id || msg['sender_id'] == 'me';

                    return Align(
                      alignment: isMe ? Alignment.centerRight : Alignment.centerLeft,
                      child: Container(
                        margin: const EdgeInsets.symmetric(vertical: 4),
                        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                        decoration: BoxDecoration(
                          color: isMe ? scheme.primary : scheme.surfaceVariant,
                          borderRadius: BorderRadius.circular(16).copyWith(
                            bottomRight: isMe ? const Radius.circular(0) : const Radius.circular(16),
                            bottomLeft: !isMe ? const Radius.circular(0) : const Radius.circular(16),
                          ),
                        ),
                        child: Text(
                          msg['content'] as String? ?? '',
                          style: TextStyle(
                            color: isMe ? scheme.onPrimary : scheme.onSurfaceVariant,
                          ),
                        ),
                      ),
                    );
                  },
                );
              },
            ),
          ),
          Container(
            padding: const EdgeInsets.all(8.0),
            decoration: BoxDecoration(
              color: scheme.surface,
              border: Border(top: BorderSide(color: scheme.outlineVariant)),
            ),
            child: SafeArea(
              child: Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _messageController,
                      decoration: const InputDecoration(
                        hintText: 'Type your message...',
                        border: InputBorder.none,
                        contentPadding: EdgeInsets.symmetric(horizontal: 12),
                      ),
                      onSubmitted: (_) => _sendMessage(),
                    ),
                  ),
                  IconButton(
                    icon: Icon(Icons.send, color: scheme.primary),
                    onPressed: _sendMessage,
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
