import 'package:flutter/material.dart';
import '../core/vop_api.dart';
import '../theme/vop_theme.dart';
import '../widgets/vop_ui.dart';

class OrganizationsScreen extends StatefulWidget {
  const OrganizationsScreen({required this.api, super.key});
  final VopApi api;

  @override
  State<OrganizationsScreen> createState() => _OrganizationsScreenState();
}

class _OrganizationsScreenState extends State<OrganizationsScreen> with SingleTickerProviderStateMixin {
  late Future<Map<String, dynamic>> _orgsFuture;
  late TabController _tabController;
  String _searchQuery = '';

  final _typeFilters = ['all', 'union', 'conference', 'district', 'church', 'school'];

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: _typeFilters.length, vsync: this);
    _reload();
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  void _reload() {
    setState(() {
      _orgsFuture = widget.api.adminOrganizations();
    });
  }

  void _openCreateDialog() {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => _CreateOrganizationSheet(
        api: widget.api,
        onCreated: _reload,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Organizations & Hierarchy', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 18)),
        bottom: TabBar(
          controller: _tabController,
          isScrollable: true,
          indicatorColor: VopColors.gold,
          labelColor: VopColors.gold,
          tabs: const [
            Tab(text: 'All Entities'),
            Tab(text: 'Unions'),
            Tab(text: 'Conferences'),
            Tab(text: 'Districts'),
            Tab(text: 'Churches'),
            Tab(text: 'Schools & Campus'),
          ],
          onTap: (_) => setState(() {}),
        ),
        actions: [
          IconButton(
            tooltip: 'Refresh entities',
            icon: const Icon(Icons.refresh_rounded),
            onPressed: _reload,
          ),
          const SizedBox(width: 6),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        backgroundColor: VopColors.gold,
        foregroundColor: VopColors.navyDeep,
        icon: const Icon(Icons.add_business_outlined),
        label: const Text('New Organization', style: TextStyle(fontWeight: FontWeight.w800)),
        onPressed: _openCreateDialog,
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
            child: TextField(
              decoration: InputDecoration(
                hintText: 'Search organization by name, slug or code...',
                prefixIcon: const Icon(Icons.search, size: 20),
                suffixIcon: _searchQuery.isNotEmpty
                    ? IconButton(
                        icon: const Icon(Icons.clear, size: 18),
                        onPressed: () => setState(() => _searchQuery = ''),
                      )
                    : null,
                contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
              ),
              onChanged: (val) => setState(() => _searchQuery = val.trim().toLowerCase()),
            ),
          ),
          Expanded(
            child: FutureBuilder<Map<String, dynamic>>(
              future: _orgsFuture,
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
                          Text('Failed to load organizations: ${snapshot.error}', textAlign: TextAlign.center),
                          const SizedBox(height: 12),
                          ElevatedButton(onPressed: _reload, child: const Text('Retry')),
                        ],
                      ),
                    ),
                  );
                }

                final rawList = snapshot.data?['items'] ?? snapshot.data?['organizations'] ?? [];
                var orgs = (rawList as List)
                    .whereType<Map>()
                    .map((e) => Map<String, dynamic>.from(e))
                    .toList();

                final selectedFilter = _typeFilters[_tabController.index];
                if (selectedFilter != 'all') {
                  orgs = orgs.where((o) {
                    final type = (o['organizationType'] ?? 'church').toString().toLowerCase();
                    if (selectedFilter == 'school') {
                      return type.contains('school') || type.contains('university') || type == 'acm' || type == 'pcm';
                    }
                    return type == selectedFilter;
                  }).toList();
                }

                if (_searchQuery.isNotEmpty) {
                  orgs = orgs.where((o) {
                    final name = (o['name'] ?? '').toString().toLowerCase();
                    final id = (o['id'] ?? '').toString().toLowerCase();
                    return name.contains(_searchQuery) || id.contains(_searchQuery);
                  }).toList();
                }

                if (orgs.isEmpty) {
                  return const Center(
                    child: Padding(
                      padding: EdgeInsets.all(32),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(Icons.corporate_fare_outlined, size: 48, color: Colors.grey),
                          SizedBox(height: 12),
                          Text('No organizations found.', style: TextStyle(fontWeight: FontWeight.w600)),
                          SizedBox(height: 4),
                          Text('Tap "New Organization" to provision a institutional node.',
                              style: TextStyle(color: Colors.grey, fontSize: 13)),
                        ],
                      ),
                    ),
                  );
                }

                return ListView.separated(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 90),
                  itemCount: orgs.length,
                  separatorBuilder: (_, __) => const SizedBox(height: 8),
                  itemBuilder: (context, index) {
                    final o = orgs[index];
                    final name = (o['name'] ?? 'Unnamed Organization').toString();
                    final id = (o['id'] ?? '').toString();
                    final type = (o['organizationType'] ?? 'church').toString();
                    final country = (o['billingCountry'] ?? 'Zambia').toString();
                    final status = (o['status'] ?? 'active').toString();
                    final isActive = status == 'active';

                    return VopCard(
                      child: ListTile(
                        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                        leading: CircleAvatar(
                          backgroundColor: _typeColor(type).withAlpha(35),
                          child: Icon(_typeIcon(type), color: _typeColor(type), size: 22),
                        ),
                        title: Row(
                          children: [
                            Expanded(child: Text(name, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15))),
                            if (o['isPublicMinistry'] == true) ...[
                              _badge('PUBLIC ACCESS', Colors.teal),
                              const SizedBox(width: 4),
                            ],
                            _badge(type.toUpperCase().replaceAll('_', ' '), _typeColor(type)),
                          ],
                        ),
                        subtitle: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const SizedBox(height: 4),
                            Text('ID: $id • $country', style: const TextStyle(fontSize: 12, color: Colors.grey)),
                            const SizedBox(height: 2),
                            Row(
                              children: [
                                Container(
                                  width: 8,
                                  height: 8,
                                  decoration: BoxDecoration(
                                    shape: BoxShape.circle,
                                    color: isActive ? Colors.green : Colors.red,
                                  ),
                                ),
                                const SizedBox(width: 6),
                                Text(isActive ? 'Active' : 'Suspended', style: TextStyle(fontSize: 11.5, color: isActive ? Colors.green : Colors.red)),
                              ],
                            ),
                          ],
                        ),
                        trailing: const Icon(Icons.chevron_right, size: 18),
                        onTap: () => _showOrgDetails(o),
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

  void _showOrgDetails(Map<String, dynamic> o) {
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (ctx) => Container(
        padding: const EdgeInsets.all(22),
        decoration: BoxDecoration(
          color: Theme.of(context).colorScheme.surface,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Row(
              children: [
                CircleAvatar(
                  backgroundColor: _typeColor(o['organizationType']?.toString() ?? '').withAlpha(40),
                  child: Icon(_typeIcon(o['organizationType']?.toString() ?? ''), color: _typeColor(o['organizationType']?.toString() ?? '')),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(o['name']?.toString() ?? 'Organization', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
                      Text('Entity ID: ${o['id']}', style: const TextStyle(fontSize: 12, color: Colors.grey)),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 18),
            _infoRow('Type', (o['organizationType'] ?? 'church').toString().toUpperCase().replaceAll('_', ' ')),
            _infoRow('Public Ministry', o['isPublicMinistry'] == true ? 'YES (Open Access Word of God)' : 'No (Church / Institutional)'),
            _infoRow('Billing Country', (o['billingCountry'] ?? 'Zambia').toString()),
            _infoRow('Current Plan', (o['plan'] ?? 'unsubscribed').toString().toUpperCase()),
            _infoRow('Status', (o['status'] ?? 'active').toString().toUpperCase()),
            const SizedBox(height: 16),
            SizedBox(
              width: double.infinity,
              child: FilledButton.tonalIcon(
                icon: Icon(o['isPublicMinistry'] == true ? Icons.public_off : Icons.public, size: 18),
                label: Text(
                  o['isPublicMinistry'] == true
                      ? 'Revoke Public Ministry Designation'
                      : 'Designate as Super Admin Public Ministry',
                  style: const TextStyle(fontWeight: FontWeight.bold),
                ),
                onPressed: () async {
                  Navigator.pop(ctx);
                  final isCurrentlyPublic = o['isPublicMinistry'] == true;
                  final orgId = (o['id'] ?? '').toString();
                  try {
                    await widget.api.setPublicMinistry(
                      organizationId: orgId,
                      isPublicMinistry: !isCurrentlyPublic,
                    );
                    _reload();
                    if (mounted) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(
                          content: Text(
                            !isCurrentlyPublic
                                ? 'Organization designated as Super Admin Public Access Ministry!'
                                : 'Public Ministry designation revoked.',
                          ),
                          backgroundColor: Colors.teal.shade800,
                        ),
                      );
                    }
                  } catch (e) {
                    if (mounted) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(content: Text('Error updating public ministry: $e')),
                      );
                    }
                  }
                },
              ),
            ),
            const SizedBox(height: 8),
            SizedBox(
              width: double.infinity,
              child: OutlinedButton(
                onPressed: () => Navigator.pop(ctx),
                child: const Text('Close'),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _infoRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: const TextStyle(fontSize: 13, color: Colors.grey)),
          Text(value, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
        ],
      ),
    );
  }

  Widget _badge(String text, Color color) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: color.withAlpha(30),
        borderRadius: BorderRadius.circular(4),
      ),
      child: Text(text, style: TextStyle(color: color, fontSize: 10, fontWeight: FontWeight.w800)),
    );
  }

  IconData _typeIcon(String type) {
    switch (type.toLowerCase()) {
      case 'union':
        return Icons.account_balance;
      case 'conference':
        return Icons.domain;
      case 'district':
        return Icons.location_city;
      case 'secondary_school':
      case 'adventist_university':
        return Icons.school;
      case 'acm':
      case 'pcm':
        return Icons.group_work;
      default:
        return Icons.church;
    }
  }

  Color _typeColor(String type) {
    switch (type.toLowerCase()) {
      case 'union':
        return Colors.indigo;
      case 'conference':
        return Colors.blue;
      case 'district':
        return Colors.teal;
      case 'secondary_school':
      case 'adventist_university':
        return Colors.amber;
      case 'acm':
      case 'pcm':
        return Colors.purple;
      default:
        return VopColors.gold;
    }
  }
}

