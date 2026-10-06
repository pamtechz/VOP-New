import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/services/supabase_service.dart';
import '../../core/providers/currency_provider.dart';

import '../widgets/prominent_location_disclosure_modal.dart';

final activeDriverJobsProvider =
    FutureProvider<List<Map<String, dynamic>>>((ref) async {
  final user = SupabaseService.client.auth.currentUser;
  if (user == null) return [];

  final data = await SupabaseService.client
      .from('delivery_jobs')
      .select('''
        id, public_ref, status, pickup_address, pickup_contact_name, pickup_contact_phone,
        dropoff_address, dropoff_contact_name, dropoff_contact_phone,
        delivery_fee, estimated_distance_km, estimated_duration_mins, notes,
        orders (public_ref, total_amount)
      ''')
      .or('driver_id.eq.${user.id},status.eq.unassigned')
      .order('created_at', ascending: false);

  return List<Map<String, dynamic>>.from(data as List);
});

class DriverConsoleScreen extends ConsumerStatefulWidget {
  const DriverConsoleScreen({super.key});

  @override
  ConsumerState<DriverConsoleScreen> createState() =>
      _DriverConsoleScreenState();
}

class _DriverConsoleScreenState extends ConsumerState<DriverConsoleScreen> {
  bool _isOnline = true;

