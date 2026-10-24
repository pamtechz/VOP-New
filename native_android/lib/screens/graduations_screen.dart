import 'package:flutter/material.dart';
import '../core/vop_api.dart';
import '../theme/vop_theme.dart';
import '../widgets/vop_ui.dart';
import '../widgets/vop_desktop_layout.dart';

class GraduationsScreen extends StatefulWidget {
  const GraduationsScreen({required this.api, this.organizationId, super.key});
  final VopApi api;
  final String? organizationId;

  @override
  State<GraduationsScreen> createState() => _GraduationsScreenState();
}

class _GraduationsScreenState extends State<GraduationsScreen> {
  late Future<Map<String, dynamic>> _graduationsFuture;
  String _filter = 'pending';

  @override
  void initState() {
    super.initState();
    _reload();
  }

  void _reload() {
    setState(() {
      _graduationsFuture = widget.api.adminGraduations(
        organizationId: widget.organizationId,
        status: _filter == 'all' ? null : _filter,
      );
    });
  }

  void _openReviewSheet(Map<String, dynamic> request) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => _ReviewGraduationSheet(
        api: widget.api,
        request: request,
        onDecided: _reload,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Graduation Approvals', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 18)),
        actions: [
          IconButton(
            tooltip: 'Refresh queue',
            icon: const Icon(Icons.refresh_rounded),
            onPressed: _reload,
          ),
          const SizedBox(width: 6),
        ],
      ),
      body: VopDesktopWorkspaceFrame(api: widget.api, child: Column(
        children: [
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
            child: Row(
              children: [
                _filterChip('pending', 'Pending Review'),
                const SizedBox(width: 8),
                _filterChip('approved', 'Approved & Issued'),
                const SizedBox(width: 8),
                _filterChip('rejected', 'Rejected'),
                const SizedBox(width: 8),
                _filterChip('all', 'All Submissions'),
              ],
            ),
          ),
          const Divider(height: 1),
          Expanded(
            child: FutureBuilder<Map<String, dynamic>>(
              future: _graduationsFuture,
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
                          Text('Failed to load graduation requests: ${snapshot.error}', textAlign: TextAlign.center),
                          const SizedBox(height: 12),
                          ElevatedButton(onPressed: _reload, child: const Text('Retry')),
                        ],
                      ),
                    ),
                  );
                }

                final rawList = snapshot.data?['items'] ?? snapshot.data?['requests'] ?? [];
                final requests = (rawList as List)
                    .whereType<Map>()
                    .map((e) => Map<String, dynamic>.from(e))
                    .toList();

                if (requests.isEmpty) {
                  return Center(
                    child: Padding(
                      padding: const EdgeInsets.all(32),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Icon(Icons.school_outlined, size: 48, color: Colors.grey),
                          const SizedBox(height: 12),
                          Text('No graduation requests in ${_filter.replaceAll('_', ' ')} status.',
                              style: const TextStyle(fontWeight: FontWeight.w600)),
                          const SizedBox(height: 4),
                          const Text('Candidate course completion reviews will appear here.',
                              style: TextStyle(color: Colors.grey, fontSize: 13)),
                        ],
                      ),
                    ),
                  );
                }

                return ListView.separated(
                  padding: const EdgeInsets.all(16),
                  itemCount: requests.length,
                  separatorBuilder: (_, __) => const SizedBox(height: 10),
                  itemBuilder: (context, index) {
                    final req = requests[index];
                    final candidateName = (req['candidateName'] ?? 'Candidate').toString();
                    final guideTitle = (req['guideTitle'] ?? req['programTitle'] ?? 'Bible Course').toString();
                    final score = (req['averageScore'] ?? 0);
                    final scoreNum = score is num ? score.toDouble() : double.tryParse(score.toString()) ?? 0.0;
                    final status = (req['status'] ?? 'pending').toString();
                    final stageId = (req['workflowStageId'] ?? '').toString();

                    final isApproved = status == 'approved';
                    final isRejected = status == 'rejected';

                    return VopCard(
                      child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                CircleAvatar(
                                  backgroundColor: isApproved
                                      ? Colors.green.withAlpha(35)
                                      : isRejected
                                          ? Colors.red.withAlpha(35)
                                          : VopColors.gold.withAlpha(35),
                                  child: Icon(
                                    isApproved
                                        ? Icons.check
                                        : isRejected
                                            ? Icons.close
                                            : Icons.workspace_premium,
                                    color: isApproved
                                        ? Colors.green
                                        : isRejected
                                            ? Colors.red
                                            : VopColors.gold,
                                    size: 20,
                                  ),
                                ),
                                const SizedBox(width: 12),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text(candidateName, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
                                      Text(guideTitle, style: TextStyle(fontSize: 12.5, color: Theme.of(context).colorScheme.primary)),
                                    ],
                                  ),
                                ),
                                Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                                  decoration: BoxDecoration(
                                    color: scoreNum >= 80 ? Colors.green.withAlpha(30) : Colors.amber.withAlpha(30),
                                    borderRadius: BorderRadius.circular(6),
                                  ),
                                  child: Text(
                                    '${scoreNum.toStringAsFixed(1)}%',
                                    style: TextStyle(
                                      fontWeight: FontWeight.w900,
                                      fontSize: 13,
                                      color: scoreNum >= 80 ? Colors.green : Colors.amber.shade800,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: 12),
                            Row(
                              children: [
                                Icon(Icons.timeline, size: 16, color: Colors.grey.shade600),
                                const SizedBox(width: 6),
                                Text(
                                  'Stage: ${stageId.isNotEmpty ? stageId.toUpperCase() : status.toUpperCase()}',
                                  style: TextStyle(fontSize: 12, color: Colors.grey.shade600, fontWeight: FontWeight.w600),
                                ),
                                const Spacer(),
                                if (!isApproved && !isRejected)
                                  ElevatedButton.icon(
                                    style: ElevatedButton.styleFrom(
                                      backgroundColor: VopColors.gold,
                                      foregroundColor: VopColors.navyDeep,
                                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
                                    ),
                                    icon: const Icon(Icons.rule, size: 16),
                                    label: const Text('Review', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 13)),
                                    onPressed: () => _openReviewSheet(req),
                                  )
                                else
                                  Text(
                                    status.toUpperCase(),
                                    style: TextStyle(
                                      fontSize: 12,
                                      fontWeight: FontWeight.w800,
                                      color: isApproved ? Colors.green : Colors.red,
                                    ),
                                  ),
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
          ),
        ],
      ),
    ));
  }

  Widget _filterChip(String key, String label) {
    final isSelected = _filter == key;
    return ChoiceChip(
      selected: isSelected,
      label: Text(label, style: TextStyle(fontSize: 12, fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500)),
      selectedColor: VopColors.gold.withAlpha(50),
      onSelected: (_) {
        setState(() => _filter = key);
        _reload();
      },
    );
  }
}

