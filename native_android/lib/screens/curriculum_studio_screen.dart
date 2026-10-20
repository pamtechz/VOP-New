import 'package:flutter/material.dart';
import '../core/vop_api.dart';
import '../theme/vop_theme.dart';
import '../widgets/vop_ui.dart';
import 'guide_screen.dart';

class CurriculumStudioScreen extends StatefulWidget {
  const CurriculumStudioScreen({required this.api, super.key});
  final VopApi api;

  @override
  State<CurriculumStudioScreen> createState() => _CurriculumStudioScreenState();
}

class _CurriculumStudioScreenState extends State<CurriculumStudioScreen> {
  late Future<Map<String, dynamic>> _catalogFuture;
  String _search = '';

  @override
  void initState() {
    super.initState();
    _reload();
  }

  void _reload() {
    setState(() {
      _catalogFuture = widget.api.catalogue();
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Curriculum & Content Studio', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 18)),
        actions: [
          IconButton(
            tooltip: 'Refresh studio',
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
                hintText: 'Search courses, guides, topics...',
                prefixIcon: const Icon(Icons.search, size: 20),
                suffixIcon: _search.isNotEmpty
                    ? IconButton(
                        icon: const Icon(Icons.clear, size: 18),
                        onPressed: () => setState(() => _search = ''),
                      )
                    : null,
                contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
              ),
              onChanged: (val) => setState(() => _search = val.trim().toLowerCase()),
            ),
          ),
          Expanded(
            child: FutureBuilder<Map<String, dynamic>>(
              future: _catalogFuture,
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
                          Text('Failed to load curriculum studio: ${snapshot.error}', textAlign: TextAlign.center),
                          const SizedBox(height: 12),
                          ElevatedButton(onPressed: _reload, child: const Text('Retry')),
                        ],
                      ),
                    ),
                  );
                }

                final rawGuides = snapshot.data?['guides'] as List? ?? [];
                var guides = rawGuides.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();

                if (_search.isNotEmpty) {
                  guides = guides.where((g) {
                    final title = (g['title'] ?? '').toString().toLowerCase();
                    final subtitle = (g['subtitle'] ?? '').toString().toLowerCase();
                    final desc = (g['description'] ?? '').toString().toLowerCase();
                    return title.contains(_search) || subtitle.contains(_search) || desc.contains(_search);
                  }).toList();
                }

                if (guides.isEmpty) {
                  return const Center(
                    child: Padding(
                      padding: EdgeInsets.all(32),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(Icons.auto_stories_outlined, size: 48, color: Colors.grey),
                          SizedBox(height: 12),
                          Text('No curriculum courses found.', style: TextStyle(fontWeight: FontWeight.w600)),
                        ],
                      ),
                    ),
                  );
                }

                return ListView.separated(
                  padding: const EdgeInsets.all(16),
                  itemCount: guides.length,
                  separatorBuilder: (_, __) => const SizedBox(height: 10),
                  itemBuilder: (context, index) {
                    final g = guides[index];
                    final guideId = (g['id'] ?? '').toString();
                    final title = (g['title'] ?? 'Untitled Guide').toString();
                    final subtitle = (g['subtitle'] ?? '').toString();
                    final lang = (g['language'] ?? 'en').toString().toUpperCase();
                    final isCertEligible = g['certificateEligible'] == true;
                    final discNum = g['discoverNumber'] ?? (index + 1);

                    return VopCard(
                      child: ListTile(
                        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                        leading: Container(
                          width: 44,
                          height: 44,
                          decoration: BoxDecoration(
                            gradient: const LinearGradient(
                              colors: [VopColors.navyDeep, VopColors.navyBright],
                              begin: Alignment.topLeft,
                              end: Alignment.bottomRight,
                            ),
                            borderRadius: BorderRadius.circular(10),
                          ),
                          child: Center(
                            child: Text(
                              '#$discNum',
                              style: const TextStyle(color: VopColors.gold, fontWeight: FontWeight.w900, fontSize: 13),
                            ),
                          ),
                        ),
                        title: Row(
                          children: [
                            Expanded(child: Text(title, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15))),
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                              decoration: BoxDecoration(
                                color: Theme.of(context).colorScheme.primaryContainer,
                                borderRadius: BorderRadius.circular(4),
                              ),
                              child: Text(lang, style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w800)),
                            ),
                          ],
                        ),
                        subtitle: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            if (subtitle.isNotEmpty) ...[
                              const SizedBox(height: 3),
                              Text(subtitle, style: const TextStyle(fontSize: 12.5), maxLines: 2, overflow: TextOverflow.ellipsis),
                            ],
                            const SizedBox(height: 6),
                            Row(
                              children: [
                                if (isCertEligible)
                                  const Row(
                                    children: [
                                      Icon(Icons.workspace_premium, size: 14, color: VopColors.gold),
                                      SizedBox(width: 3),
                                      Text('Certificate Eligible', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: VopColors.gold)),
                                    ],
                                  ),
                              ],
                            ),
                          ],
                        ),
                        trailing: const Icon(Icons.arrow_forward_ios, size: 14),
                        onTap: () {
                          Navigator.push(
                            context,
                            MaterialPageRoute<void>(
                              builder: (_) => GuideScreen(api: widget.api, guideId: guideId),
                            ),
                          );
                        },
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
}