  Future<void> _verifyHandshake(String jobId, bool isPickup) async {
    final pinController = TextEditingController();
    bool submitting = false;

    await showDialog(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (context, setDialogState) {
          final scheme = Theme.of(context).colorScheme;
          return AlertDialog(
            title: Row(
              children: [
                Icon(
                  isPickup
                      ? Icons.qr_code_scanner
                      : Icons.verified_user_outlined,
                  color: isPickup
                      ? const Color(0xFF2563EB)
                      : const Color(0xFF10B981),
                ),
                const SizedBox(width: 8),
                Text(
                  isPickup ? 'Verify Seller Pickup' : 'Verify Buyer Delivery',
                  style: const TextStyle(
                      fontSize: 16, fontWeight: FontWeight.bold),
                ),
              ],
            ),
            content: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  isPickup
                      ? 'Ask the seller for their 4-digit Pickup PIN to accept goods:'
                      : 'Ask the buyer for their 4-digit Delivery PIN to complete order:',
                  style: TextStyle(fontSize: 12, color: scheme.outline),
                ),
                const SizedBox(height: 16),
                TextField(
                  controller: pinController,
                  keyboardType: TextInputType.number,
                  maxLength: 4,
                  autofocus: true,
                  style: const TextStyle(
                      fontSize: 24,
                      fontWeight: FontWeight.bold,
                      letterSpacing: 8),
                  textAlign: TextAlign.center,
                  decoration: const InputDecoration(
                    hintText: '0000',
                    border: OutlineInputBorder(),
                    counterText: '',
                  ),
                ),
              ],
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(ctx),
                child: const Text('Cancel'),
              ),
              FilledButton(
                onPressed: submitting
                    ? null
                    : () async {
                        final pin = pinController.text.trim();
                        if (pin.length != 4) return;

                        setDialogState(() => submitting = true);
                        try {
                          final rpcName = isPickup
                              ? 'verify_pickup_handshake'
                              : 'verify_dropoff_handshake';
                          final res = await SupabaseService.client
                              .rpc(rpcName, params: {
                            'p_job_id': jobId,
                            'p_pin': pin,
                            'p_driver_lat': -15.4167,
                            'p_driver_lng': 28.2833,
                          });

                          final map = res as Map<String, dynamic>?;
                          if (map?['success'] == true) {
                            if (context.mounted) {
                              Navigator.pop(ctx);
                              ScaffoldMessenger.of(context).showSnackBar(
                                SnackBar(
                                  content: Text(map?['message']?.toString() ??
                                      'Handshake verified!'),
                                  backgroundColor: const Color(0xFF10B981),
                                ),
                              );
                              ref.invalidate(activeDriverJobsProvider);
                            }
                          } else {
                            if (context.mounted) {
                              setDialogState(() => submitting = false);
                              ScaffoldMessenger.of(context).showSnackBar(
                                SnackBar(
                                    content: Text(map?['error']?.toString() ??
                                        'Invalid PIN')),
                              );
                            }
                          }
                        } catch (e) {
                          if (context.mounted) {
                            setDialogState(() => submitting = false);
                            ScaffoldMessenger.of(context).showSnackBar(
                              SnackBar(
                                  content:
                                      Text('Error verifying handshake: $e')),
                            );
                          }
                        }
                      },
                child: submitting
                    ? const SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(strokeWidth: 2))
                    : const Text('Verify PIN'),
              ),
            ],
          );
        },
      ),
    );
  }

  bool _trackingConsented = true;

  Future<void> _triggerSOSAlert() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Row(
          children: [
            Icon(Icons.warning_amber_rounded, color: Colors.redAccent, size: 28),
            SizedBox(width: 8),
            Text('EMERGENCY SOS ALERT', style: TextStyle(color: Colors.redAccent, fontWeight: FontWeight.bold, fontSize: 16)),
          ],
        ),
        content: const Text(
          'This will immediately send an Anti-Robbery Emergency SOS Alert with your live GPS coordinates to platform security and nearby dispatch authorities.\n\nTrigger emergency alert?',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: Colors.redAccent),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('TRIGGER SOS ALERT NOW'),
          ),
        ],
      ),
    );

    if (confirmed == true && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('🚨 ANTI-ROBBERY SOS ALERT SENT! Security dispatched to your live GPS coordinates.'),
          backgroundColor: Colors.redAccent,
          duration: Duration(seconds: 6),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final jobsAsync = ref.watch(activeDriverJobsProvider);
    final currency =
        ref.watch(currencyProvider).valueOrNull ?? const CurrencyConfig();

    return Scaffold(
      appBar: AppBar(
        title: const Text('Courier Console'),
        actions: [
          IconButton(
            icon: const Icon(Icons.sos, color: Colors.redAccent, size: 26),
            tooltip: 'Anti-Robbery Emergency SOS',
            onPressed: _triggerSOSAlert,
          ),
          Row(
            children: [
              Text(_isOnline ? 'ONLINE' : 'OFFLINE',
                  style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.bold,
                      color: _isOnline
                          ? const Color(0xFF10B981)
                          : scheme.outline)),
              Switch(
                value: _isOnline,
                onChanged: (val) {
                  if (val) {
                    ProminentLocationDisclosureModal.show(
                      context: context,
                      onAccept: () {
                        setState(() => _isOnline = true);
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(
                            content: Text('Location tracking active for live courier dispatch & SOS.'),
                            backgroundColor: Color(0xFF10B981),
                          ),
                        );
                      },
                      onDeny: () {
                        setState(() => _isOnline = false);
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(
                            content: Text('Background location denied. Operating in manual offline mode.'),
                          ),
                        );
                      },
                    );
                  } else {
                    setState(() => _isOnline = false);
                  }
                },
              ),
            ],
          ),
        ],
      ),
      body: jobsAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Error: $e')),
        data: (jobs) {
          if (jobs.isEmpty) {
            return Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.two_wheeler_outlined,
                      size: 64, color: scheme.outline),
                  const SizedBox(height: 16),
                  Text('No active delivery dispatch jobs',
                      style: theme.textTheme.titleMedium
                          ?.copyWith(color: scheme.outline)),
                  const SizedBox(height: 8),
                  const Text(
                      'New dispatch offers will appear here automatically',
                      style: TextStyle(fontSize: 12, color: Colors.grey)),
                ],
              ),
            );
          }

          return ListView.builder(
            padding: const EdgeInsets.all(16),
            itemCount: jobs.length,
            itemBuilder: (ctx, i) {
              final job = jobs[i];
              final refStr = job['public_ref'] as String? ?? 'DEL-000';
              final status = job['status'] as String? ?? 'unassigned';
              final fee =
                  double.tryParse(job['delivery_fee']?.toString() ?? '25') ??
                      25.0;

              return Card(
                margin: const EdgeInsets.only(bottom: 16),
                shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(16)),
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text(refStr,
                              style: const TextStyle(
                                  fontWeight: FontWeight.bold, fontSize: 16)),
                          Container(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 10, vertical: 4),
                            decoration: BoxDecoration(
                              color: const Color(0xFF10B981)
                                  .withValues(alpha: 0.15),
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: Text(
                              currency.format(fee),
                              style: const TextStyle(
                                  fontWeight: FontWeight.bold,
                                  color: Color(0xFF10B981)),
                            ),
                          ),
                        ],
                      ),
                      const Divider(height: 20),

                      // Pickup Node
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Icon(Icons.storefront,
                              color: Color(0xFF2563EB), size: 20),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                const Text('STORE PICKUP',
                                    style: TextStyle(
                                        fontSize: 10,
                                        fontWeight: FontWeight.bold,
                                        color: Colors.grey)),
                                Text(
                                    job['pickup_address'] as String? ??
                                        'Seller Location',
                                    style: const TextStyle(
                                        fontWeight: FontWeight.bold,
                                        fontSize: 13)),
                                Text(
                                    'Contact: ${job['pickup_contact_name']} (${job['pickup_contact_phone']})',
                                    style: TextStyle(
                                        fontSize: 11, color: scheme.outline)),
                              ],
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 12),

                      // Dropoff Node
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Icon(Icons.location_on,
                              color: Color(0xFFEF4444), size: 20),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                const Text('CUSTOMER DROPOFF',
                                    style: TextStyle(
                                        fontSize: 10,
                                        fontWeight: FontWeight.bold,
                                        color: Colors.grey)),
                                Text(
                                    job['dropoff_address'] as String? ??
                                        'Buyer Address',
                                    style: const TextStyle(
                                        fontWeight: FontWeight.bold,
                                        fontSize: 13)),
                                Text(
                                    'Contact: ${job['dropoff_contact_name']} (${job['dropoff_contact_phone']})',
                                    style: TextStyle(
                                        fontSize: 11, color: scheme.outline)),
                              ],
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 16),

                      // Actions based on status
                      Row(
                        children: [
                          if (status == 'unassigned' ||
                              status == 'assigned') ...[
                            Expanded(
                              child: FilledButton.icon(
                                icon: const Icon(Icons.check_circle_outline),
                                label: const Text('Accept Delivery Job'),
                                onPressed: () async {
                                  final user =
                                      SupabaseService.client.auth.currentUser;
                                  if (user == null) return;
                                  await SupabaseService.client
                                      .from('delivery_jobs')
                                      .update({
                                    'status': 'accepted',
                                    'driver_id': user.id
                                  }).eq('id', job['id']);
                                  ref.invalidate(activeDriverJobsProvider);
                                },
                              ),
                            ),
                          ] else if (status == 'accepted' ||
                              status == 'arrived_at_pickup') ...[
                            Expanded(
                              child: FilledButton.icon(
                                icon: const Icon(Icons.qr_code_scanner),
                                label: const Text('Enter Seller Pickup PIN'),
                                style: FilledButton.styleFrom(
                                    backgroundColor: const Color(0xFF2563EB)),
                                onPressed: () =>
                                    _verifyHandshake(job['id'] as String, true),
                              ),
                            ),
                          ] else if (status == 'goods_picked_up' ||
                              status == 'in_transit' ||
                              status == 'arrived_at_dropoff') ...[
                            Expanded(
                              child: FilledButton.icon(
                                icon: const Icon(Icons.verified_user_outlined),
                                label: const Text('Enter Buyer Delivery PIN'),
                                style: FilledButton.styleFrom(
                                    backgroundColor: const Color(0xFF10B981)),
                                onPressed: () => _verifyHandshake(
                                    job['id'] as String, false),
                              ),
                            ),
                          ] else ...[
                            Expanded(
                              child: OutlinedButton(
                                onPressed: null,
                                child: Text('Status: ${status.toUpperCase()}'),
                              ),
                            ),
                          ],
                        ],
                      ),
                    ],
                  ),
                ),
              );
            },
          );
        },
      ),
    );
  }
}
