import 'package:flutter/material.dart';
import '../core/vop_api.dart';
import '../theme/vop_theme.dart';
import '../widgets/vop_ui.dart';
import 'mentor_screen.dart';

class MentorWorkspaceScreen extends StatefulWidget {
  const MentorWorkspaceScreen({required this.api, super.key});
  final VopApi api;

  @override
  State<MentorWorkspaceScreen> createState() => _MentorWorkspaceScreenState();
}

class _MentorWorkspaceScreenState extends State<MentorWorkspaceScreen> {
  late Future<Map<String, dynamic>> _workspaceFuture;

  @override
  void initState() {
    super.initState();
    _reload();
  }

  void _reload() {
    setState(() {
      _workspaceFuture = widget.api.mentorWorkspace().catchError((_) => widget.api.mentorCandidates()).catchError((_) => <String, dynamic>{'candidates': []});
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Row(
          children: [
            Icon(Icons.psychology, color: VopColors.gold, size: 22),
            SizedBox(width: 8),
            Text('Mentor Workspace', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 18)),
          ],
        ),
        actions: [
          IconButton(
            tooltip: 'Refresh assigned candidates',
            icon: const Icon(Icons.refresh_rounded),
            onPressed: _reload,
          ),
          const SizedBox(width: 6),
        ],
      ),
      body: FutureBuilder<Map<String, dynamic>>(
        future: _workspaceFuture,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }

          final rawList = snapshot.data?['candidates'] ?? snapshot.data?['items'] ?? [];
          final candidates = (rawList as List)
              .whereType<Map>()
              .map((e) => Map<String, dynamic>.from(e))
              .toList();

          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              _buildMentorHero(),
              const SizedBox(height: 18),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Text(
                    'ASSIGNED CANDIDATES',
                    style: TextStyle(
                      color: VopColors.gold,
                      fontWeight: FontWeight.w800,
                      fontSize: 11,
                      letterSpacing: 1.3,
                    ),
                  ),
                  Text(
                    '${candidates.length} active',
                    style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              if (candidates.isEmpty)
                Center(
                  child: Padding(
                    padding: const EdgeInsets.all(32),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Icon(Icons.group_outlined, size: 48, color: Colors.grey),
                        const SizedBox(height: 12),
                        const Text('No candidates currently assigned.', style: TextStyle(fontWeight: FontWeight.w600)),
                        const SizedBox(height: 4),
                        const Text('When candidates in your church or district start courses, they will appear here.',
                            textAlign: TextAlign.center,
                            style: TextStyle(color: Colors.grey, fontSize: 12.5)),
                        const SizedBox(height: 16),
                        OutlinedButton.icon(
                          icon: const Icon(Icons.forum_outlined, size: 16),
                          label: const Text('Open General Mentoring Chat'),
                          onPressed: () {
                            Navigator.push(
                              context,
                              MaterialPageRoute<void>(
                                builder: (_) => Scaffold(
                                  appBar: AppBar(title: const Text('Mentoring')),
                                  body: MentorScreen(api: widget.api),
                                ),
                              ),
                            );
                          },
                        ),
                      ],
                    ),
                  ),
                )
              else
                ...candidates.map((c) => _buildCandidateCard(c)),
              const SizedBox(height: 30),
            ],
          );
        },
      ),
    );
  }

  Widget _buildMentorHero() {
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
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: VopColors.gold.withAlpha(45),
                  borderRadius: BorderRadius.circular(6),
                ),
                child: const Text(
                  'PASTORAL & DISCIPLESHIP CARE',
                  style: TextStyle(
                    color: VopColors.goldLight,
                    fontWeight: FontWeight.w800,
                    fontSize: 10,
                    letterSpacing: 1.2,
                  ),
                ),
              ),
              const Spacer(),
              const Icon(Icons.psychology_outlined, color: VopColors.goldLight, size: 22),
            ],
          ),
          const SizedBox(height: 10),
          const Text(
            'Candidate Mentorship Center',
            style: TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.w900),
          ),
          const SizedBox(height: 4),
          const Text(
            'Guide your learners through Bible study questions, pray over requests, and review graduation readiness.',
            style: TextStyle(color: Color(0xFFC7DCFA), fontSize: 12.5, height: 1.3),
          ),
        ],
      ),
    );
  }

  Widget _buildCandidateCard(Map<String, dynamic> c) {
    final name = (c['displayName'] ?? c['name'] ?? 'Learner').toString();
    final email = (c['email'] ?? '').toString();
    final guide = (c['guideTitle'] ?? c['currentGuide'] ?? 'Voice of Prophecy Course').toString();
    final progress = c['progress'] ?? 0;
    final progressNum = progress is num ? progress.toDouble() : 0.0;

    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: VopCard(
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  CircleAvatar(
                    backgroundColor: VopColors.gold.withAlpha(35),
                    child: Text(
                      name.isNotEmpty ? name[0].toUpperCase() : 'L',
                      style: const TextStyle(fontWeight: FontWeight.w800, color: VopColors.gold),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(name, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
                        Text(email, style: const TextStyle(fontSize: 12, color: Colors.grey)),
                      ],
                    ),
                  ),
                  IconButton(
                    icon: const Icon(Icons.chat_bubble_outline, color: VopColors.gold),
                    tooltip: 'Send encouragement / message',
                    onPressed: () {
                      Navigator.push(
                        context,
                        MaterialPageRoute<void>(
                          builder: (_) => Scaffold(
                            appBar: AppBar(title: Text('Mentoring: $name')),
                            body: MentorScreen(api: widget.api),
                          ),
                        ),
                      );
                    },
                  ),
                ],
              ),
              const SizedBox(height: 10),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(guide, style: TextStyle(fontSize: 12, color: Theme.of(context).colorScheme.primary, fontWeight: FontWeight.w600)),
                  Text('${progressNum.toStringAsFixed(0)}% complete', style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700)),
                ],
              ),
              const SizedBox(height: 6),
              ClipRRect(
                borderRadius: BorderRadius.circular(4),
                child: LinearProgressIndicator(
                  value: progressNum > 0 ? (progressNum / 100).clamp(0.0, 1.0) : 0.05,
                  minHeight: 6,
                  backgroundColor: Theme.of(context).colorScheme.surfaceContainerHighest,
                  valueColor: const AlwaysStoppedAnimation<Color>(VopColors.gold),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
