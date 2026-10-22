import 'package:flutter/material.dart';

import '../core/vop_api.dart';
import '../widgets/vop_ui.dart';
import 'auth_screen.dart';

/// One public experience for Android and Flutter Web. The API intentionally
/// returns published catalogue metadata, never lesson bodies or quiz answers.
class PublicEntryScreen extends StatefulWidget {
  const PublicEntryScreen({super.key});
  @override
  State<PublicEntryScreen> createState() => _PublicEntryScreenState();
}

class _PublicEntryScreenState extends State<PublicEntryScreen> {
  late final VopApi _api;
  late Future<Map<String, dynamic>> _catalogue;
  final TextEditingController _search = TextEditingController();
  String _selectedProgram = '';
  bool _signIn = false;
  final Set<String> _expanded = {};

  @override
  void initState() {
    super.initState();
    _api = VopApi();
    _catalogue = _api.publicCatalog();
  }

  @override
  void dispose() {
    _search.dispose();
    _api.dispose();
    super.dispose();
  }

  void _retry() => setState(() => _catalogue = _api.publicCatalog());
  List<Map<String, dynamic>> _items(Object? value) {
    if (value is! List) return [];
    return value.whereType<Map>().map((value) => Map<String, dynamic>.from(value)).toList();
  }

  @override
  Widget build(BuildContext context) {
    final desktop = MediaQuery.sizeOf(context).width >= 1020;
    if (_signIn) {
      return desktop
          ? Scaffold(body: Row(children: [
              Expanded(child: _welcomePane()),
              Expanded(child: AuthScreen(onBack: () => setState(() => _signIn = false))),
            ]))
          : AuthScreen(onBack: () => setState(() => _signIn = false));
    }
    return Scaffold(
      body: SafeArea(child: SingleChildScrollView(
        key: const PageStorageKey<String>('public-vop-scroll'),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          _header(),
          _hero(),
          _discovery(),
          _benefits(),
          _footer(),
        ]),
      )),
    );
  }

  Widget _header() => Container(
    padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 12),
    color: const Color(0xFF081E3E),
    child: Center(child: ConstrainedBox(
      constraints: const BoxConstraints(maxWidth: 1240),
      child: Row(children: [
        const Expanded(child:Row(children:[
          Icon(Icons.auto_stories,color:Color(0xFFF6C76C),size:29),
          SizedBox(width:11),
          Flexible(child:Text('Voice of Prophecy',
            overflow:TextOverflow.ellipsis,
            style:TextStyle(color:Colors.white,
              fontSize:18,fontWeight:FontWeight.w900))),
        ])),
        if (MediaQuery.sizeOf(context).width >= 550)
          TextButton(
            onPressed: _jumpToCatalog,
            child: const Text('Browse studies',
              style: TextStyle(color: Colors.white)),
          ),
        const SizedBox(width: 12),
        FilledButton(
          onPressed: () => setState(() => _signIn = true),
          child: const Text('Sign in'),
        ),
      ]),
    )),
  );

  void _jumpToCatalog() {
    final target = _catalogueKey.currentContext;
    if (target != null) {
      Scrollable.ensureVisible(target, duration: const Duration(milliseconds: 350));
    }
  }

  final GlobalKey _catalogueKey = GlobalKey();

  Widget _hero() => Container(
    decoration: const BoxDecoration(
      gradient: LinearGradient(colors: [Color(0xFF081E3E), Color(0xFF0C4279)],
          begin: Alignment.topLeft, end: Alignment.bottomRight),
    ),
    child: Center(child: ConstrainedBox(
      constraints: const BoxConstraints(maxWidth: 1240),
      child: LayoutBuilder(builder: (context, constraints) {
        final desktop = constraints.maxWidth >= 780;
        final copy = Column(
          mainAxisAlignment: MainAxisAlignment.center,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('VOICE OF PROPHECY  •  BIBLE CORRESPONDENCE SCHOOL',
              style: TextStyle(color: Color(0xFFF6C76C), fontSize: 11,
                fontWeight: FontWeight.w800, letterSpacing: 1.4)),
            const SizedBox(height: 17),
            Text('Study the Word.\nGrow in faith.',
              style: TextStyle(color: Colors.white,
                fontWeight: FontWeight.w900, height: 1.12,
                fontSize: desktop ? 51 : 34)),
            const SizedBox(height: 16),
            Text('Explore published Bible courses, discover lesson outlines '
              'and connect with a mentor. Sign in to unlock full study pages, '
              'assessments and your personal learning journey.',
              style: TextStyle(color: Colors.white.withValues(alpha: .87),
                height: 1.6, fontSize: desktop ? 16 : 14)),
            const SizedBox(height: 23),
            Wrap(spacing: 11, runSpacing: 11, children: [
              FilledButton.icon(
                onPressed: () => setState(() => _signIn = true),
                icon: const Icon(Icons.arrow_forward),
                label: const Text('Begin studying'),
              ),
              OutlinedButton.icon(
                onPressed: _jumpToCatalog,
                icon: const Icon(Icons.menu_book_outlined),
                label: const Text('Browse published lessons'),
                style: OutlinedButton.styleFrom(foregroundColor: Colors.white,
                  side: BorderSide(color: Colors.white.withValues(alpha: .7))),
              ),
            ]),
            const SizedBox(height: 20),
            Text('Published course previews are free to browse.',
              style: TextStyle(color: Colors.white.withValues(alpha: .7), fontSize: 12)),
          ],
        );
        final visual = Container(
          constraints: const BoxConstraints(maxWidth: 435),
          decoration: BoxDecoration(color: Colors.white.withValues(alpha: .1),
            borderRadius: BorderRadius.circular(25),
            border: Border.all(color: Colors.white.withValues(alpha: .19))),
          padding: const EdgeInsets.all(27),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Icon(Icons.auto_stories_outlined, color: Color(0xFFF8CC7B), size: 48),
            const SizedBox(height: 24),
            const Text('YOUR LEARNING JOURNEY', style: TextStyle(
              color: Color(0xFFF8CC7B), fontWeight: FontWeight.w800,
              fontSize: 11, letterSpacing: 1.3)),
            const SizedBox(height: 15),
            for (final entry in const [
              (Icons.explore_outlined, 'Discover a published course'),
              (Icons.auto_stories, 'Explore the lesson outline'),
              (Icons.lock_open_outlined, 'Sign in for full Bible lessons'),
              (Icons.workspace_premium_outlined, 'Track progress and assessments'),
            ])
              Padding(padding: const EdgeInsets.symmetric(vertical: 9),
                child: Row(children: [
                  Icon(entry.$1, color: Colors.white, size: 21),
                  const SizedBox(width: 12),
                  Expanded(child: Text(entry.$2, style: const TextStyle(
                    color: Colors.white, fontSize: 14))),
                ])),
          ]),
        );
        return Padding(
          padding: EdgeInsets.symmetric(horizontal: desktop ? 34 : 22,
            vertical: desktop ? 79 : 52),
          child: desktop
            ? Row(children: [
                Expanded(flex: 6, child: copy), const SizedBox(width: 50),
                Expanded(flex: 4, child: visual),
              ])
            : copy,
        );
      }),
    )),
  );

  Widget _discovery() => Center(child: ConstrainedBox(
    key: _catalogueKey,
    constraints: const BoxConstraints(maxWidth: 1280),
    child: Padding(
      padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 55),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Text('EXPLORE THE WORD', style: TextStyle(color: Theme.of(context).colorScheme.primary,
          fontSize: 11, fontWeight: FontWeight.w900, letterSpacing: 1.5)),
        const SizedBox(height: 10),
        Text('Published programmes & lessons',
          style: Theme.of(context).textTheme.headlineMedium?.copyWith(fontWeight: FontWeight.w900)),
        const SizedBox(height: 9),
        Text('Search the live VOP course directory. Full lesson text, quizzes, '
          'mentor conversations and learning records require an account.',
          style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant, height: 1.5)),
        const SizedBox(height: 23),
        FutureBuilder<Map<String, dynamic>>(
          future: _catalogue,
          builder: (context, snapshot) {
            if (snapshot.connectionState != ConnectionState.done) {
              return const VopSkeleton(rows: 4);
            }
            if (snapshot.hasError) {
              return Column(children: [
                Text('Published studies could not be loaded: ${snapshot.error}'),
                TextButton.icon(onPressed: _retry,
                  icon: const Icon(Icons.refresh), label: const Text('Retry')),
              ]);
            }
            final data = snapshot.data ?? {};
            final programs = _items(data['programs']);
            final all = _items(data['guides']);
            final terms = _search.text.toLowerCase().trim();
            final selected = programs.where((p) => p['id'] == _selectedProgram).toList();
            final selectedIds = selected.isEmpty ? null
              : (selected.first['guideIds'] as List? ?? []).map((id) => id.toString()).toSet();
            final guides = all.where((guide) {
              if (selectedIds != null && !selectedIds.contains(guide['id'])) return false;
              final lessons = _items(guide['lessons']);
              final searchable = [
                guide['title'], guide['subtitle'], guide['description'], guide['language'],
                ...lessons.map((lesson) => lesson['title']),
              ].join(' ').toLowerCase();
              return terms.isEmpty || searchable.contains(terms);
            }).toList();
            return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              LayoutBuilder(builder: (context, constraints) {
                final wide = constraints.maxWidth >= 700;
                final search = TextField(
                  controller: _search,
                  onChanged: (_) => setState(() {}),
                  decoration: const InputDecoration(
                    prefixIcon: Icon(Icons.search),
                    labelText: 'Search courses, topics and lessons',
                    border: OutlineInputBorder(),
                  ),
                );
                final filter = DropdownButtonFormField<String>(
                  value: _selectedProgram,
                  isExpanded: true,
                  decoration: const InputDecoration(
                    labelText: 'Programme', border: OutlineInputBorder()),
                  items: [
                    const DropdownMenuItem(value: '', child: Text('All published programmes')),
                    for (final program in programs)
                      DropdownMenuItem(value: program['id'].toString(),
                        child: Text(program['title'].toString(), overflow: TextOverflow.ellipsis)),
                  ],
                  onChanged: (value) => setState(() => _selectedProgram = value ?? ''),
                );
                return wide ? Row(children: [
                  Expanded(flex: 2, child: search),
                  const SizedBox(width: 14),
                  Expanded(child: filter),
                ]) : Column(children: [search, const SizedBox(height: 12), filter]);
              }),
              if (programs.isNotEmpty) ...[
                const SizedBox(height: 27),
                Text('Published study programmes',
                  style: Theme.of(context).textTheme.titleLarge?.copyWith(
                    fontWeight: FontWeight.w800)),
                const SizedBox(height: 5),
                Text('Browse learning paths and their published outlines.',
                  style: TextStyle(
                    color: Theme.of(context).colorScheme.onSurfaceVariant)),
                const SizedBox(height: 13),
                LayoutBuilder(builder: (context, layout) {
                  final columns = layout.maxWidth >= 1020 ? 3
                    : layout.maxWidth >= 650 ? 2 : 1;
                  final cardWidth = (layout.maxWidth - (columns - 1) * 16) / columns;
                  return Wrap(spacing: 16, runSpacing: 16, children: [
                    for (final program in programs)
                      SizedBox(width: cardWidth, child: Card(
                        clipBehavior: Clip.antiAlias,
                        child: Padding(padding: const EdgeInsets.all(18),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              const Row(children: [
                                Icon(Icons.school_outlined, size: 19),
                                SizedBox(width: 8),
                                Text('PUBLISHED PROGRAMME',
                                  style: TextStyle(fontSize: 11,
                                    fontWeight: FontWeight.w800)),
                              ]),
                              const SizedBox(height: 14),
                              Text(program['title']?.toString() ?? '',
                                style: Theme.of(context).textTheme.titleMedium?.copyWith(
                                  fontWeight: FontWeight.w800)),
                              if ((program['description']?.toString() ?? '').isNotEmpty) ...[
                                const SizedBox(height: 9),
                                Text(program['description'].toString(),
                                  style: TextStyle(height: 1.5,
                                    color: Theme.of(context).colorScheme.onSurfaceVariant)),
                              ],
                              const SizedBox(height: 12),
                              Text('${(program['guideIds'] as List? ?? []).length} publicly browsable courses',
                                style: Theme.of(context).textTheme.bodySmall),
                              const SizedBox(height: 8),
                              OutlinedButton.icon(
                                onPressed: () => setState(() =>
                                  _selectedProgram = program['id']?.toString() ?? ''),
                                icon: const Icon(Icons.arrow_forward, size: 17),
                                label: const Text('View published courses'),
                              ),
                            ])),
                      )),
                  ]);
                }),
              ],
              const SizedBox(height: 18),
              Text('${guides.length} publicly browsable courses',
                style: Theme.of(context).textTheme.labelLarge),
              const SizedBox(height: 12),
              if (guides.isEmpty)
                const Padding(padding: EdgeInsets.all(28),
                  child: Text('No publicly browsable course outlines match your search. Published programmes are listed above; sign in to access full lessons.')),
              LayoutBuilder(builder: (context, layout) {
                final columns = layout.maxWidth >= 1020 ? 3
                  : layout.maxWidth >= 650 ? 2 : 1;
                final cardWidth = (layout.maxWidth - (columns - 1) * 16) / columns;
                return Wrap(spacing: 16, runSpacing: 16, children: [
                  for (final guide in guides)
                    SizedBox(width: cardWidth, child: _guideCard(guide, programs)),
                ]);
              }),
            ]);
          },
        ),
      ]),
    ),
  ));

  Widget _guideCard(Map<String, dynamic> guide, List<Map<String, dynamic>> programs) {
    final id = guide['id'].toString();
    final lessons = _items(guide['lessons']);
    final program = programs.where((item) =>
      (item['guideIds'] as List? ?? []).contains(id)).toList();
    final open = _expanded.contains(id);
    return Card(
      clipBehavior: Clip.antiAlias,
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Row(children: [
            const Icon(Icons.auto_stories_outlined, size: 18),
            const SizedBox(width: 7),
            Expanded(child: Text((program.isEmpty ? guide['language'] : program.first['title'])
                ?.toString() ?? 'Bible Study',
              maxLines: 2, overflow: TextOverflow.ellipsis,
              style: Theme.of(context).textTheme.labelMedium)),
          ]),
          const SizedBox(height: 14),
          Text(guide['title']?.toString() ?? '',
            style: Theme.of(context).textTheme.titleLarge?.copyWith(
              fontWeight: FontWeight.w800)),
          if ((guide['subtitle']?.toString() ?? '').isNotEmpty)
            Padding(padding: const EdgeInsets.only(top: 5),
              child: Text(guide['subtitle'].toString())),
          const SizedBox(height: 12),
          Text((guide['description']?.toString() ?? '').isNotEmpty
              ? guide['description'].toString()
              : 'Browse the outline of this published course.',
            maxLines: open ? 6 : 3, overflow: TextOverflow.ellipsis,
            style: TextStyle(height: 1.5,
              color: Theme.of(context).colorScheme.onSurfaceVariant)),
          const SizedBox(height: 16),
          Row(children: [
            const Icon(Icons.format_list_numbered, size: 16),
            const SizedBox(width: 7),
            Text('${lessons.length} published lessons and assessments'),
          ]),
          const SizedBox(height: 8),
          OutlinedButton.icon(
            onPressed: () => setState(() {
              open ? _expanded.remove(id) : _expanded.add(id);
            }),
            icon: Icon(open ? Icons.expand_less : Icons.expand_more),
            label: Text(open ? 'Hide lesson outline' : 'Browse lesson outline'),
          ),
          if (open) ...[
            const Divider(height: 24),
            if (lessons.isEmpty) const Text('No lesson outline has been published yet.'),
            for (final entry in lessons.asMap().entries)
              ListTile(
                contentPadding: EdgeInsets.zero,
                dense: true,
                leading: CircleAvatar(radius: 16,
                  child: Text('${entry.key + 1}', style: const TextStyle(fontSize: 12))),
                title: Text(entry.value['title']?.toString() ?? ''),
                subtitle: Text([
                  if (entry.value['description']?.toString().isNotEmpty == true)
                    entry.value['description'].toString(),
                  entry.value['type'] == 'assessment' ? 'Assessment' : 'Lesson',
                ].join(' • '), maxLines: 3),
                trailing: const Icon(Icons.lock_outline, size: 18),
              ),
            FilledButton.icon(
              onPressed: () => setState(() => _signIn = true),
              icon: const Icon(Icons.login),
              label: const Text('Sign in to study this course'),
            ),
          ],
        ]),
      ),
    );
  }

  Widget _benefits() => Container(
    padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 42),
    color: Theme.of(context).colorScheme.surfaceContainerLow,
    child: Center(child: ConstrainedBox(
      constraints: const BoxConstraints(maxWidth: 1200),
      child: Wrap(spacing: 16, runSpacing: 16, children: [
        for (final item in const [
          (Icons.school_outlined, 'Learn with purpose', 'Structured lessons, quizzes and progress.'),
          (Icons.people_outline, 'Grow together', 'Connect with mentors and your ministry.'),
          (Icons.language_outlined, 'Study in your language', 'Explore published courses and translations.'),
        ])
          SizedBox(width: 310, child: ListTile(
            leading: Icon(item.$1), title: Text(item.$2),
            subtitle: Text(item.$3),
          )),
      ]),
    )),
  );

  Widget _footer() => Padding(
    padding: const EdgeInsets.symmetric(vertical: 23, horizontal: 20),
    child: Text('Voice of Prophecy • Full lessons and assessment results require sign-in.',
      textAlign: TextAlign.center, style: Theme.of(context).textTheme.bodySmall),
  );

  Widget _welcomePane() => Container(
    padding: const EdgeInsets.all(50),
    decoration: const BoxDecoration(gradient: LinearGradient(
      colors: [Color(0xFF081E3E), Color(0xFF0C4279)],
      begin: Alignment.topLeft, end: Alignment.bottomRight)),
    child: Center(child: ConstrainedBox(
      constraints: const BoxConstraints(maxWidth: 520),
      child: Column(mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Icon(Icons.auto_stories, color: Color(0xFFF6C76C), size: 64),
          const SizedBox(height: 30),
          const Text('One connected ministry.', style: TextStyle(
            fontSize: 36, color: Colors.white, fontWeight: FontWeight.w900)),
          const SizedBox(height: 17),
          const Text('Continue your Bible studies, mentoring and progress on any device.',
            style: TextStyle(color: Colors.white, fontSize: 18, height: 1.6)),
          const SizedBox(height: 26),
          TextButton.icon(onPressed: () => setState(() => _signIn = false),
            icon: const Icon(Icons.arrow_back),
            label: const Text('Explore published courses'),
            style: TextButton.styleFrom(foregroundColor: const Color(0xFFF6C76C))),
        ]),
    )),
  );
}
