import 'package:flutter/material.dart';
import '../core/vop_api.dart';
import '../theme/vop_theme.dart';
import '../widgets/vop_ui.dart';

class CandidatesScreen extends StatefulWidget {
  const CandidatesScreen({required this.api, this.organizationId, super.key});
  final VopApi api;
  final String? organizationId;

  @override
  State<CandidatesScreen> createState() => _CandidatesScreenState();
}

class _CandidatesScreenState extends State<CandidatesScreen> {
  late Future<Map<String, dynamic>> _candidatesFuture;
  late Future<Map<String, dynamic>> _catalogFuture;
  String _searchQuery = '';
  String _filter = 'all';

  @override
  void initState() {
    super.initState();
    _reload();
  }

  void _reload() {
    setState(() {
      _candidatesFuture = widget.api.adminCandidates(
        organizationId: widget.organizationId,
        search: _searchQuery.isEmpty ? null : _searchQuery,
      );
      _catalogFuture = widget.api.catalogue().catchError((_) => <String, dynamic>{'guides': []});
    });
  }

  void _openEnrollDialog(List<Map<String, dynamic>> guides) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => _EnrollCandidateSheet(
        api: widget.api,
        organizationId: widget.organizationId,
        guides: guides,
        onEnrolled: _reload,
      ),
    );
  }

  void _openCandidateDetails(Map<String, dynamic> candidate) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => _CandidateDetailSheet(
        api: widget.api,
        organizationId: widget.organizationId,
        candidate: candidate,
        onUpdated: _reload,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Candidates & Roster', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 18)),
        actions: [
          IconButton(
            tooltip: 'Refresh roster',
            icon: const Icon(Icons.refresh_rounded),
            onPressed: _reload,
          ),
          const SizedBox(width: 6),
        ],
      ),
      floatingActionButton: FutureBuilder<Map<String, dynamic>>(
        future: _catalogFuture,
        builder: (context, snapshot) {
          final guides = (snapshot.data?['guides'] as List?)
                  ?.whereType<Map>()
                  .map((e) => Map<String, dynamic>.from(e))
                  .toList() ??
              [];
          return FloatingActionButton.extended(
            backgroundColor: VopColors.gold,
            foregroundColor: VopColors.navyDeep,
            icon: const Icon(Icons.person_add_alt_1),
            label: const Text('Enroll Candidate', style: TextStyle(fontWeight: FontWeight.w800)),
            onPressed: () => _openEnrollDialog(guides),
          );
        },
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
            child: TextField(
              decoration: InputDecoration(
                hintText: 'Search candidate name, email or phone...',
                prefixIcon: const Icon(Icons.search, size: 20),
                suffixIcon: _searchQuery.isNotEmpty
                    ? IconButton(
                        icon: const Icon(Icons.clear, size: 18),
                        onPressed: () {
                          setState(() => _searchQuery = '');
                          _reload();
                        },
                      )
                    : null,
                contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
              ),
              onChanged: (val) {
                _searchQuery = val.trim();
                _reload();
              },
            ),
          ),
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
            child: Row(
              children: [
                _filterChip('all', 'All Candidates'),
                const SizedBox(width: 8),
                _filterChip('unassigned', 'Public / Unassigned'),
                const SizedBox(width: 8),
                _filterChip('active', 'Active Learners'),
                const SizedBox(width: 8),
                _filterChip('graduating', 'Graduating'),
                const SizedBox(width: 8),
                _filterChip('baptism_scheduled', 'Baptism Scheduled'),
                const SizedBox(width: 8),
                _filterChip('baptized', 'Baptized'),
              ],
            ),
          ),
          const Divider(height: 16),
          Expanded(
            child: FutureBuilder<Map<String, dynamic>>(
              future: _candidatesFuture,
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
                          Text('Could not load candidates: ${snapshot.error}', textAlign: TextAlign.center),
                          const SizedBox(height: 12),
                          ElevatedButton(onPressed: _reload, child: const Text('Retry')),
                        ],
                      ),
                    ),
                  );
                }

                final rawList = snapshot.data?['items'] ?? snapshot.data?['candidates'] ?? [];
                var candidates = (rawList as List)
                    .whereType<Map>()
                    .map((e) => Map<String, dynamic>.from(e))
                    .toList();

                if (_filter != 'all') {
                  candidates = candidates.where((c) {
                    final info = c['information'] is Map ? c['information'] as Map<String, dynamic> : <String, dynamic>{};
                    if (_filter == 'unassigned') {
                      final orgId = (c['organizationId'] ?? '').toString().trim();
                      final isPublic = c['isPublicMinistry'] == true || (c['organizationName'] ?? '').toString().toLowerCase().contains('public');
                      return orgId.isEmpty || isPublic;
                    }
                    if (_filter == 'graduating') return info['graduating'] == true;
                    if (_filter == 'baptism_scheduled') return info['baptismCandidate'] == true && info['baptized'] != true;
                    if (_filter == 'baptized') return info['baptized'] == true;
                    if (_filter == 'active') return c['disabled'] != true;
                    return true;
                  }).toList();
                }

                if (candidates.isEmpty) {
                  return const Center(
                    child: Padding(
                      padding: EdgeInsets.all(32),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(Icons.people_outline, size: 48, color: Colors.grey),
                          SizedBox(height: 12),
                          Text('No candidates match the filter.', style: TextStyle(fontWeight: FontWeight.w600)),
                          SizedBox(height: 4),
                          Text('Tap "Enroll Candidate" to add a new learner.', style: TextStyle(color: Colors.grey, fontSize: 13)),
                        ],
                      ),
                    ),
                  );
                }

                return ListView.separated(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 90),
                  itemCount: candidates.length,
                  separatorBuilder: (_, __) => const SizedBox(height: 8),
                  itemBuilder: (context, index) {
                    final c = candidates[index];
                    final displayName = (c['displayName'] ?? c['name'] ?? 'Unnamed Candidate').toString();
                    final email = (c['email'] ?? '').toString();
                    final phone = (c['phoneNumber'] ?? '').toString();
                    final orgName = (c['organizationName'] ?? '').toString();
                    final info = c['information'] is Map ? c['information'] as Map<String, dynamic> : <String, dynamic>{};
                    final isBaptized = info['baptized'] == true;
                    final isScheduled = info['baptismCandidate'] == true && !isBaptized;

                    return VopCard(
                      child: ListTile(
                        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
                        leading: CircleAvatar(
                          backgroundColor: isBaptized ? Colors.teal.withAlpha(40) : Theme.of(context).colorScheme.primaryContainer,
                          child: Icon(
                            isBaptized ? Icons.water_drop : Icons.person,
                            color: isBaptized ? Colors.teal : Theme.of(context).colorScheme.primary,
                            size: 20,
                          ),
                        ),
                        title: Row(
                          children: [
                            Expanded(child: Text(displayName, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14.5))),
                            if (isBaptized)
                              _statusTag('Baptized', Colors.teal)
                            else if (isScheduled)
                              _statusTag('Scheduled', Colors.blue)
                            else if (info['graduating'] == true)
                              _statusTag('Graduating', Colors.amber),
                          ],
                        ),
                        subtitle: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const SizedBox(height: 2),
                            Text(email.isNotEmpty ? email : phone, style: const TextStyle(fontSize: 12.5)),
                            if (orgName.isNotEmpty) ...[
                              const SizedBox(height: 2),
                              Text(orgName, style: TextStyle(fontSize: 11.5, color: Theme.of(context).colorScheme.primary)),
                            ],
                          ],
                        ),
                        trailing: const Icon(Icons.chevron_right, size: 18),
                        onTap: () => _openCandidateDetails(c),
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

  Widget _filterChip(String key, String label) {
    final isSelected = _filter == key;
    return ChoiceChip(
      selected: isSelected,
      label: Text(label, style: TextStyle(fontSize: 12, fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500)),
      selectedColor: VopColors.gold.withAlpha(50),
      onSelected: (_) => setState(() => _filter = key),
    );
  }

  Widget _statusTag(String label, Color color) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: color.withAlpha(35),
        borderRadius: BorderRadius.circular(4),
      ),
      child: Text(
        label,
        style: TextStyle(color: color, fontSize: 10, fontWeight: FontWeight.w800),
      ),
    );
  }
}

