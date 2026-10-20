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
  late Future<Map<String, dynamic>> _plansFuture;

  @override
  void initState() {
    super.initState();
    _reload();
  }

  void _reload() {
    setState(() {
      _plansFuture = widget.api.adminPlans(organizationId: widget.organizationId).catchError((_) => <String, dynamic>{
        'items': _fallbackPlans(),
      });
    });
  }

  static List<Map<String, dynamic>> _fallbackPlans() {
    return [
      {
        'id': 'plan_church_growth',
        'name': 'Local Church Ministry Tier',
        'description': 'Empowers local church leadership with candidate enrollment, mentor assignment, and stage approvals.',
        'priceUsd': 29,
        'billingPrice': '29.00',
        'billingCurrency': 'USD',
        'interval': 'month',
        'quotas': {'maxLearners': 150, 'maxMentors': 15, 'maxCertificates': 150},
        'features': {'candidates': true, 'mentorship': true, 'certification': true, 'curriculum': false},
      },
      {
        'id': 'plan_conference_enterprise',
        'name': 'Conference & Field Tier',
        'description': 'Full territorial oversight with multi-district hierarchy, curriculum authoring, and analytics.',
        'priceUsd': 89,
        'billingPrice': '89.00',
        'billingCurrency': 'USD',
        'interval': 'month',
        'quotas': {'maxLearners': 1000, 'maxMentors': 100, 'maxCertificates': 1000},
        'features': {'candidates': true, 'mentorship': true, 'certification': true, 'curriculum': true, 'analytics': true},
      },
      {
        'id': 'plan_union_unlimited',
        'name': 'Union & Division Enterprise',
        'description': 'Unlimited territory-wide multi-conference governance, translation packs, and white-label branding.',
        'priceUsd': 199,
        'billingPrice': '199.00',
        'billingCurrency': 'USD',
        'interval': 'month',
        'quotas': {'maxLearners': 10000, 'maxMentors': 1000, 'maxCertificates': 10000},
        'features': {'candidates': true, 'mentorship': true, 'certification': true, 'curriculum': true, 'analytics': true, 'whiteLabel': true},
      },
    ];
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
      body: FutureBuilder<Map<String, dynamic>>(
        future: _plansFuture,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }

          final rawList = snapshot.data?['items'];
          final plans = (rawList is List && rawList.isNotEmpty)
              ? rawList.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList()
              : _fallbackPlans();

          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              _buildCurrentTierCard(),
              const SizedBox(height: 20),
              const Text(
                'AVAILABLE INSTITUTIONAL TIERS',
                style: TextStyle(
                  color: VopColors.gold,
                  fontWeight: FontWeight.w800,
                  fontSize: 11,
                  letterSpacing: 1.3,
                ),
              ),
              const SizedBox(height: 6),
              const Text(
                'Scale your ministry outreach with seat quotas and advanced certification tools.',
                style: TextStyle(fontSize: 12.5, color: Colors.grey),
              ),
              const SizedBox(height: 14),
              ...plans.map((p) => _buildPlanCard(p)),
              const SizedBox(height: 30),
            ],
          );
        },
      ),
    );
  }

  Widget _buildCurrentTierCard() {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [VopColors.navyDeep, VopColors.navyBright],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(16),
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
                  color: VopColors.gold.withAlpha(45),
                  borderRadius: BorderRadius.circular(6),
                ),
                child: const Text('CURRENT SUBSCRIPTION',
                    style: TextStyle(color: VopColors.goldLight, fontWeight: FontWeight.w800, fontSize: 10)),
              ),
              const Icon(Icons.verified, color: VopColors.goldLight, size: 20),
            ],
          ),
          const SizedBox(height: 12),
          const Text('Voice of Prophecy Active Node',
              style: TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.w900)),
          const SizedBox(height: 4),
          const Text('All core Bible lessons, radio broadcasts, and prayer requests included.',
              style: TextStyle(color: Color(0xFFC7DCFA), fontSize: 12.5)),
        ],
      ),
    );
  }

  Widget _buildPlanCard(Map<String, dynamic> plan) {
    final name = (plan['name'] ?? 'Tier').toString();
    final desc = (plan['description'] ?? '').toString();
    final price = (plan['billingPrice'] ?? plan['priceUsd'] ?? 0).toString();
    final currency = (plan['billingCurrency'] ?? 'USD').toString();
    final interval = (plan['interval'] ?? 'month').toString();
    final quotas = plan['quotas'] is Map ? plan['quotas'] as Map<String, dynamic> : <String, dynamic>{};
    final maxLearners = quotas['maxLearners'] ?? 'Unlimited';
    final maxMentors = quotas['maxMentors'] ?? 'Unlimited';

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
                    '$currency $price / $interval',
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