class _ReviewGraduationSheet extends StatefulWidget {
  const _ReviewGraduationSheet({required this.api, required this.request, required this.onDecided});
  final VopApi api;
  final Map<String, dynamic> request;
  final VoidCallback onDecided;

  @override
  State<_ReviewGraduationSheet> createState() => _ReviewGraduationSheetState();
}

class _ReviewGraduationSheetState extends State<_ReviewGraduationSheet> {
  final _notesCtrl = TextEditingController();
  bool _loading = false;
  String? _error;

  Future<void> _decide(String decision) async {
    final requestId = (widget.request['id'] ?? '').toString();
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      await widget.api.reviewGraduation(
        requestId: requestId,
        decision: decision,
        notes: _notesCtrl.text.trim().isEmpty ? null : _notesCtrl.text.trim(),
        organizationId: widget.request['organizationId']?.toString(),
      );
      if (mounted) {
        Navigator.pop(context);
        widget.onDecided();
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(decision == 'approve' ? 'Graduation approved! Certificate generated.' : 'Request rejected.'),
            backgroundColor: decision == 'approve' ? Colors.teal : Colors.red,
          ),
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
    final req = widget.request;
    final candidateName = (req['candidateName'] ?? 'Candidate').toString();
    final guideTitle = (req['guideTitle'] ?? req['programTitle'] ?? 'Course').toString();
    final score = req['averageScore'] ?? 0;

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
                const Icon(Icons.rate_review, color: VopColors.gold),
                const SizedBox(width: 8),
                Expanded(
                  child: Text('Review Graduation: $candidateName',
                      style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800)),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Theme.of(context).colorScheme.surfaceContainerHighest.withAlpha(80),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Column(
                children: [
                  _statRow('Curriculum Course', guideTitle),
                  _statRow('Average Score', '$score%'),
                  _statRow('Status', (req['status'] ?? 'pending').toString().toUpperCase()),
                ],
              ),
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
              controller: _notesCtrl,
              maxLines: 2,
              decoration: const InputDecoration(
                labelText: 'Approver Notes / Instructions (optional)',
                hintText: 'e.g. Excellent assessment completion; verified church candidate.',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 18),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    style: OutlinedButton.styleFrom(
                      foregroundColor: Colors.red,
                      side: const BorderSide(color: Colors.red),
                    ),
                    onPressed: _loading ? null : () => _decide('reject'),
                    child: const Text('Reject Submission'),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: ElevatedButton(
                    style: ElevatedButton.styleFrom(
                      backgroundColor: VopColors.gold,
                      foregroundColor: VopColors.navyDeep,
                    ),
                    onPressed: _loading ? null : () => _decide('approve'),
                    child: _loading
                        ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                        : const Text('Approve & Issue', style: TextStyle(fontWeight: FontWeight.w800)),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _statRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: const TextStyle(fontSize: 12.5, color: Colors.grey)),
          Text(value, style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700)),
        ],
      ),
    );
  }
}