class _EnrollCandidateSheet extends StatefulWidget {
  const _EnrollCandidateSheet({
    required this.api,
    this.organizationId,
    required this.guides,
    required this.onEnrolled,
  });
  final VopApi api;
  final String? organizationId;
  final List<Map<String, dynamic>> guides;
  final VoidCallback onEnrolled;

  @override
  State<_EnrollCandidateSheet> createState() => _EnrollCandidateSheetState();
}

class _EnrollCandidateSheetState extends State<_EnrollCandidateSheet> {
  final _nameCtrl = TextEditingController();
  final _emailCtrl = TextEditingController();
  final _phoneCtrl = TextEditingController();
  final _passCtrl = TextEditingController(text: 'VOP@2026');
  String? _selectedGuideId;
  bool _loading = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    if (widget.guides.isNotEmpty) {
      _selectedGuideId = widget.guides.first['id']?.toString();
    }
  }

  Future<void> _submit() async {
    final name = _nameCtrl.text.trim();
    final email = _emailCtrl.text.trim().toLowerCase();
    if (name.isEmpty || email.isEmpty) {
      setState(() => _error = 'Candidate full name and email are required.');
      return;
    }
    if (_selectedGuideId == null || _selectedGuideId!.isEmpty) {
      setState(() => _error = 'Select a study course for enrollment.');
      return;
    }

    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      await widget.api.enrollCandidate(
        displayName: name,
        email: email,
        guideId: _selectedGuideId!,
        organizationId: widget.organizationId,
        phoneNumber: _phoneCtrl.text.trim().isEmpty ? null : _phoneCtrl.text.trim(),
        password: _passCtrl.text.trim().isEmpty ? null : _passCtrl.text.trim(),
      );
      if (mounted) {
        Navigator.of(context).pop();
        widget.onEnrolled();
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Candidate $name successfully enrolled!'), backgroundColor: Colors.teal),
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
                Icon(Icons.person_add, color: VopColors.gold),
                SizedBox(width: 8),
                Text('Enroll New Candidate', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
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
              decoration: const InputDecoration(labelText: 'Candidate Full Name *', border: OutlineInputBorder()),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _emailCtrl,
              keyboardType: TextInputType.emailAddress,
              decoration: const InputDecoration(labelText: 'Email Address *', border: OutlineInputBorder()),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _phoneCtrl,
              keyboardType: TextInputType.phone,
              decoration: const InputDecoration(labelText: 'Phone Number (optional)', border: OutlineInputBorder()),
            ),
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
              initialValue: _selectedGuideId,
              decoration: const InputDecoration(labelText: 'Enroll In Course / Guide *', border: OutlineInputBorder()),
              items: widget.guides.map((g) {
                return DropdownMenuItem<String>(
                  value: g['id'].toString(),
                  child: Text(g['title']?.toString() ?? 'Course', overflow: TextOverflow.ellipsis),
                );
              }).toList(),
              onChanged: (val) => setState(() => _selectedGuideId = val),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _passCtrl,
              decoration: const InputDecoration(labelText: 'Temporary Password', border: OutlineInputBorder()),
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
                    : const Text('Complete Enrollment', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _CandidateDetailSheet extends StatefulWidget {
  const _CandidateDetailSheet({
    required this.api,
    this.organizationId,
    required this.candidate,
    required this.onUpdated,
  });
  final VopApi api;
  final String? organizationId;
  final Map<String, dynamic> candidate;
  final VoidCallback onUpdated;

  @override
  State<_CandidateDetailSheet> createState() => _CandidateDetailSheetState();
}

class _CandidateDetailSheetState extends State<_CandidateDetailSheet> {
  bool _loading = false;

  Future<void> _setBaptismStatus(String status) async {
    final candidateId = (widget.candidate['uid'] ?? widget.candidate['id'] ?? '').toString();
    setState(() => _loading = true);
    try {
      await widget.api.updateCandidateBaptism(
        candidateId: candidateId,
        baptismStatus: status,
        organizationId: widget.organizationId,
      );
      if (mounted) {
        Navigator.of(context).pop();
        widget.onUpdated();
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Baptism milestone updated: $status'), backgroundColor: Colors.teal),
        );
      }
    } catch (e) {
      if (mounted) {
        setState(() => _loading = false);
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Error: $e')));
      }
    }
  }

  Future<void> _confirmDelete() async {
    final candidateId = (widget.candidate['uid'] ?? widget.candidate['id'] ?? '').toString();
    final name = (widget.candidate['displayName'] ?? 'Candidate').toString();
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete Candidate?'),
        content: Text('Are you sure you want to remove $name? This removes access to their study records.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          TextButton(
            style: TextButton.styleFrom(foregroundColor: Colors.red),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );

    if (confirmed == true) {
      setState(() => _loading = true);
      try {
        await widget.api.deleteCandidate(candidateId, organizationId: widget.organizationId);
        if (mounted) {
          Navigator.of(context).pop();
          widget.onUpdated();
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('$name removed from candidate roster.')),
          );
        }
      } catch (e) {
        if (mounted) {
          setState(() => _loading = false);
          ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Delete error: $e')));
        }
      }
    }
  }

  Future<void> _showAssignChurchDialog() async {
    final candidateId = (widget.candidate['uid'] ?? widget.candidate['id'] ?? '').toString();
    final candidateName = (widget.candidate['displayName'] ?? widget.candidate['name'] ?? 'Candidate').toString();

    final selected = await showDialog<Map<String, dynamic>>(
      context: context,
      builder: (ctx) => _AssignChurchDialog(api: widget.api),
    );

    if (selected == null) return;
    final orgId = (selected['id'] ?? '').toString();
    final orgName = (selected['name'] ?? orgId).toString();

    setState(() => _loading = true);
    try {
      await widget.api.updateCandidate(
        candidateId: candidateId,
        organizationId: orgId,
        churchName: orgName,
        churchId: orgId,
      );
      if (mounted) {
        Navigator.of(context).pop();
        widget.onUpdated();
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('$candidateName successfully assigned to $orgName!'),
            backgroundColor: Colors.teal.shade800,
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        setState(() => _loading = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Could not assign candidate: $e')),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = widget.candidate;
    final name = (c['displayName'] ?? c['name'] ?? 'Candidate').toString();
    final email = (c['email'] ?? '').toString();
    final phone = (c['phoneNumber'] ?? 'None').toString();
    final org = (c['organizationName'] ?? c['churchName'] ?? 'Public / Unassigned').toString();
    final info = c['information'] is Map ? c['information'] as Map<String, dynamic> : <String, dynamic>{};
    final isBaptized = info['baptized'] == true;
    final isScheduled = info['baptismCandidate'] == true && !isBaptized;

    return Container(
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
                radius: 24,
                backgroundColor: VopColors.gold.withAlpha(40),
                child: const Icon(Icons.person, color: VopColors.gold, size: 28),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(name, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w900)),
                    Text(email, style: const TextStyle(fontSize: 13, color: Colors.grey)),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 18),
          _detailRow('Current Church / Org', org),
          _detailRow('Phone Number', phone),
          _detailRow('Baptism Status', isBaptized ? 'Baptized' : isScheduled ? 'Scheduled' : 'Not marked'),
          const SizedBox(height: 16),
          const Text('CONGREGATIONAL ASSIGNMENT', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: VopColors.gold)),
          const SizedBox(height: 8),
          SizedBox(
            width: double.infinity,
            child: OutlinedButton.icon(
              icon: const Icon(Icons.church_outlined, size: 16),
              label: const Text('Assign to Local Church / Transfer'),
              onPressed: _loading ? null : _showAssignChurchDialog,
            ),
          ),
          const SizedBox(height: 16),
          const Text('DISCIPLESHIP MILESTONES', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: VopColors.gold)),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  icon: const Icon(Icons.event, size: 16),
                  label: const Text('Schedule Baptism'),
                  onPressed: _loading ? null : () => _setBaptismStatus('scheduled'),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: ElevatedButton.icon(
                  style: ElevatedButton.styleFrom(backgroundColor: Colors.teal, foregroundColor: Colors.white),
                  icon: const Icon(Icons.water_drop, size: 16),
                  label: const Text('Mark Baptized'),
                  onPressed: _loading ? null : () => _setBaptismStatus('baptized'),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          SizedBox(
            width: double.infinity,
            child: TextButton.icon(
              style: TextButton.styleFrom(foregroundColor: Colors.red),
              icon: const Icon(Icons.delete_outline, size: 18),
              label: const Text('Delete Candidate Account'),
              onPressed: _loading ? null : _confirmDelete,
            ),
          ),
        ],
      ),
    );
  }

  Widget _detailRow(String label, String value) {
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
}

