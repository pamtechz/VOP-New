import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import '../core/portal_access.dart';
import '../core/vop_api.dart';
import '../theme/vop_theme.dart';
import '../widgets/vop_ui.dart';
import 'account_settings_screen.dart';
import 'candidates_screen.dart';
import 'curriculum_studio_screen.dart';
import 'graduations_screen.dart';
import 'home_shell.dart';
import 'mentor_workspace_screen.dart';
import 'plans_management_screen.dart';

class OrganizationDashboardScreen extends StatefulWidget {
  const OrganizationDashboardScreen({
    required this.api,
    required this.account,
    super.key,
  });

  final VopApi api;
  final VopUserAccount account;

  @override
  State<OrganizationDashboardScreen> createState() =>
      _OrganizationDashboardScreenState();
}

class _OrganizationDashboardScreenState
    extends State<OrganizationDashboardScreen> {
  late Future<Map<String, dynamic>> _candidatesFuture;
  late Future<Map<String, dynamic>> _graduationsFuture;
  late Future<Map<String, dynamic>> _catalogFuture;
  late Future<Map<String, dynamic>> _healthFuture;
  late Future<Map<String, dynamic>> _plansFuture;
  late Future<Map<String, dynamic>> _orgFuture;

  @override
  void initState() {
    super.initState();
    _reload();
  }

  void _reload() {
    setState(() {
      _candidatesFuture = widget.api
          .adminCandidates(organizationId: widget.account.organizationId)
          .catchError((_) => <String, dynamic>{'items': []});
      _graduationsFuture = widget.api
          .adminGraduations(organizationId: widget.account.organizationId)
          .catchError((_) => <String, dynamic>{'items': []});
      _catalogFuture = widget.api.catalogue().catchError(
        (_) => <String, dynamic>{'guides': []},
      );
      _healthFuture = widget.api
          .adminHealth(detail: false)
          .catchError((_) => <String, dynamic>{'status': 'offline'});
      _orgFuture = widget.api
          .adminOrganizations(organizationId: widget.account.organizationId)
          .catchError((_) => <String, dynamic>{'items': []});
      _plansFuture = widget.api
          .adminSubscription(organizationId: widget.account.organizationId)
          .catchError((_) => <String, dynamic>{});
    });
  }

  void _navigate(Widget screen) {
    Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => screen));
  }

  Future<void> _signOut() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Sign Out'),
        content: const Text(
          'Are you sure you want to sign out of the organisation portal?',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: Colors.red,
              foregroundColor: Colors.white,
            ),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Sign Out'),
          ),
        ],
      ),
    );
    if (confirmed == true) {
      await FirebaseAuth.instance.signOut();
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDesktop = MediaQuery.of(context).size.width >= 800;

    return Scaffold(
      appBar: AppBar(
        title: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              padding: const EdgeInsets.all(6),
              decoration: BoxDecoration(
                color: VopColors.gold.withAlpha(40),
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Icon(
                Icons.corporate_fare,
                color: VopColors.gold,
                size: 20,
              ),
            ),
            const SizedBox(width: 10),
            Flexible(
              child: Text(
                widget.account.organizationName.isNotEmpty
                    ? widget.account.organizationName
                    : 'Organisation Portal',
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  fontWeight: FontWeight.w800,
                  fontSize: 17,
                ),
              ),
            ),
          ],
        ),
        actions: [
          IconButton(
            tooltip: 'Refresh Portal',
            icon: const Icon(Icons.refresh_rounded),
            onPressed: _reload,
          ),
          PopupMenuButton<String>(
            tooltip: 'Organisation Menu',
            icon: CircleAvatar(
              radius: 15,
              backgroundColor: VopColors.gold,
              child: Text(
                widget.account.displayName.isNotEmpty
                    ? widget.account.displayName[0].toUpperCase()
                    : 'O',
                style: const TextStyle(
                  color: VopColors.navyDeep,
                  fontWeight: FontWeight.w800,
                  fontSize: 13,
                ),
              ),
            ),
            onSelected: (val) {
              if (val == 'settings') {
                _navigate(AccountSettingsScreen(api: widget.api));
              } else if (val == 'learner_preview') {
                _navigate(
                  Scaffold(
                    appBar: AppBar(
                      title: const Text('Learner Workspace Preview'),
                      backgroundColor: VopColors.navyDeep,
                      foregroundColor: Colors.white,
                    ),
                    body: HomeShell(api: widget.api),
                  ),
                );
              } else if (val == 'sign_out') {
                _signOut();
              }
            },
            itemBuilder: (ctx) => [
              PopupMenuItem(
                enabled: false,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      widget.account.displayName,
                      style: const TextStyle(
                        fontWeight: FontWeight.w700,
                        color: Colors.black87,
                      ),
                    ),
                    Text(
                      widget.account.displayRoleName,
                      style: const TextStyle(fontSize: 11, color: Colors.grey),
                    ),
                    if (widget.account.organizationId.isNotEmpty)
                      Text(
                        'Org ID: ${widget.account.organizationId}',
                        style: const TextStyle(
                          fontSize: 10,
                          color: VopColors.navyDeep,
                        ),
                      ),
                  ],
                ),
              ),
              const PopupMenuDivider(),
              const PopupMenuItem(
                value: 'settings',
                child: Row(
                  children: [
                    Icon(Icons.manage_accounts_outlined, size: 18),
                    SizedBox(width: 10),
                    Text('Account & Preferences'),
                  ],
                ),
              ),
              const PopupMenuItem(
                value: 'learner_preview',
                child: Row(
                  children: [
                    Icon(Icons.visibility_outlined, size: 18),
                    SizedBox(width: 10),
                    Text('Preview Learner View'),
                  ],
                ),
              ),
              const PopupMenuDivider(),
              const PopupMenuItem(
                value: 'sign_out',
                child: Row(
                  children: [
                    Icon(Icons.logout, size: 18, color: Colors.red),
                    SizedBox(width: 10),
                    Text('Sign Out', style: TextStyle(color: Colors.red)),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(width: 8),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async => _reload(),
        child: Center(
          child: ConstrainedBox(
            constraints: BoxConstraints(
              maxWidth: isDesktop ? 1100 : double.infinity,
            ),
            child: ListView(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
              children: [
                _buildInstitutionalBanner(),
                const SizedBox(height: 18),
                _buildKpiMetricsGrid(isDesktop),
                const SizedBox(height: 22),
                _buildSectionHeader(
                  'INSTITUTIONAL WORKSPACE',
                  'Modules scoped strictly to your organisation',
                ),
                const SizedBox(height: 12),
                _buildModuleCards(isDesktop),
                const SizedBox(height: 22),
                _buildHealthStatusCard(),
                const SizedBox(height: 30),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildInstitutionalBanner() {
    final orgName = widget.account.organizationName.isNotEmpty
        ? widget.account.organizationName
        : 'Bible School & Ministry';
    final roleName = widget.account.displayRoleName.toUpperCase();

    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [VopColors.navyDeep, Color(0xFF1E3A8A)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(16),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withAlpha(35),
            blurRadius: 10,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: VopColors.gold.withAlpha(50),
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Text(
                  roleName,
                  style: const TextStyle(
                    color: VopColors.goldLight,
                    fontWeight: FontWeight.w800,
                    fontSize: 10.5,
                    letterSpacing: 1.2,
                  ),
                ),
              ),
              const Spacer(),
              if (widget.account.organizationId.isNotEmpty)
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 8,
                    vertical: 3,
                  ),
                  decoration: BoxDecoration(
                    color: Colors.white.withAlpha(20),
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: Text(
                    'ID: ${widget.account.organizationId}',
                    style: const TextStyle(
                      color: Colors.white70,
                      fontSize: 10,
                      fontFamily: 'monospace',
                    ),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 12),
          Text(
            orgName,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 21,
              fontWeight: FontWeight.w900,
            ),
          ),
          const SizedBox(height: 4),
          const Text(
            'Institutional management center: Enroll candidates, assign mentors, review milestone achievements, and issue course graduation approvals.',
            style: TextStyle(
              color: Color(0xFFD1E3FF),
              fontSize: 13,
              height: 1.35,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSectionHeader(String title, String subtitle) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          title,
          style: const TextStyle(
            color: VopColors.gold,
            fontWeight: FontWeight.w800,
            fontSize: 11,
            letterSpacing: 1.3,
          ),
        ),
        const SizedBox(height: 2),
        Text(
          subtitle,
          style: TextStyle(
            color: Theme.of(context).colorScheme.onSurface.withAlpha(160),
            fontSize: 12,
          ),
        ),
      ],
    );
  }

  Widget _buildKpiMetricsGrid(bool isDesktop) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final crossAxisCount = constraints.maxWidth >= 750 ? 4 : 2;

        return FutureBuilder<List<dynamic>>(
          future: Future.wait([
            _candidatesFuture,
            _graduationsFuture,
            _catalogFuture,
            _orgFuture,
            _plansFuture,
          ]),
          builder: (context, snapshot) {
            final candidatesData =
                snapshot.data?[0] as Map<String, dynamic>? ?? {};
            final graduationsData =
                snapshot.data?[1] as Map<String, dynamic>? ?? {};
            final catalogData =
                snapshot.data?[2] as Map<String, dynamic>? ?? {};
            final orgData =
                snapshot.data?[3] as Map<String, dynamic>? ?? {};
            final plansData =
                snapshot.data?[4] as Map<String, dynamic>? ?? {};

            final candidateCount =
                (candidatesData['items'] as List?)?.length ??
                (candidatesData['candidates'] as List?)?.length ??
                0;
            final graduationCount =
                (graduationsData['items'] as List?)?.length ??
                (graduationsData['requests'] as List?)?.length ??
                0;
            final guideCount = (catalogData['guides'] as List?)?.length ?? 0;

            final orgItems = (orgData['items'] as List?)?.whereType<Map>().toList() ?? [];
            final orgDoc = orgItems.isNotEmpty ? orgItems.first : <String, dynamic>{};
            final orgStatusRaw = (orgDoc['status'] ?? 'active').toString().toLowerCase();
            final orgStatusDisplay = orgStatusRaw.isNotEmpty
                ? '${orgStatusRaw[0].toUpperCase()}${orgStatusRaw.substring(1)}'
                : 'Active';
            final isOrgActive = orgStatusRaw == 'active';
            final subscription = plansData['subscription'] is Map
                ? plansData['subscription'] as Map<String, dynamic>
                : <String, dynamic>{};
            final isSubActive = subscription['status'] == 'active' || plansData['paidPlanActive'] == true || plansData['freeTier'] == true;

            final kpis = [
              _OrgKpi(
                'My Learners',
                '$candidateCount',
                Icons.people_outline,
                Colors.blue,
              ),
              _OrgKpi(
                'Graduations',
                '$graduationCount',
                Icons.workspace_premium_outlined,
                VopColors.gold,
              ),
              _OrgKpi(
                'Active Courses',
                '$guideCount',
                Icons.auto_stories_outlined,
                Colors.teal,
              ),
              _OrgKpi(
                'Org Status',
                orgStatusDisplay,
                (isOrgActive && isSubActive) ? Icons.verified_outlined : Icons.warning_amber_outlined,
                (isOrgActive && isSubActive) ? Colors.green : Colors.amber,
              ),
            ];

            return GridView.builder(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              itemCount: kpis.length,
              gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: crossAxisCount,
                crossAxisSpacing: 10,
                mainAxisSpacing: 10,
                childAspectRatio: 1.6,
              ),
              itemBuilder: (context, index) {
                final kpi = kpis[index];
                return VopCard(
                  child: Padding(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 14,
                      vertical: 12,
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Text(
                              kpi.label,
                              style: TextStyle(
                                fontSize: 12,
                                fontWeight: FontWeight.w600,
                                color: Theme.of(
                                  context,
                                ).colorScheme.onSurface.withAlpha(180),
                              ),
                            ),
                            Icon(kpi.icon, size: 18, color: kpi.accent),
                          ],
                        ),
                        Text(
                          kpi.value,
                          style: TextStyle(
                            fontSize: kpi.value.length > 5 ? 16 : 22,
                            fontWeight: FontWeight.w900,
                            color: Theme.of(context).colorScheme.primary,
                          ),
                        ),
                      ],
                    ),
                  ),
                );
              },
            );
          },
        );
      },
    );
  }

  Widget _buildModuleCards(bool isDesktop) {
    final modules = [
      _OrgModuleItem(
        title: 'Manage Organisation Learners',
        subtitle:
            'Enroll students, monitor lesson milestones & schedule baptism dates',
        icon: Icons.badge_outlined,
        color: Colors.blue,
        onTap: () => _navigate(
          CandidatesScreen(
            api: widget.api,
            organizationId: widget.account.organizationId,
          ),
        ),
      ),
      _OrgModuleItem(
        title: 'Graduation Approvals & Certificates',
        subtitle:
            'Review average quiz scores, verify completions & approve certificates',
        icon: Icons.school_outlined,
        color: VopColors.gold,
        onTap: () => _navigate(
          GraduationsScreen(
            api: widget.api,
            organizationId: widget.account.organizationId,
          ),
        ),
      ),
      _OrgModuleItem(
        title: 'Curriculum & Study Guides',
        subtitle: 'Explore active guides, Plate lessons and publication status',
        icon: Icons.menu_book_outlined,
        color: Colors.teal,
        onTap: () => _navigate(CurriculumStudioScreen(api: widget.api)),
      ),
      _OrgModuleItem(
        title: 'Mentoring & Pastoral Support',
        subtitle:
            'Support candidates through personal messaging and lesson review',
        icon: Icons.support_agent_outlined,
        color: Colors.indigo,
        onTap: () => _navigate(MentorWorkspaceScreen(api: widget.api)),
      ),
      _OrgModuleItem(
        title: 'Institutional Tier & Seat Quotas',
        subtitle:
            'Manage organisation subscription packages, limits and invoicing',
        icon: Icons.payments_outlined,
        color: Colors.purple,
        onTap: () => _navigate(
          PlansManagementScreen(
            api: widget.api,
            organizationId: widget.account.organizationId,
          ),
        ),
      ),
      _OrgModuleItem(
        title: 'Account & Security Preferences',
        subtitle:
            'Update profile details, security sessions and study settings',
        icon: Icons.manage_accounts_outlined,
        color: Colors.deepOrange,
        onTap: () => _navigate(AccountSettingsScreen(api: widget.api)),
      ),
    ];

    return Column(
      children: modules.map((m) {
        return Padding(
          padding: const EdgeInsets.only(bottom: 10),
          child: VopCard(
            child: ListTile(
              contentPadding: const EdgeInsets.symmetric(
                horizontal: 16,
                vertical: 8,
              ),
              leading: Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: m.color.withAlpha(28),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Icon(m.icon, color: m.color, size: 24),
              ),
              title: Text(
                m.title,
                style: const TextStyle(
                  fontWeight: FontWeight.w700,
                  fontSize: 14.5,
                ),
              ),
              subtitle: Text(m.subtitle, style: const TextStyle(fontSize: 12)),
              trailing: const Icon(Icons.chevron_right, size: 18),
              onTap: m.onTap,
            ),
          ),
        );
      }).toList(),
    );
  }

  Widget _buildHealthStatusCard() {
    return FutureBuilder<Map<String, dynamic>>(
      future: _healthFuture,
      builder: (context, snapshot) {
        final status = snapshot.data?['status']?.toString() ?? 'checking';
        final isHealthy = status == 'ok';

        return VopCard(
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Row(
              children: [
                Container(
                  width: 12,
                  height: 12,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: isHealthy ? Colors.green : Colors.amber,
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        isHealthy
                            ? 'Organisation Node: Synchronized'
                            : 'Organisation Node: Connecting ($status)',
                        style: const TextStyle(
                          fontWeight: FontWeight.w700,
                          fontSize: 13,
                        ),
                      ),
                      Text(
                        'Connected to Voice of Prophecy administrative network',
                        style: TextStyle(
                          fontSize: 11.5,
                          color: Theme.of(
                            context,
                          ).colorScheme.onSurface.withAlpha(140),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}

class _OrgKpi {
  final String label;
  final String value;
  final IconData icon;
  final Color accent;
  _OrgKpi(this.label, this.value, this.icon, this.accent);
}

class _OrgModuleItem {
  final String title;
  final String subtitle;
  final IconData icon;
  final Color color;
  final VoidCallback onTap;
  _OrgModuleItem({
    required this.title,
    required this.subtitle,
    required this.icon,
    required this.color,
    required this.onTap,
  });
}
