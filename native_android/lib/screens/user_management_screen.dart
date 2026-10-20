import 'package:flutter/material.dart';
import '../core/vop_api.dart';
import '../theme/vop_theme.dart';
import '../widgets/vop_ui.dart';

class UserManagementScreen extends StatefulWidget {
  const UserManagementScreen({required this.api, super.key});
  final VopApi api;

  @override
  State<UserManagementScreen> createState() => _UserManagementScreenState();
}

class _UserManagementScreenState extends State<UserManagementScreen> {
  late Future<Map<String, dynamic>> _usersFuture;
  String _search = '';
  String _roleFilter = 'all';

  final _roles = [
    {'key': 'all', 'label': 'All Users'},
    {'key': 'super_admin', 'label': 'Super Admins'},
    {'key': 'union_admin', 'label': 'Union Admins'},
    {'key': 'conference_admin', 'label': 'Conference Admins'},
    {'key': 'district_admin', 'label': 'District Admins'},
    {'key': 'church_admin', 'label': 'Church Admins'},
    {'key': 'mentor', 'label': 'Mentors'},
    {'key': 'student', 'label': 'Learners'},
  ];

  @override
  void initState() {
    super.initState();
    _reload();
  }

  void _reload() {
    setState(() {
      _usersFuture = widget.api.adminUsers(
        search: _search.isEmpty ? null : _search,
        role: _roleFilter == 'all' ? null : _roleFilter,
      );
    });
  }

  void _openRoleEditor(Map<String, dynamic> user) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => _EditUserRoleSheet(
        api: widget.api,
        user: user,
        onSaved: _reload,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('User & Role Directory', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 18)),
        actions: [
          IconButton(
            tooltip: 'Refresh directory',
            icon: const Icon(Icons.refresh_rounded),
            onPressed: _reload,
          ),
          const SizedBox(width: 6),
        ],
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
            child: TextField(
              decoration: InputDecoration(
                hintText: 'Search user by name, email or code...',
                prefixIcon: const Icon(Icons.search, size: 20),
                suffixIcon: _search.isNotEmpty
                    ? IconButton(
                        icon: const Icon(Icons.clear, size: 18),
                        onPressed: () {
                          setState(() => _search = '');
                          _reload();
                        },
                      )
                    : null,
                contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
              ),
              onChanged: (val) {
                _search = val.trim();
                _reload();
              },
            ),
          ),
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
            child: Row(
              children: _roles.map((r) {
                final isSelected = _roleFilter == r['key'];
                return Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: ChoiceChip(
                    selected: isSelected,
                    label: Text(r['label']!,
                        style: TextStyle(
                            fontSize: 12,
                            fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500)),
                    selectedColor: VopColors.gold.withAlpha(50),
                    onSelected: (_) {
                      setState(() => _roleFilter = r['key']!);
                      _reload();
                    },
                  ),
                );
              }).toList(),
            ),
          ),
          const Divider(height: 16),
          Expanded(
            child: FutureBuilder<Map<String, dynamic>>(
              future: _usersFuture,
              builder: (context, snapshot) {
                if (snapshot.connectionState == ConnectionState.waiting) {
                  return const Center(child: CircularProgressIndicator());
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
                          Text('Failed to load user directory: ${snapshot.error}', textAlign: TextAlign.center),
                          const SizedBox(height: 12),
                          ElevatedButton(onPressed: _reload, child: const Text('Retry')),
                        ],
                      ),
                    ),
                  );
                }

                final rawList = snapshot.data?['items'] ?? snapshot.data?['users'] ?? [];
                final users = (rawList as List)
                    .whereType<Map>()
                    .map((e) => Map<String, dynamic>.from(e))
                    .toList();

                if (users.isEmpty) {
                  return const Center(
                    child: Padding(
                      padding: EdgeInsets.all(32),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(Icons.person_search_outlined, size: 48, color: Colors.grey),
                          SizedBox(height: 12),
                          Text('No accounts matched your criteria.', style: TextStyle(fontWeight: FontWeight.w600)),
                        ],
                      ),
                    ),
                  );
                }

                return ListView.separated(
                  padding: const EdgeInsets.all(16),
                  itemCount: users.length,
                  separatorBuilder: (_, __) => const SizedBox(height: 8),
                  itemBuilder: (context, index) {
                    final u = users[index];
                    final name = (u['displayName'] ?? u['name'] ?? 'User').toString();
                    final email = (u['email'] ?? '').toString();
                    final role = (u['role'] ?? 'student').toString();
                    final org = (u['organizationName'] ?? '').toString();

                    return VopCard(
                      child: ListTile(
                        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
                        leading: CircleAvatar(
                          backgroundColor: _roleColor(role).withAlpha(35),
                          child: Icon(_roleIcon(role), color: _roleColor(role), size: 20),
                        ),
                        title: Row(
                          children: [
                            Expanded(child: Text(name, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14.5))),
                            _roleBadge(role),
                          ],
                        ),
                        subtitle: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const SizedBox(height: 2),
                            Text(email, style: const TextStyle(fontSize: 12.5)),
                            if (org.isNotEmpty) ...[
                              const SizedBox(height: 2),
                              Text('Entity: $org', style: TextStyle(fontSize: 11.5, color: Theme.of(context).colorScheme.primary)),
                            ],
                          ],
                        ),
                        trailing: IconButton(
                          icon: const Icon(Icons.tune, size: 20),
                          tooltip: 'Edit Role & Permissions',
                          onPressed: () => _openRoleEditor(u),
                        ),
                      ),
                    );
                  },
                );
              },
            ),
          ),
        ],
      ),
    );
  }

  Widget _roleBadge(String role) {
    final color = _roleColor(role);
    final display = role.replaceAll('_', ' ').toUpperCase();
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: color.withAlpha(30),
        borderRadius: BorderRadius.circular(4),
      ),
      child: Text(display, style: TextStyle(color: color, fontSize: 10, fontWeight: FontWeight.w800)),
    );
  }

  Color _roleColor(String role) {
    switch (role.toLowerCase()) {
      case 'super_admin':
        return Colors.purple;
      case 'union_admin':
        return Colors.indigo;
      case 'conference_admin':
        return Colors.blue;
      case 'district_admin':
        return Colors.teal;
      case 'church_admin':
        return VopColors.gold;
      case 'mentor':
        return Colors.deepOrange;
      default:
        return Colors.grey.shade600;
    }
  }

  IconData _roleIcon(String role) {
    switch (role.toLowerCase()) {
      case 'super_admin':
        return Icons.verified_user;
      case 'union_admin':
      case 'conference_admin':
      case 'district_admin':
      case 'church_admin':
        return Icons.admin_panel_settings;
      case 'mentor':
        return Icons.psychology;
      default:
        return Icons.school;
    }
  }
}

