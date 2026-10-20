import 'dart:async';
import 'package:flutter/material.dart';
import '../core/vop_api.dart';
import '../theme/vop_theme.dart';
import '../widgets/vop_ui.dart';

class InstitutionFinderSheet extends StatefulWidget {
  const InstitutionFinderSheet({
    required this.api,
    this.currentOrganizationId = '',
    required this.onJoined,
    super.key,
  });

  final VopApi api;
  final String currentOrganizationId;
  final VoidCallback onJoined;

  @override
  State<InstitutionFinderSheet> createState() => _InstitutionFinderSheetState();
}

class _InstitutionFinderSheetState extends State<InstitutionFinderSheet> {
  late Future<Map<String, dynamic>> _directoryFuture;
  String _search = '';
  String? _joiningId;
  final TextEditingController _searchController = TextEditingController();
  final List<Map<String, dynamic>> _additionalOrganizations = [];
  Timer? _searchDebounce;
  int _directoryRevision = 0;
  bool _loadedAdditionalPages = false;
  bool _loadingMore = false;
  bool _hasMore = false;
  String _nextCursor = '';
  String? _pageError;

  @override
  void initState() {
    super.initState();
    _reload();
  }

  void _reload() {
    _searchDebounce?.cancel();
    _directoryRevision++;
    setState(() {
      _additionalOrganizations.clear();
      _loadedAdditionalPages = false;
      _loadingMore = false;
      _hasMore = false;
      _nextCursor = '';
      _pageError = null;
      _directoryFuture = widget.api.publicOrganizations(
        search: _search,
        cursor: '',
      );
    });
  }

  void _searchChanged(String value) {
    final next = value.trim().toLowerCase();
    if (next == _search) return;
    setState(() => _search = next);
    _searchDebounce?.cancel();
    _searchDebounce = Timer(const Duration(milliseconds: 350), _reload);
  }

  Future<void> _loadMore(String cursor) async {
    if (_loadingMore || cursor.isEmpty) return;
    final revision = _directoryRevision;
    setState(() {
      _loadingMore = true;
      _pageError = null;
    });
    try {
      final page = await widget.api.publicOrganizations(
        search: _search,
        cursor: cursor,
      );
      if (!mounted || revision != _directoryRevision) return;
      setState(() {
        _loadedAdditionalPages = true;
        _additionalOrganizations.addAll(
          (page['items'] as List? ?? [])
              .whereType<Map>()
              .map((item) => Map<String, dynamic>.from(item)),
        );
        _hasMore = page['hasMore'] == true;
        _nextCursor = (page['nextCursor'] ?? '').toString();
      });
    } catch (e) {
      if (mounted && revision == _directoryRevision) {
        setState(() => _pageError = 'Could not load more institutions: $e');
      }
    } finally {
      if (mounted && revision == _directoryRevision) {
        setState(() => _loadingMore = false);
      }
    }
  }

