import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

/**
 * Google Play Compliant Prominent Location Disclosure Modal.
 * 
 * Mandatory Constraints Handled:
 * 1. Prominently features the word "Location".
 * 2. Explicitly states that data is collected "when the app is closed or not in use".
 * 3. Details valid core feature justification (Live Courier Dispatch & Anti-Robbery Emergency SOS).
 * 4. Provides affirmative "Accept & Continue" action.
 * 5. Provides graceful "Deny / No Thanks" action without locking out or crashing the user.
 * 6. Embeds persistent external Privacy Policy link.
 */
class ProminentLocationDisclosureModal extends StatelessWidget {
  final VoidCallback onAccept;
  final VoidCallback onDeny;

  const ProminentLocationDisclosureModal({
    super.key,
    required this.onAccept,
    required this.onDeny,
  });

  static Future<void> show({
    required BuildContext context,
    required VoidCallback onAccept,
    required VoidCallback onDeny,
  }) async {
    return showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (BuildContext ctx) {
        return ProminentLocationDisclosureModal(
          onAccept: () {
            Navigator.of(ctx).pop();
            onAccept();
          },
          onDeny: () {
            Navigator.of(ctx).pop();
            onDeny();
          },
        );
      },
    );
  }

  Future<void> _openPrivacyPolicy(BuildContext context) async {
    final uri = Uri.parse('https://pamtechz.com/privacy');
    try {
      if (await canLaunchUrl(uri)) {
        await launchUrl(uri, mode: LaunchMode.externalApplication);
      } else {
        if (context.mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Privacy Policy: https://pamtechz.com/privacy')),
          );
        }
      }
    } catch (_) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Privacy Policy: https://pamtechz.com/privacy')),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;

    return Dialog(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      backgroundColor: scheme.surface,
      insetPadding: const EdgeInsets.symmetric(horizontal: 24, vertical: 36),
      child: Padding(
        padding: const EdgeInsets.all(20.0),
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Header Icon & Title
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: scheme.primary.withOpacity(0.12),
                      shape: BoxShape.circle,
                    ),
                    child: Icon(Icons.my_location, color: scheme.primary, size: 28),
                  ),
                  const SizedBox(width: 14),
                  const Expanded(
                    child: Text(
                      'Background Location Permission Disclosure',
                      style: TextStyle(fontSize: 17, fontWeight: FontWeight.bold),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              const Divider(),
              const SizedBox(height: 12),

              // Mandatory Google Play Compliance Disclosure Text
              RichText(
                text: TextSpan(
                  style: TextStyle(color: scheme.onSurface, fontSize: 13.5, height: 1.45),
                  children: [
                    const TextSpan(
                      text: 'Pamtechz Marketplace collects ',
                    ),
                    TextSpan(
                      text: 'Location data ',
                      style: TextStyle(fontWeight: FontWeight.bold, color: scheme.primary),
                    ),
                    const TextSpan(
                      text: 'to enable real-time delivery order dispatch, vehicle route calculation, and ',
                    ),
                    TextSpan(
                      text: 'Anti-Robbery SOS Emergency Safety Alerts ',
                      style: TextStyle(fontWeight: FontWeight.bold, color: scheme.error),
                    ),
                    const TextSpan(
                      text: 'even when the app is closed or not in use.\n\n',
                    ),
                    const TextSpan(
                      text: 'Why Location Access is Required:\n',
                      style: TextStyle(fontWeight: FontWeight.bold),
                    ),
                    const TextSpan(
                      text: '• Order Assignment: Assign nearby orders to your registered vehicle (bicycle, motorbike, car/van, truck, delivery company).\n'
                            '• Customer Handshake: Calculate accurate distance for pickup and delivery PIN verification.\n'
                            '• Driver Safety: Trigger instant emergency panic alerts with precise GPS coordinates in case of robbery or breakdown.\n\n',
                    ),
                    const TextSpan(
                      text: 'Your location data is encrypted in transit and never sold to third parties.',
                    ),
                  ],
                ),
              ),

              const SizedBox(height: 16),

              // External Privacy Policy Link
              InkWell(
                onTap: () => _openPrivacyPolicy(context),
                borderRadius: BorderRadius.circular(6),
                child: Padding(
                  padding: const EdgeInsets.vertical(4.0),
                  child: Row(
                    children: [
                      Icon(Icons.privacy_tip_outlined, size: 16, color: scheme.primary),
                      const SizedBox(width: 6),
                      Text(
                        'Read our full Privacy Policy',
                        style: TextStyle(
                          fontSize: 12,
                          color: scheme.primary,
                          fontWeight: FontWeight.w600,
                          decoration: TextDecoration.underline,
                        ),
                      ),
                    ],
                  ),
                ),
              ),

              const SizedBox(height: 24),

              // Affirmative & Deny Action Buttons
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      style: OutlinedButton.styleFrom(
                        padding: const EdgeInsets.symmetric(vertical: 12),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                      ),
                      onPressed: onDeny,
                      child: const Text('No Thanks', style: TextStyle(fontSize: 13)),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: ElevatedButton(
                      style: ElevatedButton.styleFrom(
                        backgroundColor: scheme.primary,
                        foregroundColor: scheme.onPrimary,
                        padding: const EdgeInsets.symmetric(vertical: 12),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                      ),
                      onPressed: onAccept,
                      child: const Text('Accept & Continue', style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold)),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
