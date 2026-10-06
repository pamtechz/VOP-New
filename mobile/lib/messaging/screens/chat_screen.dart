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
  Map<String, dynamic>? _attachedProduct;
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
          .select('id, product_id')
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
            .select('id, product_id')
            .single();
      }

      _conversationId = conv['id'] as String;
      final targetProductId = widget.productId ?? conv['product_id'];

      // 3. Fetch product details if attached
      if (targetProductId != null) {
        final prod = await SupabaseService.client
            .from('products')
            .select('id, title, price, primary_image_url')
            .eq('id', targetProductId)
            .maybeSingle();
        if (prod != null) {
          _attachedProduct = Map<String, dynamic>.from(prod);
        }
      }

      // 4. Load historical messages
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

      // 5. Realtime channel subscription
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

  Future<void> _editMessage(Map<String, dynamic> msg) async {
    final msgId = msg['id'] as String;
    final currentContent = msg['content'] as String? ?? '';
    final controller = TextEditingController(text: currentContent);

    final updatedText = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Edit Message', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
        content: TextField(
          controller: controller,
          autofocus: true,
          decoration: const InputDecoration(border: OutlineInputBorder(), hintText: 'Enter updated message'),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
          ElevatedButton(onPressed: () => Navigator.pop(ctx, controller.text.trim()), child: const Text('Save')),
        ],
      ),
    );

    if (updatedText != null && updatedText.isNotEmpty && updatedText != currentContent) {
      try {
        await SupabaseService.client
            .from('messages')
            .update({'content': updatedText, 'is_edited': true})
            .eq('id', msgId);

        if (mounted) {
          setState(() {
            final idx = _messages.indexWhere((m) => m['id'] == msgId);
            if (idx != -1) {
              _messages[idx]['content'] = updatedText;
              _messages[idx]['is_edited'] = true;
            }
          });
        }
      } catch (e) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Failed to edit message: $e'), backgroundColor: Colors.red),
          );
        }
      }
    }
  }

  Future<void> _sendMessage([String? prefilledText]) async {
    final text = prefilledText ?? _messageController.text.trim();
    if (text.isEmpty || _isSending) return;

    final user = Supabase.instance.client.auth.currentUser;
    if (user == null || _conversationId == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please sign in to send messages')),
      );
      return;
    }

    setState(() => _isSending = true);
    if (prefilledText == null) _messageController.clear();

    try {
      final inserted = await SupabaseService.client
          .from('messages')
          .insert({
            'conversation_id': _conversationId,
            'sender_id': user.id,
            'content': text,
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
            const Text('Official Marketplace Support & Chat', style: TextStyle(fontSize: 11, color: Colors.grey)),
          ],
        ),
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : Column(
              children: [
                // Pinned Attached Product Card Banner
                if (_attachedProduct != null)
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                    color: scheme.surfaceContainerHigh,
                    child: Row(
                      children: [
                        ClipRRect(
                          borderRadius: BorderRadius.circular(8),
                          child: Container(
                            width: 44,
                            height: 44,
                            color: scheme.surfaceContainerHighest,
                            child: _attachedProduct!['primary_image_url'] != null
                                ? Image.network(_attachedProduct!['primary_image_url'], fit: BoxFit.cover)
                                : Icon(Icons.shopping_bag, color: scheme.primary, size: 24),
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                _attachedProduct!['title'] ?? 'Attached Product',
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13),
                              ),
                              Text(
                                '\$${_attachedProduct!['price'] ?? '0.00'}',
                                style: TextStyle(color: scheme.primary, fontWeight: FontWeight.w600, fontSize: 12),
                              ),
                            ],
                          ),
                        ),
                        ElevatedButton.icon(
                          style: ElevatedButton.styleFrom(
                            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                            visualDensity: VisualDensity.compact,
                          ),
                          icon: const Icon(Icons.send, size: 14),
                          label: const Text('Inquire', style: TextStyle(fontSize: 12)),
                          onPressed: () {
                            final title = _attachedProduct!['title'] ?? 'Product';
                            _sendMessage('Hi! Is "$title" available for purchase?');
                          },
                        ),
                      ],
                    ),
                  ),

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

                            final isEdited = msg['is_edited'] == true;

                            return Align(
                              alignment: isMe ? Alignment.centerRight : Alignment.centerLeft,
                              child: GestureDetector(
                                onLongPress: isMe ? () => _editMessage(msg) : null,
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
                                      const SizedBox(height: 4),
                                      Row(
                                        mainAxisSize: MainAxisSize.min,
                                        children: [
                                          if (isEdited) ...[
                                            Text(
                                              '(edited) ',
                                              style: TextStyle(
                                                color: isMe ? scheme.onPrimary.withOpacity(0.7) : Colors.grey,
                                                fontSize: 10,
                                                fontStyle: FontStyle.italic,
                                              ),
                                            ),
                                          ],
                                          if (timeStr.isNotEmpty)
                                            Text(
                                              timeStr,
                                              style: TextStyle(
                                                color: isMe ? scheme.onPrimary.withOpacity(0.7) : Colors.grey,
                                                fontSize: 10,
                                              ),
                                            ),
                                        ],
                                      ),
                                    ],
                                  ),
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
                          onPressed: _isSending ? null : () => _sendMessage(),
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
