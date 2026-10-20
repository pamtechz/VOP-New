import 'package:flutter/material.dart';
import '../core/vop_api.dart';
import '../theme/vop_theme.dart';
import '../widgets/vop_ui.dart';

class PlansManagementScreen extends StatefulWidget {
  const PlansManagementScreen({required this.api, this.organizationId, super.key});
  final VopApi api;
  final String? organizationId;

  @override
  State<PlansManagementScreen> createState() => _PlansManagementScreenState();
}

class _PlansManagementScreenState extends State<PlansManagementScreen> {
  late Future<Map<String, dynamic>> _subscriptionFuture;
  late Future<Map<String, dynamic>> _plansFuture;

  @override
  void initState() {
    super.initState();
    _reload();
  }

  void _reload() {
    setState(() {
      _subscriptionFuture = widget.api.adminSubscription(organizationId: widget.organizationId);
      _plansFuture = widget.api.adminPlans(organizationId: widget.organizationId);
    });
  }

  void _openCreatePlanDialog() {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => _CreatePlanSheet(
        api: widget.api,
        onCreated: _reload,
      ),
    );
  }

  Future<void> _activateFreePlan(String planId) async {
    final orgId = widget.organizationId;
    if (orgId == null || orgId.isEmpty) return;
    try {
      await widget.api.adminActivateFreePlan(planId: planId, organizationId: orgId);
      if (mounted) {
        _reload();
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Free subscription package activated successfully.')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Activation error: $e'), backgroundColor: Colors.red),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Subscriptions & Institutional Plans', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 18)),
        actions: [
          IconButton(
            tooltip: 'Refresh plans',
            icon: const Icon(Icons.refresh_rounded),
            onPressed: _reload,
          ),
          const SizedBox(width: 6),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        backgroundColor: VopColors.gold,
        foregroundColor: VopColors.navyDeep,
        icon: const Icon(Icons.add_card),
        label: const Text('New Plan Tier', style: TextStyle(fontWeight: FontWeight.w800)),
        onPressed: _openCreatePlanDialog,
      ),
      body: RefreshIndicator(
        onRefresh: () async => _reload(),
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            _buildCurrentSubscriptionSection(),
            const SizedBox(height: 20),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text(
                  'AVAILABLE INSTITUTIONAL TIERS',
                  style: TextStyle(
                    color: VopColors.gold,
                    fontWeight: FontWeight.w800,
                    fontSize: 11,
                    letterSpacing: 1.3,
                  ),
                ),
                TextButton.icon(
                  icon: const Icon(Icons.add, size: 16),
                  label: const Text('Add Tier', style: TextStyle(fontSize: 12)),
                  onPressed: _openCreatePlanDialog,
                ),
              ],
            ),
            const SizedBox(height: 4),
            const Text(
              'Live database-configured subscription packages with seat quotas and capability access.',
              style: TextStyle(fontSize: 12.5, color: Colors.grey),
            ),
            const SizedBox(height: 14),
            _buildAvailablePlansSection(),
            const SizedBox(height: 60),
          ],
        ),
      ),
    );
  }

  Widget _buildCurrentSubscriptionSection() {
    return FutureBuilder<Map<String, dynamic>>(
      future: _subscriptionFuture,
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const Center(child: Padding(
            padding: EdgeInsets.all(24),
            child: CircularProgressIndicator(),
          ));
        }
        if (snapshot.hasError) {
          return VopCard(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Row(
                children: [
                  const Icon(Icons.warning_amber_rounded, color: Colors.amber),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text('Subscription status: ${snapshot.error}', style: const TextStyle(fontSize: 12.5)),
                  ),
                  TextButton(onPressed: _reload, child: const Text('Retry')),
                ],
              ),
            ),
          );
        }

        final data = snapshot.data ?? {};
        final subscription = data['subscription'] is Map ? data['subscription'] as Map<String, dynamic> : <String, dynamic>{};
        final snapshotPlan = subscription['planSnapshot'] is Map ? subscription['planSnapshot'] as Map<String, dynamic> : <String, dynamic>{};
        final planName = (subscription['planName'] ?? snapshotPlan['name'] ?? data['plan'] ?? 'Institutional Tier').toString();
        final rawStatus = (subscription['status'] ?? (data['freeTier'] == true ? 'Free' : (data['paidPlanActive'] == true ? 'Active' : 'Unsubscribed'))).toString();
        final status = rawStatus.toUpperCase();
        final isHealthy = status == 'ACTIVE' || status == 'FREE';

        final usage = data['usage'] is Map ? data['usage'] as Map<String, dynamic> : <String, dynamic>{};
        final quotas = data['quotas'] is Map
            ? data['quotas'] as Map<String, dynamic>
            : (snapshotPlan['quotas'] is Map ? snapshotPlan['quotas'] as Map<String, dynamic> : <String, dynamic>{});

        final learnersCount = usage['learners'] ?? usage['candidates'] ?? 0;
        final maxLearners = quotas['maxLearners'] ?? 'Unlimited';
        final mentorsCount = usage['mentors'] ?? 0;
        final maxMentors = quotas['maxMentors'] ?? 'Unlimited';
        final certsCount = usage['certificates'] ?? 0;
        final maxCerts = quotas['maxCertificates'] ?? 'Included';

        return Container(
          padding: const EdgeInsets.all(18),
          decoration: BoxDecoration(
            gradient: const LinearGradient(
              colors: [VopColors.navyDeep, VopColors.navyBright],
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
            ),
            borderRadius: BorderRadius.circular(16),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withAlpha(40),
                blurRadius: 10,
                offset: const Offset(0, 4),
              ),
            ],
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                    decoration: BoxDecoration(
                      color: isHealthy ? VopColors.gold.withAlpha(45) : Colors.red.withAlpha(60),
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: Text(
                      'STATUS: $status',
                      style: TextStyle(
                        color: isHealthy ? VopColors.goldLight : Colors.white,
                        fontWeight: FontWeight.w800,
                        fontSize: 10,
                        letterSpacing: 1.1,
                      ),
                    ),
                  ),
                  Icon(
                    isHealthy ? Icons.verified : Icons.info_outline,
                    color: isHealthy ? VopColors.goldLight : Colors.amber,
                    size: 20,
                  ),
                ],
              ),
              const SizedBox(height: 12),
              Text(
                planName,
                style: const TextStyle(color: Colors.white, fontSize: 19, fontWeight: FontWeight.w900),
              ),
              const SizedBox(height: 4),
              Text(
                widget.organizationId != null && widget.organizationId!.isNotEmpty
                    ? 'Subscription record for organisation ID: ${widget.organizationId}'
                    : 'Voice of Prophecy Platform Administration Suite',
                style: const TextStyle(color: Color(0xFFC7DCFA), fontSize: 12.5),
              ),
              const SizedBox(height: 14),
              const Divider(color: Colors.white24, height: 1),
              const SizedBox(height: 12),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  _usageItem('Learners', '$learnersCount', '/ $maxLearners'),
                  _usageItem('Mentors', '$mentorsCount', '/ $maxMentors'),
                  _usageItem('Certificates', '$certsCount', '/ $maxCerts'),
                ],
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _usageItem(String label, String current, String max) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: const TextStyle(color: Color(0xFFC7DCFA), fontSize: 11)),
        const SizedBox(height: 2),
        RichText(
          text: TextSpan(
            children: [
              TextSpan(text: current, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w900, fontSize: 15)),
              TextSpan(text: ' $max', style: const TextStyle(color: Color(0xFF90B5E8), fontSize: 11.5)),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildAvailablePlansSection() {
    return FutureBuilder<Map<String, dynamic>>(
      future: _plansFuture,
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const Center(child: Padding(
            padding: EdgeInsets.all(24),
            child: CircularProgressIndicator(),
          ));
        }
        if (snapshot.hasError) {
          return Center(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(Icons.error_outline, color: Colors.amber, size: 40),
                  const SizedBox(height: 12),
                  Text('Failed to query subscription plans from database:\n${snapshot.error}',
                      textAlign: TextAlign.center, style: const TextStyle(fontSize: 12.5)),
                  const SizedBox(height: 12),
                  ElevatedButton(onPressed: _reload, child: const Text('Retry')),
                ],
              ),
            ),
          );
        }

        final rawList = snapshot.data?['items'] as List? ?? [];
        final plans = rawList.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();

        if (plans.isEmpty) {
          return Center(
            child: Padding(
              padding: const EdgeInsets.all(32),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(Icons.payments_outlined, size: 48, color: Colors.grey),
                  const SizedBox(height: 12),
                  const Text('No subscription tiers configured in database.',
                      style: TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
                  const SizedBox(height: 6),
                  const Text(
                    'Create institutional tiers with quotas and pricing directly in Firestore.',
                    textAlign: TextAlign.center,
                    style: TextStyle(fontSize: 12.5, color: Colors.grey),
                  ),
                  const SizedBox(height: 16),
                  ElevatedButton.icon(
                    style: ElevatedButton.styleFrom(
                      backgroundColor: VopColors.gold,
                      foregroundColor: VopColors.navyDeep,
                    ),
                    icon: const Icon(Icons.add),
                    label: const Text('Create Plan in Database', style: TextStyle(fontWeight: FontWeight.w800)),
                    onPressed: _openCreatePlanDialog,
                  ),
                ],
              ),
            ),
          );
        }

        return Column(
          children: plans.map((p) => _buildPlanCard(p)).toList(),
        );
      },
    );
  }

  Widget _buildPlanCard(Map<String, dynamic> plan) {
    final id = (plan['id'] ?? '').toString();
    final name = (plan['name'] ?? 'Tier').toString();
    final desc = (plan['description'] ?? '').toString();
    final price = (plan['billingPrice'] ?? plan['priceUsd'] ?? 0).toString();
    final currency = (plan['billingCurrency'] ?? 'USD').toString();
    final interval = (plan['interval'] ?? 'month').toString();
    final quotas = plan['quotas'] is Map ? plan['quotas'] as Map<String, dynamic> : <String, dynamic>{};
    final maxLearners = quotas['maxLearners'] ?? 'Unlimited';
    final maxMentors = quotas['maxMentors'] ?? 'Unlimited';
    final isFree = (num.tryParse(price) ?? 0) == 0;

    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: VopCard(
        child: Padding(
          padding: const EdgeInsets.all(18),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Expanded(
                    child: Text(name, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
                  ),
                  Text(
                    isFree ? 'Free' : '$currency $price / $interval',
                    style: const TextStyle(
                      fontWeight: FontWeight.w900,
                      fontSize: 15,
                      color: VopColors.gold,
                    ),
                  ),
                ],
              ),
              if (desc.isNotEmpty) ...[
                const SizedBox(height: 6),
                Text(desc, style: const TextStyle(fontSize: 12.5, color: Colors.grey)),
              ],
              const Divider(height: 20),
              Row(
                children: [
                  _quotaBadge(Icons.people_outline, 'Learners', '$maxLearners'),
                  const SizedBox(width: 14),
                  _quotaBadge(Icons.psychology_outlined, 'Mentors', '$maxMentors'),
                  const SizedBox(width: 14),
                  _quotaBadge(Icons.workspace_premium_outlined, 'Certificates', 'Included'),
                  const Spacer(),
                  if (isFree && widget.organizationId != null && widget.organizationId!.isNotEmpty)
                    FilledButton(
                      style: FilledButton.styleFrom(
                        visualDensity: VisualDensity.compact,
                        backgroundColor: VopColors.gold,
                        foregroundColor: VopColors.navyDeep,
                      ),
                      onPressed: () => _activateFreePlan(id),
                      child: const Text('Activate Free', style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.bold)),
                    ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _quotaBadge(IconData icon, String label, String value) {
    return Row(
      children: [
        Icon(icon, size: 16, color: Theme.of(context).colorScheme.primary),
        const SizedBox(width: 4),
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(label, style: const TextStyle(fontSize: 10, color: Colors.grey)),
            Text(value, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700)),
          ],
        ),
      ],
    );
  }
}

