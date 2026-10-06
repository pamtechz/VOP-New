import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class AboutUsScreen extends ConsumerStatefulWidget {
  const AboutUsScreen({super.key});

  @override
  ConsumerState<AboutUsScreen> createState() => _AboutUsScreenState();
}

class _AboutUsScreenState extends ConsumerState<AboutUsScreen> {
  bool _isLoading = true;
  final Map<String, Map<String, String>> _policiesMap = {};

  final List<Map<String, String>> _policySections = [
    {
      'key': 'about_us',
      'title': 'About Us & Mission',
      'icon': 'info',
      'fallbackTitle': 'About Pamtechz Marketplace & Platform Mission',
      'fallbackContent':
          'Pamtechz Marketplace is an enterprise-grade multi-vendor platform empowering local merchants, buyers, and independent couriers. Our mission is to connect local commerce with verified escrow safety, multi-modal delivery networks, and transparent merchant tools.',
    },
    {
      'key': 'terms_of_service',
      'title': 'Terms of Service',
      'icon': 'gavel',
      'fallbackTitle': 'Terms of Service & User Conduct',
      'fallbackContent':
          'By accessing or operating a store on Pamtechz Marketplace, users agree to uphold fair trading standards, accurate product representations, prompt fulfillment, and respectful communication. Prohibited items, fraudulent listings, or unauthorized access will result in immediate account suspension.',
    },
    {
      'key': 'privacy_policy',
      'title': 'Privacy Policy',
      'icon': 'privacy',
      'fallbackTitle': 'Privacy Policy & Data Security Guarantee',
      'fallbackContent':
          'We respect user data privacy. Personal information, order histories, and payment credentials are encrypted using industry-standard protocols. Location data collected for delivery routing is strictly used for order fulfillment and anti-robbery emergency SOS safety.',
    },
    {
      'key': 'buyer_protection',
      'title': 'Buyer Guarantee',
      'icon': 'verified',
      'fallbackTitle': 'Buyer Protection & Escrow Guarantee Policy',
      'fallbackContent':
          'All marketplace payments are held securely in platform escrow. Merchant payouts are released only upon successful buyer OTP verification or automated expiration of the dispute window.',
    },
    {
      'key': 'delivery_logistics',
      'title': 'Delivery & Logistics',
      'icon': 'truck',
      'fallbackTitle': 'Local Delivery & Multi-Modal Logistics Policy',
      'fallbackContent':
          'Local fulfillment supports Bicycles (eco short-haul), Motorbikes (express), Vehicles & Vans (cargo), Heavy Freight Trucks, and Verified Delivery Companies. Handshake PINs (4-digit pickup PIN & 4-digit buyer delivery OTP) are required for all dispatches.',
    },
    {
      'key': 'driver_consent_safety',
      'title': 'Courier Safety & SOS',
      'icon': 'shield',
      'fallbackTitle': 'Courier Live Tracking Consent & Anti-Robbery SOS Policy',
      'fallbackContent':
          'Couriers explicitly consent to continuous GPS tracking while on active duty. Drivers have access to an instant Anti-Robbery Panic/SOS button that immediately alerts platform security and logs high-risk location coordinates.',
    },
    {
      'key': 'return_refund',
      'title': 'Returns & Refunds',
      'icon': 'replay',
      'fallbackTitle': 'Return & Refund Policy',
      'fallbackContent':
          'Buyers may initiate return requests within 7 days of delivery for items that are damaged or not as described. Funds remain in escrow until return inspection or admin dispute resolution.',
    },
  ];

  @override
  void initState() {
    super.initState();
    _loadLivePolicies();
  }

  Future<void> _loadLivePolicies() async {
    setState(() => _isLoading = true);
    try {
      final res = await Supabase.instance.client
          .from('platform_settings')
          .select('key, value')
          .like('key', 'policy_%');

      if (res != null && res is List) {
        for (final row in res) {
          final rawKey = row['key'] as String? ?? '';
          final k = rawKey.replaceFirst('policy_', '');
          final val = row['value'];
          if (val is Map) {
            _policiesMap[k] = {
              'title': val['title']?.toString() ?? '',
              'content': val['content']?.toString() ?? '',
              'updated_at': val['updated_at']?.toString() ?? '',
            };
          }
        }
      }
    } catch (_) {}

    if (mounted) {
      setState(() => _isLoading = false);
    }
  }

