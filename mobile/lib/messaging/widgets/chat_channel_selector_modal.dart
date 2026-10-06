import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

/**
 * Google Play Compliant Chat & Channel Selector Modal.
 * 
 * Features:
 * 1. Product tagging in both In-App Chat and WhatsApp.
 * 2. In-App Verified Secure Chat vs. WhatsApp Direct Chat options.
 * 3. Mandatory Terms & Conditions / Privacy Policy Agreement Checkbox.
 * 4. Google Custom Tabs in-app browser launcher for policy links.
 */
class ChatChannelSelectorModal extends StatefulWidget {
  final String storeId;
  final String? storeName;
  final String? storePhone;
  final String? productId;
  final String? productTitle;
  final double? productPrice;

  const ChatChannelSelectorModal({
    super.key,
    required this.storeId,
    this.storeName,
    this.storePhone,
    this.productId,
    this.productTitle,
    this.productPrice,
  });

  static Future<void> show({
    required BuildContext context,
    required String storeId,
    String? storeName,
    String? storePhone,
    String? productId,
    String? productTitle,
    double? productPrice,
  }) async {
    return showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => ChatChannelSelectorModal(
        storeId: storeId,
        storeName: storeName,
        storePhone: storePhone,
        productId: productId,
        productTitle: productTitle,
        productPrice: productPrice,
      ),
    );
  }

  @override
  State<ChatChannelSelectorModal> createState() => _ChatChannelSelectorModalState();
}

class _ChatChannelSelectorModalState extends State<ChatChannelSelectorModal> {
  bool _agreedToTerms = true;

  Future<void> _launchCustomTab(String url) async {
    final uri = Uri.parse(url);
    try {
      if (await canLaunchUrl(uri)) {
        await launchUrl(
          uri,
          mode: LaunchMode.inAppBrowserView, // Uses Google Custom Tabs on Android
        );
      } else {
        if (mounted) context.push('/about');
      }
    } catch (_) {
      if (mounted) context.push('/about');
    }
  }

  Future<void> _openWhatsApp() async {
    if (!_agreedToTerms) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please agree to the Terms & Privacy Policy to continue.')),
      );
      return;
    }

    final phone = widget.storePhone?.replaceAll(RegExp(r'[^0-9+]'), '') ?? '';
    final title = widget.productTitle ?? 'Product';
    final priceStr = widget.productPrice != null ? ' (\$${widget.productPrice!.toStringAsFixed(2)})' : '';
    final prodUrl = widget.productId != null ? ' https://pamtechz.com/products/${widget.productId}' : '';
    final message = Uri.encodeComponent('Hi! I am inquiring about "$title"$priceStr on Pamtechz Marketplace.$prodUrl');

    final whatsappUrl = phone.isNotEmpty
        ? 'https://wa.me/$phone?text=$message'
        : 'https://wa.me/?text=$message';

    final uri = Uri.parse(whatsappUrl);
    try {
      if (await canLaunchUrl(uri)) {
        Navigator.pop(context);
        await launchUrl(uri, mode: LaunchMode.externalApplication);
      } else {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('WhatsApp application is not installed on this device.')),
          );
        }
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Could not open WhatsApp: $e')),
        );
      }
    }
  }

  void _openInAppChat() {
    if (!_agreedToTerms) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please agree to the Terms & Privacy Policy to continue.')),
      );
      return;
    }

    Navigator.pop(context);
    final route = widget.productId != null
        ? '/chat/${widget.storeId}?productId=${widget.productId}'
        : '/chat/${widget.storeId}';
    context.push(route);
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;

    return Padding(
      padding: EdgeInsets.only(
        left: 20,
        right: 20,
        top: 20,
        bottom: MediaQuery.of(context).viewInsets.bottom + 24,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Drag Handle
          Center(
            child: Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: scheme.outlineVariant,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),
          const SizedBox(height: 16),

          // Header
          Row(
            children: [
              Icon(Icons.forum_outlined, color: scheme.primary, size: 24),
              const SizedBox(width: 10),
              Text(
                'Contact ${widget.storeName ?? "Seller"}',
                style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            'Select your preferred messaging channel to inquire about this listing.',
            style: TextStyle(fontSize: 12, color: scheme.onSurfaceVariant),
          ),
          const SizedBox(height: 14),

          // Attached Tagged Product Preview Box
          if (widget.productTitle != null)
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: scheme.surfaceContainerHigh,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: scheme.primary.withOpacity(0.2)),
              ),
              child: Row(
                children: [
                  Icon(Icons.shopping_bag_outlined, color: scheme.primary, size: 22),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Tagged Product:',
                          style: TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: scheme.primary),
                        ),
                        Text(
                          widget.productTitle!,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13),
                        ),
                      ],
                    ),
                  ),
                  if (widget.productPrice != null)
                    Text(
                      '\$${widget.productPrice!.toStringAsFixed(2)}',
                      style: TextStyle(fontWeight: FontWeight.bold, color: scheme.primary, fontSize: 13),
                    ),
                ],
              ),
            ),

          const SizedBox(height: 16),

          // Channel Buttons
          ListTile(
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            tileColor: scheme.surfaceContainerHighest,
            leading: CircleAvatar(
              backgroundColor: scheme.primary,
              child: const Icon(Icons.chat, color: Colors.white, size: 20),
            ),
            title: const Text('In-App Verified Secure Chat', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
            subtitle: const Text('Direct encrypted message with product card attached', style: TextStyle(fontSize: 11)),
            trailing: const Icon(Icons.chevron_right),
            onTap: _openInAppChat,
          ),
          const SizedBox(height: 10),

          ListTile(
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            tileColor: const Color(0xFF25D366).withOpacity(0.12),
            leading: const CircleAvatar(
              backgroundColor: Color(0xFF25D366),
              child: Icon(Icons.phone_android, color: Colors.white, size: 20),
            ),
            title: const Text('WhatsApp Direct Messaging', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
            subtitle: const Text('Chat instantly on WhatsApp with prefilled product link', style: TextStyle(fontSize: 11)),
            trailing: const Icon(Icons.chevron_right),
            onTap: _openWhatsApp,
          ),

          const SizedBox(height: 16),

          // Mandatory Terms & Conditions Checkbox with Google Custom Tabs Links
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Checkbox(
                value: _agreedToTerms,
                onChanged: (val) {
                  if (val != null) setState(() => _agreedToTerms = val);
                },
              ),
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.only(top: 8.0),
                  child: Wrap(
                    children: [
                      const Text(
                        'I agree to the ',
                        style: TextStyle(fontSize: 11.5, color: Colors.grey),
                      ),
                      GestureDetector(
                        onTap: () => _launchCustomTab('https://pamtechz.com/policies'),
                        child: Text(
                          'Terms of Service',
                          style: TextStyle(
                            fontSize: 11.5,
                            color: scheme.primary,
                            fontWeight: FontWeight.bold,
                            decoration: TextDecoration.underline,
                          ),
                        ),
                      ),
                      const Text(
                        ' and ',
                        style: TextStyle(fontSize: 11.5, color: Colors.grey),
                      ),
                      GestureDetector(
                        onTap: () => _launchCustomTab('https://pamtechz.com/about'),
                        child: Text(
                          'Privacy Policy',
                          style: TextStyle(
                            fontSize: 11.5,
                            color: scheme.primary,
                            fontWeight: FontWeight.bold,
                            decoration: TextDecoration.underline,
                          ),
                        ),
                      ),
                      const Text(
                        ' on public web.',
                        style: TextStyle(fontSize: 11.5, color: Colors.grey),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