class _AssignChurchDialog extends StatefulWidget {
  const _AssignChurchDialog({required this.api});
  final VopApi api;

  @override
  State<_AssignChurchDialog> createState() => _AssignChurchDialogState();
}

class _AssignChurchDialogState extends State<_AssignChurchDialog> {
  late Future<Map<String, dynamic>> _orgsFuture;
  String _search = '';

  @override
  void initState() {
    super.initState();
    _orgsFuture = widget.api.publicOrganizations();
  }

  @override
  Widget build(BuildContext context) {
    return Dialog(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 480, maxHeight: 560),
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Row(
                children: [
                  Icon(Icons.church_outlined, color: VopColors.gold, size: 24),
                  SizedBox(width: 8),
                  Text('Assign to Local Church', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
                ],
              ),
              const SizedBox(height: 6),
              const Text(
                'Connect this candidate to a local Seventh-day Adventist church congregation so local pastors and mentors can disciple them.',
                style: TextStyle(fontSize: 12, color: Colors.grey),
              ),
              const SizedBox(height: 12),
              TextField(
                decoration: InputDecoration(
                  hintText: 'Search church name or location...',
                  prefixIcon: const Icon(Icons.search, size: 20),
                  contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
                ),
                onChanged: (val) => setState(() => _search = val.trim().toLowerCase()),
              ),
              const SizedBox(height: 12),
              Expanded(
                child: FutureBuilder<Map<String, dynamic>>(
                  future: _orgsFuture,
                  builder: (context, snapshot) {
                    if (snapshot.connectionState == ConnectionState.waiting) {
                      return const Center(child: CircularProgressIndicator());
                    }
                    if (snapshot.hasError) {
                      return Center(child: Text('Error: ${snapshot.error}'));
                    }
                    final raw = snapshot.data?['items'] as List? ?? [];
                    var orgs = raw
                        .whereType<Map>()
                        .map((e) => Map<String, dynamic>.from(e))
                        .toList();

                    if (_search.isNotEmpty) {
                      orgs = orgs.where((o) {
                        final name = (o['name'] ?? '').toString().toLowerCase();
                        final country = (o['billingCountry'] ?? '').toString().toLowerCase();
                        return name.contains(_search) || country.contains(_search);
                      }).toList();
                    }

                    if (orgs.isEmpty) {
                      return const Center(child: Text('No churches match search.'));
                    }

                    return ListView.separated(
                      itemCount: orgs.length,
                      separatorBuilder: (_, __) => const Divider(height: 1),
                      itemBuilder: (context, i) {
                        final o = orgs[i];
                        final name = (o['name'] ?? 'Church').toString();
                        final type = (o['organizationType'] ?? 'church').toString();
                        final country = (o['billingCountry'] ?? 'Zambia').toString();
                        final isPublic = o['isPublicMinistry'] == true;

                        return ListTile(
                          dense: true,
                          leading: Icon(isPublic ? Icons.public : Icons.church, color: VopColors.gold, size: 20),
                          title: Text(name, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13.5)),
                          subtitle: Text('${isPublic ? 'Public Ministry' : type.toUpperCase()} • $country', style: const TextStyle(fontSize: 11)),
                          trailing: const Icon(Icons.arrow_forward_ios, size: 14),
                          onTap: () => Navigator.pop(context, o),
                        );
                      },
                    );
                  },
                ),
              ),
              const SizedBox(height: 8),
              Align(
                alignment: Alignment.centerRight,
                child: TextButton(
                  onPressed: () => Navigator.pop(context),
                  child: const Text('Cancel'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