class _CreateOrganizationSheet extends StatefulWidget {
  const _CreateOrganizationSheet({required this.api, required this.onCreated});
  final VopApi api;
  final VoidCallback onCreated;

  @override
  State<_CreateOrganizationSheet> createState() => _CreateOrganizationSheetState();
}

class _CreateOrganizationSheetState extends State<_CreateOrganizationSheet> {
  final _nameCtrl = TextEditingController();
  final _idCtrl = TextEditingController();
  String _selectedType = 'church';
  String _country = 'Zambia';
  bool _isPublicMinistry = false;
  bool _loading = false;
  String? _error;

  final _types = [
    {'value': 'union', 'label': 'Union (Multi-Conference)'},
    {'value': 'conference', 'label': 'Conference / Field'},
    {'value': 'district', 'label': 'District (Multi-Church)'},
    {'value': 'church', 'label': 'Local Church'},
    {'value': 'secondary_school', 'label': 'Secondary School'},
    {'value': 'adventist_university', 'label': 'Adventist University'},
    {'value': 'acm', 'label': 'Adventist Campus Ministries (ACM)'},
    {'value': 'pcm', 'label': 'Public Campus Ministries (PCM)'},
    {'value': 'other', 'label': 'Other Ministry Organization'},
  ];

  Future<void> _submit() async {
    final name = _nameCtrl.text.trim();
    if (name.isEmpty) {
      setState(() => _error = 'Organization name is required.');
      return;
    }

    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      await widget.api.createOrganization(
        name: name,
        organizationType: _selectedType,
        id: _idCtrl.text.trim().isEmpty ? null : _idCtrl.text.trim(),
        billingCountry: _country,
        isPublicMinistry: _isPublicMinistry,
      );
      if (mounted) {
        Navigator.pop(context);
        widget.onCreated();
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Organization $name provisioned!'), backgroundColor: Colors.teal),
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
            const Row(
              children: [
                Icon(Icons.add_business, color: VopColors.gold),
                SizedBox(width: 8),
                Text('Provision Organization Node', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
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
            TextField(
              controller: _nameCtrl,
              decoration: const InputDecoration(labelText: 'Organization Name *', border: OutlineInputBorder()),
            ),
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
              initialValue: _selectedType,
              decoration: const InputDecoration(labelText: 'Institutional Level *', border: OutlineInputBorder()),
              items: _types.map((t) => DropdownMenuItem(value: t['value'], child: Text(t['label']!))).toList(),
              onChanged: (val) => setState(() => _selectedType = val ?? 'church'),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _idCtrl,
              decoration: const InputDecoration(
                labelText: 'Organization ID / Slug (optional)',
                hintText: 'e.g. lusaka-central-church',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
              initialValue: _country,
              decoration: const InputDecoration(labelText: 'Billing Country', border: OutlineInputBorder()),
              items: const [
                DropdownMenuItem(value: 'Zambia', child: Text('Zambia')),
                DropdownMenuItem(value: 'Zimbabwe', child: Text('Zimbabwe')),
                DropdownMenuItem(value: 'South Africa', child: Text('South Africa')),
                DropdownMenuItem(value: 'Kenya', child: Text('Kenya')),
                DropdownMenuItem(value: 'Malawi', child: Text('Malawi')),
                DropdownMenuItem(value: 'United States', child: Text('United States')),
                DropdownMenuItem(value: 'United Kingdom', child: Text('United Kingdom')),
              ],
              onChanged: (val) => setState(() => _country = val ?? 'Zambia'),
            ),
            const SizedBox(height: 12),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text('Super Admin Public Ministry', style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold)),
              subtitle: const Text(
                'Open access for seekers without church affiliation. Can later be assigned to a nearby church.',
                style: TextStyle(fontSize: 12),
              ),
              value: _isPublicMinistry,
              activeThumbColor: VopColors.gold,
              onChanged: (val) => setState(() => _isPublicMinistry = val),
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
                onPressed: _loading ? null : _submit,
                child: _loading
                    ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
                    : const Text('Provision Entity', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