  @override
  void dispose() {
    _searchDebounce?.cancel();
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _join(Map<String, dynamic> org) async {
    final orgId = (org['id'] ?? '').toString();
    final orgName = (org['name'] ?? 'Institution').toString();
    if (orgId.isEmpty) return;

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(org['isPublicMinistry'] == true ? 'Join Public Ministry?' : 'Join Local Church?'),
        content: Text(
          org['isPublicMinistry'] == true
              ? 'Join the Voice of Prophecy Public Open Ministry to study Bible lessons freely. You can connect with a local church congregation anytime.'
              : 'Connect your study account to "$orgName". Mentors and church leaders can encourage your Bible learning journey.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(
              backgroundColor: VopColors.gold,
              foregroundColor: VopColors.navyDeep,
            ),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Confirm & Join'),
          ),
        ],
      ),
    );

    if (confirmed != true) return;

    setState(() => _joiningId = orgId);
    try {
      await widget.api.joinInstitution(orgId);
      if (mounted) {
        Navigator.pop(context);
        widget.onJoined();
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Successfully connected to $orgName! Welcome.'),
            backgroundColor: Colors.teal.shade800,
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        setState(() => _joiningId = null);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Could not join: $e'),
            backgroundColor: Colors.red.shade800,
          ),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      constraints: BoxConstraints(
        maxHeight: MediaQuery.of(context).size.height * 0.88,
      ),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Center(
            child: Container(
              margin: const EdgeInsets.only(top: 12, bottom: 8),
              width: 44,
              height: 4,
              decoration: BoxDecoration(
                color: Colors.grey.withAlpha(80),
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 12),
            child: Row(
              children: [
                const Icon(Icons.church_outlined, color: VopColors.gold, size: 28),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'Find Your Church or Ministry',
                        style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900),
                      ),
                      Text(
                        'Search and join an institution or study via open public ministry',
                        style: TextStyle(
                          fontSize: 12,
                          color: Theme.of(context).colorScheme.onSurface.withAlpha(160),
                        ),
                      ),
                    ],
                  ),
                ),
                IconButton(
                  icon: const Icon(Icons.close),
                  onPressed: () => Navigator.pop(context),
                ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 4),
            child: TextField(
              controller: _searchController,
              decoration: InputDecoration(
                hintText: 'Search church name, school, city or country...',
                prefixIcon: const Icon(Icons.search, size: 20),
                suffixIcon: _search.isNotEmpty
                    ? IconButton(
                        icon: const Icon(Icons.clear, size: 18),
                        onPressed: () {
                          _searchController.clear();
                          _searchChanged('');
                        },
                      )
                    : null,
                contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
              ),
              onChanged: _searchChanged,
            ),
          ),
          const SizedBox(height: 8),
          Expanded(
            child: FutureBuilder<Map<String, dynamic>>(
              future: _directoryFuture,
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
                          const Icon(Icons.wifi_off, color: Colors.amber, size: 40),
                          const SizedBox(height: 12),
                          Text('Could not load institution directory: ${snapshot.error}',
                              textAlign: TextAlign.center),
                          const SizedBox(height: 12),
                          ElevatedButton(onPressed: _reload, child: const Text('Retry')),
                        ],
                      ),
                    ),
                  );
                }

                final rawItems = snapshot.data?['items'] as List? ?? [];
                final allOrgs = [
                  ...rawItems.whereType<Map>()
                      .map((e) => Map<String, dynamic>.from(e)),
                  ..._additionalOrganizations,
                ];
                final hasMore = _loadedAdditionalPages
                    ? _hasMore
                    : snapshot.data?['hasMore'] == true;
                final nextCursor = _loadedAdditionalPages
                    ? _nextCursor
                    : (snapshot.data?['nextCursor'] ?? '').toString();

                final publicMinistries = allOrgs
                    .where((o) => o['isPublicMinistry'] == true)
                    .toList();

                var churches = allOrgs
                    .where((o) => o['isPublicMinistry'] != true)
                    .toList();

                if (_search.isNotEmpty) {
                  churches = churches.where((o) {
                    final name = (o['name'] ?? '').toString().toLowerCase();
                    final slug = (o['slug'] ?? '').toString().toLowerCase();
                    final country = (o['billingCountry'] ?? '').toString().toLowerCase();
                    final type = (o['organizationType'] ?? '').toString().toLowerCase();
                    return name.contains(_search) ||
                        slug.contains(_search) ||
                        country.contains(_search) ||
                        type.contains(_search) || (o['city'] ?? '').toString().toLowerCase().contains(_search);
                  }).toList();
                }

                return ListView(
                  padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
                  children: [
                    // Super Admin Public Ministry Section
                    if (_search.isEmpty && publicMinistries.isNotEmpty) ...[
                      const Row(
                        children: [
                          Icon(Icons.public, color: VopColors.gold, size: 18),
                          SizedBox(width: 8),
                          Text(
                            'SUPER ADMIN PUBLIC ACCESS MINISTRY',
                            style: TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w800,
                              letterSpacing: 1.1,
                              color: VopColors.gold,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 8),
                      ...publicMinistries.map((ministry) => _buildPublicMinistryCard(ministry)),
                      const SizedBox(height: 20),
                      const Divider(height: 1),
                      const SizedBox(height: 16),
                    ],

                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const Text(
                          'LOCAL CHURCHES & INSTITUTIONS',
                          style: TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w800,
                            letterSpacing: 1.1,
                            color: Colors.grey,
                          ),
                        ),
                        Text(
                          '${churches.length} shown',
                          style: const TextStyle(fontSize: 11, color: Colors.grey),
                        ),
                      ],
                    ),
                    const SizedBox(height: 10),

                    if (churches.isEmpty)
                      Padding(
                        padding: const EdgeInsets.all(32),
                        child: Column(
                          children: [
                            const Icon(Icons.church_outlined, size: 44, color: Colors.grey),
                            const SizedBox(height: 10),
                            Text(
                              _search.isEmpty
                                  ? 'No local churches currently listed.'
                                  : 'No institutions matching "$_search".',
                              textAlign: TextAlign.center,
                              style: const TextStyle(fontWeight: FontWeight.w600),
                            ),
                            const SizedBox(height: 4),
                            Text(
                              publicMinistries.isNotEmpty
                                  ? 'You can join the VOP Public Ministry above to study immediately.'
                                  : 'Please check back soon or search using another keyword.',
                              textAlign: TextAlign.center,
                              style: const TextStyle(fontSize: 12, color: Colors.grey),
                            ),
                          ],
                        ),
                      )
                    else
                      ...churches.map((church) => _buildChurchCard(church)),
                    if (_pageError != null)
                      Padding(
                        padding: const EdgeInsets.symmetric(vertical: 8),
                        child: Text(_pageError!, style: TextStyle(
                          color: Theme.of(context).colorScheme.error,
                        )),
                      ),
                    if (hasMore && nextCursor.isNotEmpty)
                      Padding(
                        padding: const EdgeInsets.symmetric(vertical: 12),
                        child: OutlinedButton.icon(
                          onPressed: _loadingMore ? null : () => _loadMore(nextCursor),
                          icon: _loadingMore
                              ? const SizedBox(width: 16, height: 16,
                                  child: CircularProgressIndicator(strokeWidth: 2))
                              : const Icon(Icons.expand_more),
                          label: Text(_loadingMore
                              ? 'Loading institutions...'
                              : 'Load more institutions'),
                        ),
                      ),
                  ],
                );
              },
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildPublicMinistryCard(Map<String, dynamic> ministry) {
    final id = (ministry['id'] ?? '').toString();
    final name = (ministry['name'] ?? 'VOP Public Access Ministry').toString();
    final isCurrent = widget.currentOrganizationId == id;
    final isBusy = _joiningId == id;

    return Container(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [
            VopColors.navyDeep,
            VopColors.navyBright,
          ],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: VopColors.gold.withAlpha(120), width: 1.2),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withAlpha(40),
            blurRadius: 10,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: VopColors.gold.withAlpha(40),
                  shape: BoxShape.circle,
                ),
                child: const Icon(Icons.explore_rounded, color: VopColors.gold, size: 22),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      name,
                      style: const TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w900,
                        color: Colors.white,
                      ),
                    ),
                    const SizedBox(height: 2),
                    const Text(
                      'Free Word of God Access • For All Seekers',
                      style: TextStyle(
                        fontSize: 11.5,
                        fontWeight: FontWeight.w600,
                        color: VopColors.gold,
                      ),
                    ),
                  ],
                ),
              ),
              if (isCurrent)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: Colors.green.withAlpha(50),
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(color: Colors.green),
                  ),
                  child: const Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.check, size: 14, color: Colors.green),
                      SizedBox(width: 4),
                      Text('Active', style: TextStyle(color: Colors.green, fontSize: 11, fontWeight: FontWeight.bold)),
                    ],
                  ),
                ),
            ],
          ),
          const SizedBox(height: 10),
          const Text(
            'Study all lessons and courses directly. Perfect for anyone not yet attached to a local congregation. Administrators can also connect you with a church near you when you are ready.',
            style: TextStyle(fontSize: 12.5, color: Colors.white70, height: 1.35),
          ),
          const SizedBox(height: 14),
          SizedBox(
            width: double.infinity,
            child: FilledButton.icon(
              style: FilledButton.styleFrom(
                backgroundColor: isCurrent ? Colors.white24 : VopColors.gold,
                foregroundColor: isCurrent ? Colors.white : VopColors.navyDeep,
                padding: const EdgeInsets.symmetric(vertical: 11),
              ),
              icon: isBusy
                  ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
                  : Icon(isCurrent ? Icons.check_circle_outline : Icons.login_rounded, size: 18),
              label: Text(
                isCurrent
                    ? 'Current Open Study Ministry'
                    : 'Join Open Access Ministry',
                style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 13.5),
              ),
              onPressed: (isCurrent || isBusy) ? null : () => _join(ministry),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildChurchCard(Map<String, dynamic> church) {
    final id = (church['id'] ?? '').toString();
    final name = (church['name'] ?? 'Church').toString();
    final type = (church['organizationType'] ?? 'church').toString();
    final country = (church['billingCountry'] ?? '').toString();
    final isCurrent = widget.currentOrganizationId == id;
    final isBusy = _joiningId == id;

    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: VopCard(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
          child: Row(
            children: [
              CircleAvatar(
                backgroundColor: VopColors.gold.withAlpha(35),
                child: const Icon(Icons.church_outlined, color: VopColors.gold, size: 20),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      name,
                      style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      '${type.toUpperCase().replaceAll('_', ' ')} • $country',
                      style: const TextStyle(fontSize: 11.5, color: Colors.grey),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              if (isCurrent)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                  decoration: BoxDecoration(
                    color: Colors.green.withAlpha(30),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: const Text('Enrolled', style: TextStyle(color: Colors.green, fontSize: 11, fontWeight: FontWeight.w700)),
                )
              else
                FilledButton.tonal(
                  style: FilledButton.styleFrom(
                    visualDensity: VisualDensity.compact,
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                  ),
                  onPressed: isBusy ? null : () => _join(church),
                  child: isBusy
                      ? const SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2))
                      : const Text('Join', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 12.5)),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
