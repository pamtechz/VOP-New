import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../../core/services/supabase_service.dart';

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
  final ScrollController _scrollController = ScrollController();
  final List<Map<String, dynamic>> _messages = [];
  
  String? _conversationId;
  String _storeName = 'Store Support';
  bool _isLoading = true;
  bool _isSending = false;
  RealtimeChannel? _realtimeChannel;

  @override
  void initState() {
    super.initState();
    _initializeChat();
  }

  Future<void> _initializeChat() async {
    final user = Supabase.instance.client.auth.currentUser;
    if (user == null) {
      if (mounted) setState(() => _isLoading = false);
      return;
    }

    try {
      // 1. Fetch store name for app bar
      final store = await SupabaseService.client
          .from('stores')
          .select('name')
          .eq('id', widget.storeId)
          .maybeSingle();

      if (store != null && mounted) {
        _storeName = store['name'] as String? ?? 'Store Support';
      }

      // 2. Find or create conversation
      var conv = await SupabaseService.client
          .from('conversations')
          .select('id')
          .eq('buyer_id', user.id)
          .eq('store_id', widget.storeId)
          .maybeSingle();

      if (conv == null) {
        conv = await SupabaseService.client
            .from('conversations')
            .insert({
              'buyer_id': user.id,
              'store_id': widget.storeId,
              'product_id': widget.productId,
              'order_id': widget.orderId,
            })
            .select('id')
            .single();
      }

      _conversationId = conv['id'] as String;

      // 3. Load historical messages (paginated latest 50)
      final history = await SupabaseService.client
          .from('messages')
          .select('*')
          .eq('conversation_id', _conversationId!)
          .order('created_at', ascending: true)
          .limit(50);

      if (mounted) {
        setState(() {
          _messages.clear();
          _messages.addAll(List<Map<String, dynamic>>.from(history as List));
          _isLoading = false;
        });
        _scrollToBottom();
      }

      // 4. Subscribe to Realtime channel for this specific conversation only
      _realtimeChannel = SupabaseService.subscribeToConversation(
        conversationId: _conversationId!,
        onNewMessage: (msg) {
          if (!mounted) return;
          final msgId = msg['id'];
          final exists = _messages.any((m) => m['id'] == msgId);
          if (!exists) {
            setState(() {
              _messages.add(msg);
            });
            _scrollToBottom();
          }
        },
      );
    } catch (e) {
      if (mounted) {
        setState(() => _isLoading = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to load chat: $e'), backgroundColor: Colors.redAccent),
        );
      }
    }
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scrollController.hasClients) {
        _scrollController.animateTo(
          _scrollController.position.maxScrollExtent,
          duration: const Duration(milliseconds: 250),
          curve: Curves.easeOut,
        );
      }
    });
  }

  @override
  void dispose() {
    _realtimeChannel?.unsubscribe();
    _messageController.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  Future<void> _sendMessage() async {
    final text = _messageController.text.trim();
    if (text.isEmpty || _isSending) return;

    final user = Supabase.instance.client.auth.currentUser;
    if (user == null || _conversationId == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please sign in to send messages')),
      );
      return;
    }

    setState(() => _isSending = true);
    _messageController.clear();

    try {
      final inserted = await SupabaseService.client
          .from('messages')
          .insert({
            'conversation_id': _conversationId,
            'sender_id': user.id,
            'content': text,
            'attachment_url_type': 'none',
            'skip_broadcast': false,
          })
          .select()
          .single();

      // Update conversation last updated timestamp
      await SupabaseService.client
          .from('conversations')
          .update({'updated_at': DateTime.now().toIso8601String()})
          .eq('id', _conversationId!);

      if (mounted) {
        final exists = _messages.any((m) => m['id'] == inserted['id']);
        if (!exists) {
          setState(() {
            _messages.add(inserted);
          });
          _scrollToBottom();
        }
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to send message: $e'), backgroundColor: Colors.redAccent),
        );
      }
    } finally {
      if (mounted) setState(() => _isSending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final currentUser = Supabase.instance.client.auth.currentUser;

    return Scaffold(
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(_storeName, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
            const Text('Official Store Messaging', style: TextStyle(fontSize: 11, color: Colors.grey)),
          ],
        ),
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : Column(
              children: [
                Expanded(
                  child: _messages.isEmpty
                      ? Center(
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(Icons.chat_bubble_outline, size: 48, color: scheme.outline),
                              const SizedBox(height: 12),
                              const Text('Start a conversation with this merchant.'),
                              const SizedBox(height: 4),
                              const Text(
                                'Ask questions about products, availability, or delivery.',
                                style: TextStyle(fontSize: 12, color: Colors.grey),
                              ),
                            ],
                          ),
                        )
                      : ListView.builder(
                          controller: _scrollController,
                          padding: const EdgeInsets.all(16),
                          itemCount: _messages.length,
                          itemBuilder: (context, index) {
                            final msg = _messages[index];
                            final isMe = msg['sender_id'] == currentUser?.id;
                            final createdAt = msg['created_at'] != null
                                ? DateTime.parse(msg['created_at']).toLocal()
                                : null;
                            final timeStr = createdAt != null
                                ? '${createdAt.hour.toString().padLeft(2, '0')}:${createdAt.minute.toString().padLeft(2, '0')}'
                                : '';

                            return Align(
                              alignment: isMe ? Alignment.centerRight : Alignment.centerLeft,
                              child: Container(
                                margin: const EdgeInsets.symmetric(vertical: 4),
                                constraints: BoxConstraints(
                                  maxWidth: MediaQuery.of(context).size.width * 0.75,
                                ),
                                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                                decoration: BoxDecoration(
                                  color: isMe ? scheme.primary : scheme.surfaceContainerHighest,
                                  borderRadius: BorderRadius.circular(16).copyWith(
                                    bottomRight: isMe ? const Radius.circular(0) : const Radius.circular(16),
                                    bottomLeft: !isMe ? const Radius.circular(0) : const Radius.circular(16),
                                  ),
                                ),
                                child: Column(
                                  crossAxisAlignment: isMe ? CrossAxisAlignment.end : CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      msg['content'] as String? ?? '',
                                      style: TextStyle(
                                        color: isMe ? scheme.onPrimary : scheme.onSurfaceVariant,
                                        fontSize: 14,
                                      ),
                                    ),
                                    if (timeStr.isNotEmpty) ...[
                                      const SizedBox(height: 4),
                                      Text(
                                        timeStr,
                                        style: TextStyle(
                                          color: isMe ? scheme.onPrimary.withOpacity(0.7) : Colors.grey,
                                          fontSize: 10,
                                        ),
                                      ),
                                    ],
                                  ],
                                ),
                              ),
                            );
                          },
                        ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12.0, vertical: 8.0),
                  decoration: BoxDecoration(
                    color: scheme.surface,
                    border: Border(top: BorderSide(color: scheme.outlineVariant.withOpacity(0.5))),
                  ),
                  child: SafeArea(
                    child: Row(
                      children: [
                        Expanded(
                          child: TextField(
                            controller: _messageController,
                            textCapitalization: TextCapitalization.sentences,
                            decoration: const InputDecoration(
                              hintText: 'Type your message...',
                              border: InputBorder.none,
                              contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                            ),
                            onSubmitted: (_) => _sendMessage(),
                          ),
                        ),
                        IconButton(
                          icon: _isSending
                              ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
                              : Icon(Icons.send, color: scheme.primary),
                          onPressed: _isSending ? null : _sendMessage,
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
