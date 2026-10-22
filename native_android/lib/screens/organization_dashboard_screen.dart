import 'workspace_navigation.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import '../core/portal_access.dart';
import '../core/vop_api.dart';
import '../theme/vop_theme.dart';
import '../widgets/vop_ui.dart';
import '../widgets/workspace_desktop_shell.dart';
import 'account_settings_screen.dart';

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
  late Future<Map<String,dynamic>> _analyticsFuture;
  late Future<Map<String,dynamic>> _healthFuture;

  @override
  void initState() {
    super.initState();
    _reload();
  }

  void _reload() {
    setState(() {
      _analyticsFuture=widget.api.workspace().then((workspace){
        final permissions=workspace['permissions'] is Map?Map<String,dynamic>.from(workspace['permissions'] as Map):<String,dynamic>{};
        if(!(permissions['analytics'] as List? ?? []).contains('view'))return <String,dynamic>{'unavailable':true};
        return widget.api.adminAnalytics(organizationId:widget.account.organizationId);
      });
      _healthFuture=widget.api.adminHealth(detail:false);
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
      body: WorkspaceDesktopShell(api: widget.api, title: 'Organisation',
        child: RefreshIndicator(
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
                if (!WorkspaceDesktopShell.activeFor(context)) ...[
                  _buildSectionHeader(
                    'INSTITUTIONAL WORKSPACE',
                    'Modules scoped strictly to your organisation',
                  ),
                  const SizedBox(height: 12),
                  _buildModuleCards(isDesktop),
                  const SizedBox(height: 22),
                ],
                _buildHealthStatusCard(),
                const SizedBox(height: 30),
              ],
            ),
          ),
        ),
      )),
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

  Widget _buildKpiMetricsGrid(bool isDesktop) => FutureBuilder<Map<String,dynamic>>(
    future:_analyticsFuture,builder:(context,snapshot){
      if(snapshot.connectionState!=ConnectionState.done)return const VopSkeleton(rows:2);
      if(snapshot.hasError)return VopEmpty(icon:Icons.error_outline,message:'${snapshot.error}',onRetry:_reload);
      if(snapshot.data?['unavailable']==true)return const SizedBox.shrink();
      final summary=snapshot.data?['summary'] is Map?Map<String,dynamic>.from(snapshot.data!['summary'] as Map):<String,dynamic>{};
      final items=[_OrgKpi('Learners','${summary['candidates']??0}',Icons.people_outline,Colors.blue),
        _OrgKpi('Graduation requests','${summary['graduationRequests']??0}',Icons.school_outlined,VopColors.gold),
        _OrgKpi('Guides','${summary['guides']??0}',Icons.menu_book_outlined,Colors.teal),
        _OrgKpi('Certificates','${summary['certificates']??0}',Icons.workspace_premium_outlined,Colors.indigo)];
      return LayoutBuilder(builder:(context,c)=>GridView.builder(shrinkWrap:true,physics:const NeverScrollableScrollPhysics(),itemCount:items.length,
        gridDelegate:SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount:c.maxWidth>=750?4:2,crossAxisSpacing:10,mainAxisSpacing:10,childAspectRatio:1.6),
        itemBuilder:(context,i){final item=items[i];return VopCard(child:Padding(padding:const EdgeInsets.all(14),child:Column(crossAxisAlignment:CrossAxisAlignment.start,mainAxisAlignment:MainAxisAlignment.spaceBetween,children:[
          Row(children:[Expanded(child:Text(item.label,maxLines:2,overflow:TextOverflow.ellipsis)),Icon(item.icon,color:item.accent,size:18)]),
          Text(item.value,style:Theme.of(context).textTheme.headlineSmall),
        ])));}));
    });

  Widget _buildModuleCards(bool isDesktop) => WorkspaceNavigation(api: widget.api);

  Widget _buildHealthStatusCard() => FutureBuilder<Map<String,dynamic>>(future:_healthFuture,builder:(context,s){
    if(s.connectionState!=ConnectionState.done)return const SizedBox.shrink();
    if(s.hasError)return ListTile(leading:const Icon(Icons.warning_amber_outlined),title:const Text('Service status unavailable'),subtitle:Text('${s.error}'),trailing:IconButton(tooltip:'Retry',onPressed:_reload,icon:const Icon(Icons.refresh)));
    return ListTile(leading:const Icon(Icons.cloud_outlined),title:Text('Service status: ${s.data?['status']??'Unavailable'}'));
  });

}

class _OrgKpi {
  final String label;
  final String value;
  final IconData icon;
  final Color accent;
  _OrgKpi(this.label, this.value, this.icon, this.accent);
}