class _CreatePlanSheet extends StatefulWidget {
  const _CreatePlanSheet({required this.api, required this.onCreated});
  final VopApi api;
  final VoidCallback onCreated;

  @override
  State<_CreatePlanSheet> createState() => _CreatePlanSheetState();
}

class _CreatePlanSheetState extends State<_CreatePlanSheet> {
  final _nameCtrl = TextEditingController();
  final _descCtrl = TextEditingController();
  final _priceCtrl = TextEditingController(text: '0');
  final _learnersCtrl = TextEditingController(text: '200');
  final _mentorsCtrl = TextEditingController(text: '20');
  String _interval = 'month';
  bool _isFreeDefault = false;
  bool _saving = false;

  @override
  void dispose() {
    _nameCtrl.dispose();
    _descCtrl.dispose();
    _priceCtrl.dispose();
    _learnersCtrl.dispose();
    _mentorsCtrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final name = _nameCtrl.text.trim();
    if (name.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Please enter a package name.')));
      return;
    }
    final price = double.tryParse(_priceCtrl.text.trim()) ?? 0.0;
    final learners = int.tryParse(_learnersCtrl.text.trim()) ?? 200;
    final mentors = int.tryParse(_mentorsCtrl.text.trim()) ?? 20;

    setState(() => _saving = true);
    try {
      await widget.api.adminCreatePlan({
        'name': name,
        'description': _descCtrl.text.trim(),
        'priceUsd': price,
        'interval': _interval,
        'active': true,
        'defaultForUnsubscribed': price == 0 && _isFreeDefault,
        'quotas': {
          'maxLearners': learners,
          'maxMentors': mentors,
          'maxCertificates': learners,
        },
        'features': {
          'candidates': true,
          'mentorship': true,
          'certification': true,
          'curriculum': true,
        },
      });
      if (mounted) {
        Navigator.pop(context);
        widget.onCreated();
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Plan tier "$name" saved to database!'), backgroundColor: Colors.teal.shade800),
        );
      }
    } catch (e) {
      if (mounted) {
        setState(() => _saving = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to create tier: $e'), backgroundColor: Colors.red.shade800),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
      ),
      padding: EdgeInsets.fromLTRB(20, 16, 20, MediaQuery.of(context).viewInsets.bottom + 20),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Center(
              child: Container(
                width: 40, height: 4,
                margin: const EdgeInsets.only(bottom: 12),
                decoration: BoxDecoration(color: Colors.grey.withAlpha(80), borderRadius: BorderRadius.circular(2)),
              ),
            ),
            const Text('New Subscription Tier', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
            const SizedBox(height: 4),
            const Text('Create an institutional plan package in Firestore catalog.', style: TextStyle(fontSize: 12, color: Colors.grey)),
            const SizedBox(height: 16),
            TextField(
              controller: _nameCtrl,
              decoration: const InputDecoration(labelText: 'Tier Name *', hintText: 'e.g. Local Church Ministry Tier'),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _descCtrl,
              decoration: const InputDecoration(labelText: 'Description', hintText: 'Features and audience summary'),
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _priceCtrl,
                    keyboardType: TextInputType.number,
                    decoration: const InputDecoration(labelText: 'Price (USD) *', prefixText: '\$ '),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: DropdownButtonFormField<String>(
                    initialValue: _interval,
                    decoration: const InputDecoration(labelText: 'Billing Interval'),
                    items: const [
                      DropdownMenuItem(value: 'month', child: Text('Monthly')),
                      DropdownMenuItem(value: 'year', child: Text('Yearly')),
                    ],
                    onChanged: (val) {
                      if (val != null) setState(() => _interval = val);
                    },
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _learnersCtrl,
                    keyboardType: TextInputType.number,
                    decoration: const InputDecoration(labelText: 'Max Learners', suffixText: 'seats'),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: TextField(
                    controller: _mentorsCtrl,
                    keyboardType: TextInputType.number,
                    decoration: const InputDecoration(labelText: 'Max Mentors', suffixText: 'seats'),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text('Default Free Plan for Unsubscribed', style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600)),
              subtitle: const Text('Automatically assign to new churches without payment', style: TextStyle(fontSize: 11.5, color: Colors.grey)),
              value: _isFreeDefault,
              activeThumbColor: VopColors.gold,
              onChanged: (val) => setState(() => _isFreeDefault = val),
            ),
            const SizedBox(height: 20),
            ElevatedButton(
              style: ElevatedButton.styleFrom(
                backgroundColor: VopColors.gold,
                foregroundColor: VopColors.navyDeep,
                padding: const EdgeInsets.symmetric(vertical: 14),
              ),
              onPressed: _saving ? null : _submit,
              child: _saving
                  ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
                  : const Text('Save Plan to Database', style: TextStyle(fontWeight: FontWeight.w800)),
            ),
          ],
        ),
      ),
    );
  }
}
