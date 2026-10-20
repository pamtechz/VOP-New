import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import '../core/portal_access.dart';
import '../core/vop_api.dart';
import '../theme/vop_theme.dart';
import '../widgets/vop_ui.dart';
import 'account_settings_screen.dart';
import 'candidates_screen.dart';
import 'organizations_screen.dart';
import 'graduations_screen.dart';
import 'home_shell.dart';
import 'user_management_screen.dart';
import 'curriculum_studio_screen.dart';
import 'plans_management_screen.dart';

class AdminDashboardScreen extends StatefulWidget {
  const AdminDashboardScreen({
    required this.api,
    this.account,
    super.key,
  });

  final VopApi api;
  final VopUserAccount? account;

  @override
  State<AdminDashboardScreen> createState() => _AdminDashboardScreenState();
}

class _AdminDashboardScreenState extends State<AdminDashboardScreen> {
  late Future<Map<String, dynamic>> _analyticsFuture;
  late Future<Map<String, dynamic>> _healthFuture;

  @override
  void initState() {
    super.initState();
    _reload();
  }

  void _reload() {
    setState(() {
      _analyticsFuture = widget.api.adminAnalytics();
      _healthFuture = widget.api.adminHealth(detail: false).catchError((_) => <String, dynamic>{'status': 'offline'});
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
        content: const Text('Are you sure you want to sign out of the administration command center?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: Colors.red, foregroundColor: Colors.white),
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
    final account = widget.account;
    final title = account != null ? account.portalTitle : 'Admin Command Center';

    return Scaffold(
      appBar: AppBar(
        title: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.admin_panel_settings, color: VopColors.gold, size: 22),
            const SizedBox(width: 8),
            Flexible(
              child: Text(
                title,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 17),
              ),
            ),
          ],
        ),
        actions: [
          IconButton(
            tooltip: 'Refresh analytics',
            icon: const Icon(Icons.refresh_rounded),
            onPressed: _reload,
          ),
          PopupMenuButton<String>(
            tooltip: 'Admin Menu',
            icon: CircleAvatar(
              radius: 15,
              backgroundColor: VopColors.gold,
              child: Text(
                account != null && account.displayName.isNotEmpty
                    ? account.displayName[0].toUpperCase()
                    : 'A',
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
                _navigate(Scaffold(
                  appBar: AppBar(
                    title: const Text('Learner Workspace Preview'),
                    backgroundColor: VopColors.navyDeep,
                    foregroundColor: Colors.white,
                  ),
                  body: HomeShell(api: widget.api),
                ));
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
                      account?.displayName ?? 'Administrator',
                      style: const TextStyle(fontWeight: FontWeight.w700, color: Colors.black87),
                    ),
                    Text(
                      account?.displayRoleName ?? 'Super Administrator',
                      style: const TextStyle(fontSize: 11, color: Colors.grey),
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
          const SizedBox(width: 6),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async => _reload(),
        child: Center(
          child: ConstrainedBox(
            constraints: BoxConstraints(maxWidth: isDesktop ? 1100 : double.infinity),
            child: ListView(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
              children: [
                _buildExecutiveBanner(),
                const SizedBox(height: 18),
                _buildKpiGrid(),
                const SizedBox(height: 22),
                _buildSectionHeader('MANAGEMENT MODULES', 'Direct access to administrative services'),
                const SizedBox(height: 12),
                _buildActionModules(),
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

  Widget _buildExecutiveBanner() {
    final account = widget.account;
    final isSuper = account?.isSuperAdmin ?? true;
    final badgeText = isSuper
        ? 'EXECUTIVE SUITE'
        : (account?.displayRoleName.toUpperCase() ?? 'HIERARCHY SUITE');
    final heading = isSuper
        ? 'Platform Administration & Governance'
        : '${account?.displayRoleName ?? "Hierarchy"} Workspace';
    final desc = isSuper
        ? 'Oversee global curriculum, candidate enrollment, graduation approvals, organizational hierarchy, and platform health.'
        : 'Manage scoped learners, descendant churches, regional mentors, and course certification.';

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
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: VopColors.gold.withAlpha(45),
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Text(
                  badgeText,
                  style: const TextStyle(
                    color: VopColors.goldLight,
                    fontWeight: FontWeight.w800,
                    fontSize: 10,
                    letterSpacing: 1.2,
                  ),
                ),
              ),
              const Spacer(),
              const Icon(Icons.shield_outlined, color: VopColors.goldLight, size: 20),
            ],
          ),
          const SizedBox(height: 10),
          Text(
            heading,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 19,
              fontWeight: FontWeight.w900,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            desc,
            style: const TextStyle(color: Color(0xFFC7DCFA), fontSize: 13, height: 1.3),
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

  Widget _buildKpiGrid() {
    return FutureBuilder<Map<String, dynamic>>(
      future: _analyticsFuture,
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const Center(child: Padding(
            padding: EdgeInsets.all(24),
            child: CircularProgressIndicator(strokeWidth: 2.5),
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
                    child: Text('Analytics summary: ${snapshot.error}',
                        style: const TextStyle(fontSize: 12.5)),
                  ),
                  TextButton(onPressed: _reload, child: const Text('Retry')),
                ],
              ),
            ),
          );
        }

        final data = snapshot.data ?? {};
        final summary = data['summary'] is Map ? data['summary'] as Map<String, dynamic> : <String, dynamic>{};

        final kpis = [
          _KpiItem('Candidates', summary['candidates'] ?? summary['users'] ?? 0, Icons.people_outline, Colors.blue),
          _KpiItem('Organizations', summary['activeOrganizations'] ?? 0, Icons.corporate_fare_outlined, Colors.teal),
          _KpiItem('Graduations', summary['graduationRequests'] ?? 0, Icons.school_outlined, Colors.amber),
          _KpiItem('Certificates', summary['certificates'] ?? 0, Icons.workspace_premium_outlined, VopColors.gold),
          _KpiItem('Courses / Guides', summary['guides'] ?? 0, Icons.auto_stories_outlined, Colors.indigo),
          _KpiItem('Assessments', summary['quizzes'] ?? 0, Icons.quiz_outlined, Colors.deepPurple),
        ];

        return LayoutBuilder(
          builder: (context, constraints) {
            final crossAxisCount = constraints.maxWidth >= 600 ? 3 : 2;
            return GridView.builder(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              itemCount: kpis.length,
              gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: crossAxisCount,
                crossAxisSpacing: 10,
                mainAxisSpacing: 10,
                childAspectRatio: 1.55,
              ),
              itemBuilder: (context, index) {
                final kpi = kpis[index];
                return VopCard(
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
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
                                color: Theme.of(context).colorScheme.onSurface.withAlpha(180),
                              ),
                            ),
                            Icon(kpi.icon, size: 18, color: kpi.accent),
                          ],
                        ),
                        Text(
                          '${kpi.count}',
                          style: TextStyle(
                            fontSize: 22,
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

  Widget _buildActionModules() {
    final modules = [
      _ModuleItem(
        title: 'Candidate Roster',
        subtitle: 'Enroll, track progress, schedule baptism & verify milestones',
        icon: Icons.badge_outlined,
        color: Colors.blue,
        onTap: () => _navigate(CandidatesScreen(api: widget.api)),
      ),
      _ModuleItem(
        title: 'Organizations & Hierarchy',
        subtitle: 'Manage unions, conferences, districts, churches & schools',
        icon: Icons.account_tree_outlined,
        color: Colors.teal,
        onTap: () => _navigate(OrganizationsScreen(api: widget.api)),
      ),
      _ModuleItem(
        title: 'Graduation Approvals',
        subtitle: 'Multi-stage approval workflow & certificate issuance',
        icon: Icons.workspace_premium_outlined,
        color: VopColors.gold,
        onTap: () => _navigate(GraduationsScreen(api: widget.api)),
      ),
      _ModuleItem(
        title: 'User & Role Directory',
        subtitle: 'Platform & institutional permissions, roles & access',
        icon: Icons.manage_accounts_outlined,
        color: Colors.deepOrange,
        onTap: () => _navigate(UserManagementScreen(api: widget.api)),
      ),
      _ModuleItem(
        title: 'Curriculum & Content Studio',
        subtitle: 'Courses, guides, plate lessons, tests & publication status',
        icon: Icons.menu_book_outlined,
        color: Colors.indigo,
        onTap: () => _navigate(CurriculumStudioScreen(api: widget.api)),
      ),
      _ModuleItem(
        title: 'Subscriptions & Billing',
        subtitle: 'Institutional packages, seat quotas, invoices & plans',
        icon: Icons.payments_outlined,
        color: Colors.purple,
        onTap: () => _navigate(PlansManagementScreen(api: widget.api)),
      ),
    ];

    return Column(
      children: modules.map((m) {
        return Padding(
          padding: const EdgeInsets.only(bottom: 10),
          child: VopCard(
            child: ListTile(
              contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
              leading: Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: m.color.withAlpha(28),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Icon(m.icon, color: m.color, size: 24),
              ),
              title: Text(m.title, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14.5)),
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
                        isHealthy ? 'System Health: Operational' : 'System Health: Monitoring ($status)',
                        style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13),
                      ),
                      Text(
                        'Database & VOP Backend connected to live cluster',
                        style: TextStyle(
                          fontSize: 11.5,
                          color: Theme.of(context).colorScheme.onSurface.withAlpha(140),
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

class _KpiItem {
  final String label;
  final dynamic count;
  final IconData icon;
  final Color accent;
  _KpiItem(this.label, this.count, this.icon, this.accent);
}

class _ModuleItem {
  final String title;
  final String subtitle;
  final IconData icon;
  final Color color;
  final VoidCallback onTap;
  _ModuleItem({required this.title, required this.subtitle, required this.icon, required this.color, required this.onTap});
}