  IconData _getSectionIcon(String type) {
    switch (type) {
      case 'info':
        return Icons.info_outline;
      case 'gavel':
        return Icons.gavel_outlined;
      case 'privacy':
        return Icons.lock_outline;
      case 'verified':
        return Icons.verified_user_outlined;
      case 'truck':
        return Icons.local_shipping_outlined;
      case 'shield':
        return Icons.security_outlined;
      case 'replay':
        return Icons.assignment_return_outlined;
      default:
        return Icons.description_outlined;
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;

    return Scaffold(
      appBar: AppBar(
        title: const Text('About Us & Platform Information',
            style: TextStyle(fontWeight: FontWeight.bold, fontSize: 17)),
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _loadLivePolicies,
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  // Hero Header Card
                  Card(
                    color: scheme.surfaceContainerHigh,
                    shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(16)),
                    child: Padding(
                      padding: const EdgeInsets.all(20.0),
                      child: Column(
                        children: [
                          Container(
                            padding: const EdgeInsets.all(12),
                            decoration: BoxDecoration(
                              color: scheme.primary.withOpacity(0.12),
                              shape: BoxShape.circle,
                            ),
                            child: Icon(Icons.storefront,
                                size: 36, color: scheme.primary),
                          ),
                          const SizedBox(height: 12),
                          const Text(
                            'Pamtechz Marketplace',
                            style: TextStyle(
                                fontSize: 20, fontWeight: FontWeight.bold),
                          ),
                          const SizedBox(height: 4),
                          const Text(
                            'Verified Multi-Vendor Operating System',
                            style: TextStyle(fontSize: 12, color: Colors.grey),
                          ),
                        ],
                      ),
                    ),
                  ),

                  const SizedBox(height: 20),
                  const Text(
                    'PLATFORM POLICIES & GOVERNANCE',
                    style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.bold,
                        letterSpacing: 1.2,
                        color: Colors.grey),
                  ),
                  const SizedBox(height: 10),

                  // Policy Expansion Tiles
                  ..._policySections.map((sec) {
                    final key = sec['key']!;
                    final liveData = _policiesMap[key];
                    final title = (liveData?['title']?.isNotEmpty ?? false)
                        ? liveData!['title']!
                        : sec['fallbackTitle']!;
                    final content = (liveData?['content']?.isNotEmpty ?? false)
                        ? liveData!['content']!
                        : sec['fallbackContent']!;
                    final updatedAt = liveData?['updated_at'];

                    return Card(
                      margin: const EdgeInsets.only(bottom: 12),
                      shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12)),
                      child: ExpansionTile(
                        leading: Icon(_getSectionIcon(sec['icon']!),
                            color: scheme.primary),
                        title: Text(
                          sec['title']!,
                          style: const TextStyle(
                              fontWeight: FontWeight.bold, fontSize: 14),
                        ),
                        subtitle: Text(
                          title,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                              fontSize: 11, color: Colors.grey),
                        ),
                        children: [
                          Padding(
                            padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                const Divider(),
                                const SizedBox(height: 8),
                                Text(
                                  title,
                                  style: const TextStyle(
                                      fontWeight: FontWeight.bold,
                                      fontSize: 14),
                                ),
                                const SizedBox(height: 8),
                                Text(
                                  content,
                                  style: TextStyle(
                                      fontSize: 13,
                                      height: 1.45,
                                      color: scheme.onSurfaceVariant),
                                ),
                                if (updatedAt != null && updatedAt.isNotEmpty) ...[
                                  const SizedBox(height: 12),
                                  Text(
                                    'Admin Updated: ${updatedAt.substring(0, 10)}',
                                    style: const TextStyle(
                                        fontSize: 10,
                                        fontStyle: FontStyle.italic,
                                        color: Colors.grey),
                                  ),
                                ],
                              ],
                            ),
                          ),
                        ],
                      ),
                    );
                  }),
                ],
              ),
            ),
    );
  }
}