class _EditUserRoleSheet extends StatefulWidget {
  const _EditUserRoleSheet({required this.api, required this.user, required this.onSaved});
  final VopApi api;
  final Map<String, dynamic> user;
  final VoidCallback onSaved;

  @override
  State<_EditUserRoleSheet> createState() => _EditUserRoleSheetState();
}

class _EditUserRoleSheetState extends State<_EditUserRoleSheet> {
  late String _selectedRole;
  final _nodeIdCtrl = TextEditingController();
  bool _privAdmin = false;
  bool _privEditor = false;
  bool _privManager = false;
  bool _loading = false;
  String? _error;

  final _allRoles = [
    {'value': 'student', 'label': 'Student / Learner'},
    {'value': 'mentor', 'label': 'Mentor / Guide'},
    {'value': 'church_admin', 'label': 'Church Administrator'},
    {'value': 'district_admin', 'label': 'District Administrator'},
    {'value': 'conference_admin', 'label': 'Conference Administrator'},
    {'value': 'union_admin', 'label': 'Union Administrator'},
    {'value': 'super_admin', 'label': 'Super Administrator'},
  ];

  @override
  void initState() {
    super.initState();
    _selectedRole = (widget.user['role'] ?? 'student').toString();
    _nodeIdCtrl.text = (widget.user['adminNodeId'] ?? '').toString();
    final privs = widget.user['privileges'] is Map ? widget.user['privileges'] as Map<String, dynamic> : <String, dynamic>{};
    _privAdmin = privs['admin'] == true;
    _privEditor = privs['editor'] == true;
    _privManager = privs['manager'] == true;
  }

  Future<void> _save() async {
    final uid = (widget.user['uid'] ?? widget.user['id'] ?? '').toString();
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      await widget.api.updateUserRole(
        targetUid: uid,
        role: _selectedRole,
        adminNodeId: _nodeIdCtrl.text.trim().isEmpty ? null : _nodeIdCtrl.text.trim(),
        privileges: {
          'admin': _privAdmin,
          'editor': _privEditor,
          'manager': _privManager,
        },
      );
      if (mounted) {
        Navigator.pop(context);
        widget.onSaved();
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('User role & access updated!'), backgroundColor: Colors.teal),
        );
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _loading = false;
          _error = '$e';
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final name = (widget.user['displayName'] ?? widget.user['name'] ?? 'User').toString();

    return Container(
      padding: EdgeInsets.fromLTRB(20, 20, 20, MediaQuery.of(context).viewInsets.bottom + 20),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
      ),
      child: SingleChildScrollView(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Row(
              children: [
                const Icon(Icons.manage_accounts, color: VopColors.gold),
                const SizedBox(width: 8),
                Expanded(
                  child: Text('Edit Role: $name', style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800)),
                ),
              ],
            ),
            const SizedBox(height: 14),
            if (_error != null) ...[
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(color: Colors.red.withAlpha(25), borderRadius: BorderRadius.circular(8)),
                child: Text(_error!, style: const TextStyle(color: Colors.red, fontSize: 12.5)),
              ),
              const SizedBox(height: 10),
            ],
            DropdownButtonFormField<String>(
              initialValue: _selectedRole,
              decoration: const InputDecoration(labelText: 'Assigned Platform Role', border: OutlineInputBorder()),
              items: _allRoles.map((r) => DropdownMenuItem(value: r['value'], child: Text(r['label']!))).toList(),
              onChanged: (val) => setState(() => _selectedRole = val ?? 'student'),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _nodeIdCtrl,
              decoration: const InputDecoration(
                labelText: 'Admin Node ID (Optional)',
                hintText: 'e.g. churchId, districtId, conferenceId',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 14),
            const Text('SPECIAL PRIVILEGES', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: VopColors.gold)),
            CheckboxListTile(
              dense: true,
              title: const Text('Administrative Access'),
              value: _privAdmin,
              onChanged: (v) => setState(() => _privAdmin = v ?? false),
            ),
            CheckboxListTile(
              dense: true,
              title: const Text('Curriculum Content Editor'),
              value: _privEditor,
              onChanged: (v) => setState(() => _privEditor = v ?? false),
            ),
            CheckboxListTile(
              dense: true,
              title: const Text('Operations / Operations Manager'),
              value: _privManager,
              onChanged: (v) => setState(() => _privManager = v ?? false),
            ),
            const SizedBox(height: 18),
            SizedBox(
              width: double.infinity,
              height: 48,
              child: ElevatedButton(
                style: ElevatedButton.styleFrom(
                  backgroundColor: VopColors.gold,
                  foregroundColor: VopColors.navyDeep,
                ),
                onPressed: _loading ? null : _save,
                child: _loading
                    ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
                    : const Text('Save Changes', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
