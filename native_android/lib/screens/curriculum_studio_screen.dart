import 'package:flutter/material.dart';
import '../core/vop_api.dart';
import '../widgets/vop_ui.dart';
import 'curriculum_lesson_editor_screen.dart';
import 'workspace_records_screen.dart';

/// One curriculum workspace for Flutter web and Android, backed by the same
/// permission-scoped records and lesson endpoints used by Legacy.
class CurriculumStudioScreen extends StatefulWidget {
  const CurriculumStudioScreen({required this.api, super.key});
  final VopApi api;

  @override
  State<CurriculumStudioScreen> createState() => _CurriculumStudioState();
}

class _StudioArea {
  const _StudioArea(this.id, this.collection, this.label, this.icon);
  final String id, collection, label;
  final IconData icon;
}

const _studioAreas = <_StudioArea>[
  _StudioArea('programs', 'programs', 'Study tracks', Icons.route_outlined),
  _StudioArea('guides', 'guides', 'Study guides', Icons.menu_book_outlined),
  _StudioArea('lessons', 'guides', 'Lessons', Icons.auto_stories_outlined),
  _StudioArea('quizzes', 'quizzes', 'Evaluations', Icons.fact_check_outlined),
  _StudioArea('paths', 'learningPaths', 'Learning paths', Icons.account_tree_outlined),
  _StudioArea('topics', 'bibleTopics', 'Bible topics', Icons.topic_outlined),
  _StudioArea('seasons', 'seasons', 'Seasons', Icons.calendar_month_outlined),
];

class _CurriculumStudioState extends State<CurriculumStudioScreen> {
  late Future<Map<String, dynamic>> _workspace;
  final Map<String, Future<Map<String, dynamic>>> _requests = {};
  final Map<String, int> _counts = {};
  String _area = 'programs';
  String _search = '';
  String _status = 'all';
  String _organizationId = '';
  String _selectedProgram = '';
  String _selectedGuide = '';
  final Set<String> _expandedPrograms = <String>{};

  @override
  void initState() {
    super.initState();
    _workspace = _loadWorkspace();
  }

  Future<Map<String, dynamic>> _loadWorkspace() async {
    final workspace = await widget.api.workspace();
    // Non-super-admin calls must remain in the authenticated tenant's scope.
    _organizationId = (workspace['organizationId'] ?? '').toString();
    return workspace;
  }

  List<_StudioArea> _available(Map<String, dynamic> workspace) {
    final schemas = recordMap(workspace['schemas']);
    return _studioAreas.where((area) => schemas.containsKey(area.collection)).toList();
  }

  Map<String, dynamic> get _scope => {
    if (_organizationId.isNotEmpty) 'organizationId': _organizationId,
  };

  String _key(String collection) => _organizationId + ':' + collection;

  Future<Map<String, dynamic>> _list(String collection) {
    final key = _key(collection);
    return _requests.putIfAbsent(key, () {
      final pending = widget.api.recordList(collection, payload: _scope);
      pending.then((value) {
        if (!mounted || _requests[key] != pending) return;
        final count = recordRows(value['items']).length;
        if (_counts[key] != count) setState(() => _counts[key] = count);
      }, onError: (Object _) {});
      return pending;
    });
  }

  Future<Map<String, dynamic>> _lessons(String guideId) {
    final key = _key('guideLessons:' + guideId);
    return _requests.putIfAbsent(key, () => widget.api.adminContent(
      'curriculum', action: 'listGuideLessons',
      payload: {..._scope, 'guideId': guideId},
    ));
  }

  void _refresh([String? collection]) {
    setState(() {
      if (collection == null) {
        _requests.clear();
        _counts.clear();
      } else {
        _requests.remove(_key(collection));
        _counts.remove(_key(collection));
        if (collection == 'guides') {
          _requests.removeWhere((key, _) => key.startsWith(_key('guideLessons:')));
        }
      }
    });
  }

  void _openArea(String area) {
    setState(() {
      _area = area;
      _search = '';
      _status = 'all';
      if (area != 'lessons') _selectedGuide = '';
    });
  }

  void _openGuide(String guideId, {String programId = ''}) {
    setState(() {
      _area = 'lessons';
      _selectedGuide = guideId;
      _selectedProgram = programId;
      _search = '';
      _status = 'all';
    });
  }

  bool _may(Map<String, dynamic> schema, String action) =>
    (schema['actions'] as List? ?? []).contains(action);

  bool _editable(Map<String, dynamic> schema, Map<String, dynamic> record) =>
    _may(schema, 'update') && record['canEdit'] != false;

  bool _visible(Map<String, dynamic> record) {
    final words = [
      recordTitle(record), record['description'], record['subtitle'],
      record['language'], record['lessonNumber']
    ].join(' ').toLowerCase();
    final matchStatus = _status == 'all' ||
      (_status == 'published' && record['published'] == true) ||
      (_status == 'draft' && record['published'] != true);
    return matchStatus && words.contains(_search.toLowerCase().trim());
  }

  String _scopeTitle(Map<String, dynamic> workspace) {
    if (_organizationId.isEmpty) return 'System-wide content';
    final options = recordRows(recordMap(workspace['options'])['organizations']);
    for (final option in options) {
      if (option['value'] == _organizationId) return (option['label'] ?? _organizationId).toString();
    }
    return _organizationId;
  }

  Future<void> _pickOrganization(Map<String, dynamic> workspace) async {
    if (workspace['isSuperAdmin'] != true) return;
    final options = recordRows(recordMap(workspace['options'])['organizations']);
    final choices = <Map<String, dynamic>>[
      {'value': '', 'label': 'System-wide content'},
      ...options,
    ];
    var query = '';
    final result = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (ctx) => SafeArea(
        child: SizedBox(
          height: MediaQuery.sizeOf(ctx).height * .75,
          child: StatefulBuilder(builder: (ctx, refresh) {
            final filtered = choices.where((entry) =>
              (entry['label'] ?? '').toString().toLowerCase().contains(query)).toList();
            return Column(children: [
              Padding(padding: const EdgeInsets.fromLTRB(20, 8, 20, 12),
                child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                  Text('Publishing scope', style: Theme.of(ctx).textTheme.titleLarge),
                  const SizedBox(height: 12),
                  TextField(
                    autofocus: true,
                    onChanged: (value) => refresh(() => query = value.toLowerCase().trim()),
                    decoration: const InputDecoration(
                      prefixIcon: Icon(Icons.search),
                      labelText: 'Find an organisation',
                    ),
                  ),
                ])),
              Expanded(child: ListView.builder(
                itemCount: filtered.length,
                itemBuilder: (_, i) {
                  final choice = filtered[i];
                  final id = choice['value'].toString();
                  return ListTile(
                    title: Text((choice['label'] ?? id).toString()),
                    leading: Icon(id == _organizationId ?
                      Icons.radio_button_checked : Icons.radio_button_unchecked),
                    onTap: () => Navigator.pop(ctx, id),
                  );
                },
              )),
            ]);
          }),
        ),
      ),
    );
    if (result != null && result != _organizationId && mounted) {
      setState(() {
        _organizationId = result;
        _selectedGuide = '';
        _selectedProgram = '';
        _requests.clear();
        _counts.clear();
        _expandedPrograms.clear();
      });
    }
  }

  Future<void> _edit(Map<String, dynamic> workspace, String collection,
      Map<String, dynamic>? current, {Map<String, dynamic> seed = const {}}) async {
    final schema = recordMap(recordMap(workspace['schemas'])[collection]);
    if (schema.isEmpty || (current == null && !_may(schema, 'create')) ||
        (current != null && !_editable(schema, current))) return;
    final original = current ?? <String, dynamic>{};
    // Reuse one ID for retries. Never create an additional lesson or guide
    // during an update or after a transient save failure.
    final id = (original['id'] ?? newRecordId()).toString();
    final initial = <String, dynamic>{...seed, ...original};
    final choices = <String, dynamic>{...recordMap(workspace['options'])};
    // Resolve relationship choices in the same approved tenant context as
    // the record being saved, rather than the device's default organisation.
    final sources = <String>{};
    void collect(List<Map<String, dynamic>> fields) {
      for (final field in fields) {
        final source = (field['source'] ?? '').toString();
        if (source == 'guides' || source == 'programs') sources.add(source);
        collect(recordRows(field['fields']));
      }
    }
    collect(recordRows(schema['fields']));
    try {
      for (final source in sources) {
        final rows = recordRows((await _list(source))['items']);
        choices[source] = [
          for (final item in rows)
            {'value': item['id'], 'label': recordTitle(item)},
        ];
      }
    } catch (error) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Could not load linked curriculum records: ' + error.toString())));
      return;
    }
    if (!mounted) return;
    await Navigator.push<void>(context, MaterialPageRoute<void>(
      builder: (_) => RecordEditor(
        api: widget.api,
        title: current == null ? 'New ' + (schema['title'] ?? collection).toString()
          : 'Edit ' + recordTitle(original),
        fields: recordRows(schema['fields']),
        options: choices,
        initial: initial,
        onSave: (data) async {
          await widget.api.saveRecord(collection, id, data, payload: _scope);
        },
      ),
    ));
    // RecordEditor currently pops without a result; refresh after returning,
    // including successful saves, to reflect server-confirmed data.
    if (mounted) {
      _refresh(collection);
      if (collection == 'programs') _refresh('guides');
    }
  }

  Future<void> _remove(Map<String, dynamic> workspace, String collection,
      Map<String, dynamic> record) async {
    final schema = recordMap(recordMap(workspace['schemas'])[collection]);
    if (!_may(schema, 'delete') || record['canEdit'] == false) return;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('Delete ' + recordTitle(record) + '?'),
        content: const Text('Review any courses, assessments and references linked to this record before deleting.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Delete')),
        ],
      ),
    );
    if (confirmed != true) return;
    try {
      await widget.api.deleteRecord(collection, record['id'].toString(), payload: _scope);
      if (mounted) _refresh(collection);
    } catch (error) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Delete failed: ' + error.toString())));
    }
  }

  Future<void> _openLessonEditor(Map<String, dynamic> workspace,
      Map<String, dynamic> guide, {String lessonId = '', bool create = false}) async {
    await Navigator.push<void>(context, MaterialPageRoute<void>(
      builder: (_) => CurriculumLessonEditorScreen(
        api: widget.api, guide: guide, workspace: workspace,
        initialLessonId: lessonId, createOnOpen: create),
    ));
    if (mounted) {
      setState(() => _requests.remove(_key('guideLessons:' + guide['id'].toString())));
    }
  }

  Widget _statusBadge(Map<String, dynamic> record) {
    final published = record['published'] == true;
    return Chip(
      visualDensity: VisualDensity.compact,
      avatar: Icon(published ? Icons.public : Icons.edit_note,
        size: 16, color: published ? Colors.green : null),
      label: Text(published ? 'Published' : 'Draft',
        style: const TextStyle(fontSize: 11)),
    );
  }

  Widget _filterBar() => Column(children: [
    TextField(
      key: ValueKey('search:' + _area),
      onChanged: (value) => setState(() => _search = value),
      decoration: const InputDecoration(
        prefixIcon: Icon(Icons.search),
        hintText: 'Search titles, descriptions and language',
      ),
    ),
    const SizedBox(height: 8),
    Wrap(spacing: 8, children: [
      for (final filter in ['all', 'published', 'draft'])
        ChoiceChip(
          label: Text(filter == 'all' ? 'All records' :
            filter == 'published' ? 'Published' : 'Drafts'),
          selected: _status == filter,
          onSelected: (_) => setState(() => _status = filter),
        ),
    ]),
  ]);

  Widget _recordCard(Map<String, dynamic> workspace, String collection,
      Map<String, dynamic> schema, Map<String, dynamic> record,
      {VoidCallback? open, String? detail}) {
    final title = recordTitle(record);
    final editable = _editable(schema, record);
    final canRemove = _may(schema, 'delete') && record['canEdit'] != false;
    final description = (detail ?? record['description'] ?? record['subtitle'] ?? '').toString();
    return Card(
      clipBehavior: Clip.antiAlias,
      margin: EdgeInsets.zero,
      child: Padding(padding: const EdgeInsets.all(16),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Expanded(child: Text(title, maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: Theme.of(context).textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.w800))),
            _statusBadge(record),
          ]),
          if (description.isNotEmpty) ...[
            const SizedBox(height: 9),
            Text(description, maxLines: 3, overflow: TextOverflow.ellipsis,
              style: Theme.of(context).textTheme.bodySmall),
          ],
          const SizedBox(height: 12),
          Wrap(spacing: 6, runSpacing: 5, children: [
            if (open != null) FilledButton.tonalIcon(
              onPressed: open, icon: const Icon(Icons.arrow_forward, size: 17),
              label: Text(collection == 'guides' ? 'Manage lessons' : 'Open')),
            if (editable) OutlinedButton.icon(
              onPressed: () => _edit(workspace, collection, record),
              icon: const Icon(Icons.edit_outlined, size: 17),
              label: const Text('Edit')),
            if (canRemove) IconButton(
              tooltip: 'Delete ' + title,
              onPressed: () => _remove(workspace, collection, record),
              icon: const Icon(Icons.delete_outline)),
            if (!editable && !canRemove && open == null)
              const Chip(label: Text('Read only')),
          ]),
        ])),
    );
  }

  Widget _cards(List<Widget> cards) {
    return LayoutBuilder(builder: (context, size) {
      final columns = size.maxWidth >= 1050 ? 3 : size.maxWidth >= 660 ? 2 : 1;
      final gap = 12.0;
      final width = (size.maxWidth - gap * (columns - 1)) / columns;
      return Wrap(spacing: gap, runSpacing: gap, children: [
        for (final card in cards) SizedBox(width: width, child: card),
      ]);
    });
  }

  Widget _programs(Map<String, dynamic> workspace,
      List<Map<String, dynamic>> rows, Map<String, dynamic> schema) {
    final matches = rows.where(_visible).toList();
    return _cards([
      for (final program in matches)
        Card(clipBehavior: Clip.antiAlias, margin: EdgeInsets.zero,
          child: Padding(padding: const EdgeInsets.all(15),
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Row(children: [
                const Icon(Icons.route_outlined, size: 20),
                const SizedBox(width: 9),
                Expanded(child: Text(recordTitle(program),
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w800))),
                _statusBadge(program),
              ]),
              const SizedBox(height: 8),
              if ((program['description'] ?? '').toString().isNotEmpty)
                Text((program['description'] ?? '').toString(), maxLines: 3,
                  overflow: TextOverflow.ellipsis),
              const SizedBox(height: 12),
              OutlinedButton.icon(
                onPressed: () => setState(() {
                  final id = program['id'].toString();
                  if (!_expandedPrograms.remove(id)) _expandedPrograms.add(id);
                }),
                icon: Icon(_expandedPrograms.contains(program['id'].toString())
                  ? Icons.expand_less : Icons.expand_more),
                label: Text(_expandedPrograms.contains(program['id'].toString())
                  ? 'Hide linked guides'
                  : 'View linked guides (' + (program['guideIds'] as List? ?? []).length.toString() + ')'),
              ),
              if (_expandedPrograms.contains(program['id'].toString())) ...[
                const SizedBox(height: 10),
                FutureBuilder<Map<String, dynamic>>(
                  future: _list('guides'),
                  builder: (context, snapshot) {
                    if (snapshot.connectionState != ConnectionState.done) {
                      return const LinearProgressIndicator();
                    }
                    if (snapshot.hasError) {
                      return Column(children: [
                        Text('Guide links could not be loaded.',
                          style: TextStyle(color: Theme.of(context).colorScheme.error)),
                        TextButton(onPressed: () => _refresh('guides'),
                          child: const Text('Retry')),
                      ]);
                    }
                    final links = (program['guideIds'] as List? ?? [])
                      .map((id) => id.toString()).toList();
                    final guides = recordRows(snapshot.data?['items']);
                    final byId = {for (final guide in guides)
                      guide['id'].toString(): guide};
                    if (links.isEmpty) return const Text(
                      'No guides linked yet. Use Edit to assign guides.');
                    return Column(children: [
                      for (final id in links)
                        if (byId.containsKey(id))
                          ListTile(
                            contentPadding: EdgeInsets.zero,
                            leading: const Icon(Icons.menu_book_outlined),
                            title: Text(recordTitle(byId[id]!)),
                            trailing: const Icon(Icons.chevron_right),
                            onTap: () => _openGuide(id,
                              programId: program['id'].toString()),
                          ),
                    ]);
                  },
                ),
              ],
              const SizedBox(height: 8),
              Wrap(spacing: 8, children: [
                if (_editable(schema, program)) OutlinedButton.icon(
                  onPressed: () => _edit(workspace, 'programs', program),
                  icon: const Icon(Icons.edit_outlined, size: 16),
                  label: const Text('Edit track')),
                if (_may(schema, 'delete') && program['canEdit'] != false)
                  IconButton(
                    tooltip: 'Delete track',
                    icon: const Icon(Icons.delete_outline),
                    onPressed: () => _remove(workspace, 'programs', program)),
              ]),
            ]))),
    ]);
  }

  Widget _guideCards(Map<String, dynamic> workspace,
      List<Map<String, dynamic>> rows, Map<String, dynamic> schema) {
    return _cards([
      for (final guide in rows.where(_visible))
        _recordCard(workspace, 'guides', schema, guide,
          detail: [
            guide['description'],
            guide['language'] == null ? '' : 'Language: ' + guide['language'].toString(),
            guide['lessonCount'] == null ? '' : guide['lessonCount'].toString() + ' lessons',
          ].where((value) => value != null && value.toString().trim().isNotEmpty)
            .join(' · '),
          open: () => _openGuide(guide['id'].toString())),
    ]);
  }

  Widget _lessonWorkspace(Map<String, dynamic> workspace,
      List<Map<String, dynamic>> guides) {
    final visible = guides.where(_visible).toList();
    if (_selectedGuide.isEmpty) {
      return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Text('Choose a guide', style: Theme.of(context).textTheme.titleLarge),
        const SizedBox(height: 8),
        Text('Lessons belong to an existing guide. Select one to edit its chapters, sections, rich content and assessments.',
          style: Theme.of(context).textTheme.bodyMedium),
        const SizedBox(height: 14),
        _cards([
          for (final guide in visible)
            Card(clipBehavior: Clip.antiAlias, child: InkWell(
              onTap: () => _openGuide(guide['id'].toString()),
              child: Padding(padding: const EdgeInsets.all(16), child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(recordTitle(guide), style: Theme.of(context).textTheme.titleMedium),
                  const SizedBox(height: 5),
                  Text((guide['description'] ?? '').toString(), maxLines: 2,
                    overflow: TextOverflow.ellipsis),
                  const SizedBox(height: 10),
                  const Row(children: [
                    Text('Open lesson workspace'),
                    Spacer(),
                    Icon(Icons.arrow_forward),
                  ]),
                ])))),
        ]),
      ]);
    }
    final found = guides.where((item) => item['id'].toString() == _selectedGuide).toList();
    if (found.isEmpty) return Column(children: [
      const Text('The selected guide is no longer available.'),
      TextButton(onPressed: () => setState(() => _selectedGuide = ''),
        child: const Text('All guides')),
    ]);
    final guide = found.first;
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Wrap(spacing: 10, runSpacing: 8, crossAxisAlignment: WrapCrossAlignment.center,
        children: [
          TextButton.icon(
            onPressed: () => setState(() {
              _selectedGuide = '';
              _selectedProgram = '';
            }),
            icon: const Icon(Icons.arrow_back),
            label: Text(_selectedProgram.isNotEmpty ? 'Back to study guides' : 'All guides')),
          Text(recordTitle(guide),
            style: Theme.of(context).textTheme.titleLarge),
          FilledButton.icon(
            onPressed: () => _openLessonEditor(workspace, guide),
            icon: const Icon(Icons.edit_note),
            label: const Text('Open lesson editor'),
          ),
          if ((recordMap(workspace['permissions'])['lessons'] as List? ?? []).contains('create')
              && guide['canEdit'] != false)
            OutlinedButton.icon(
              onPressed: () => _openLessonEditor(workspace, guide, create: true),
              icon: const Icon(Icons.add),
              label: const Text('New lesson'),
            ),
          OutlinedButton.icon(
            onPressed: () { setState(() => _area = 'quizzes'); },
            icon: const Icon(Icons.fact_check_outlined),
            label: const Text('Guide evaluations'),
          ),
        ]),
      const SizedBox(height: 12),
      FutureBuilder<Map<String, dynamic>>(
        future: _lessons(_selectedGuide),
        builder: (context, snapshot) {
          if (snapshot.connectionState != ConnectionState.done) {
            return const VopSkeleton(rows: 4);
          }
          if (snapshot.hasError) return VopEmpty(icon: Icons.wifi_off,
            message: snapshot.error.toString(),
            onRetry: () => setState(() =>
              _requests.remove(_key('guideLessons:' + _selectedGuide))));
          final lessons = recordRows(snapshot.data?['items']).where((item) =>
            item['type'] != 'Test' && _visible(item)).toList();
          if (lessons.isEmpty) return const Padding(
            padding: EdgeInsets.all(22), child: Text('No lessons match this guide and filter.'),
          );
          return _cards([
            for (final lesson in lessons)
              Card(child: ListTile(
                title: Text(recordTitle(lesson)),
                subtitle: Text([
                  'Lesson ' + (lesson['lessonNumber'] ?? '—').toString(),
                  lesson['published'] == true ? 'Published' : 'Draft',
                  (lesson['chapters'] as List? ?? []).length.toString() + ' chapters',
                ].join(' · ')),
                trailing: const Icon(Icons.edit_note),
                onTap: () => _openLessonEditor(workspace, guide,
                  lessonId: lesson['id'].toString()),
              )),
          ]);
        },
      ),
    ]);
  }

  Widget _ordinary(Map<String, dynamic> workspace, String collection,
      Map<String, dynamic> schema, List<Map<String, dynamic>> records) {
    final filtered = records.where(_visible).where((record) =>
      collection != 'quizzes' || _selectedGuide.isEmpty ||
      record['guideId'] == _selectedGuide).toList();
    if (filtered.isEmpty) return const Padding(
      padding: EdgeInsets.all(24), child: Text('No records match your filters.'),
    );
    return _cards([
      for (final record in filtered)
        _recordCard(workspace, collection, schema, record),
    ]);
  }

  Widget _studioBody(Map<String, dynamic> workspace, _StudioArea area) {
    final collection = area.collection;
    final schema = recordMap(recordMap(workspace['schemas'])[collection]);
    return FutureBuilder<Map<String, dynamic>>(
      future: _list(collection),
      builder: (context, snapshot) {
        if (snapshot.connectionState != ConnectionState.done) {
          return const VopSkeleton(rows: 5);
        }
        if (snapshot.hasError) return VopEmpty(
          icon: Icons.cloud_off,
          message: snapshot.error.toString(),
          onRetry: () => _refresh(collection));
        final records = recordRows(snapshot.data?['items']);
        return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Row(children: [
            Expanded(child: Text(
              area.id == 'lessons' ? 'Independent lessons' : area.label,
              style: Theme.of(context).textTheme.titleLarge)),
            Text(records.length.toString() + ' records',
              style: Theme.of(context).textTheme.labelMedium),
          ]),
          const SizedBox(height: 14),
          _filterBar(),
          const SizedBox(height: 16),
          if (area.id == 'programs')
            _programs(workspace, records, schema)
          else if (area.id == 'guides')
            _guideCards(workspace, records, schema)
          else if (area.id == 'lessons')
            _lessonWorkspace(workspace, records)
          else
            _ordinary(workspace, collection, schema, records),
          const SizedBox(height: 90),
        ]);
      },
    );
  }

  @override
  Widget build(BuildContext context) => FutureBuilder<Map<String, dynamic>>(
    future: _workspace,
    builder: (context, snapshot) {
      if (snapshot.connectionState != ConnectionState.done) {
        return Scaffold(appBar: AppBar(title: const Text('Curriculum Studio')),
          body: const VopSkeleton(rows: 5));
      }
      if (snapshot.hasError) {
        return Scaffold(appBar: AppBar(title: const Text('Curriculum Studio')),
          body: VopEmpty(icon: Icons.wifi_off,
            message: snapshot.error.toString(),
            onRetry: () {
              _requests.clear();
              _counts.clear();
              setState(() => _workspace = _loadWorkspace());
            }));
      }
      final workspace = snapshot.data!;
      final areas = _available(workspace);
      if (areas.isEmpty) {
        return Scaffold(appBar: AppBar(title: const Text('Curriculum Studio')),
          body: const VopEmpty(icon: Icons.lock_outline,
            message: 'Curriculum authoring is not available to this account.'));
      }
      final area = areas.firstWhere((value) => value.id == _area,
        orElse: () => areas.first);
      final schema = recordMap(recordMap(workspace['schemas'])[area.collection]);
      final canCreate = area.id != 'lessons' && _may(schema, 'create');
      return Scaffold(
        appBar: AppBar(title: const Text('Curriculum Studio'), actions: [
          IconButton(
            tooltip: 'Refresh curriculum',
            icon: const Icon(Icons.refresh),
            onPressed: () => _refresh(),
          ),
        ]),
        floatingActionButton: canCreate
          ? FloatingActionButton.extended(
              onPressed: () => _edit(workspace, area.collection, null,
                seed: area.id == 'quizzes' && _selectedGuide.isNotEmpty ?
                  {'guideId': _selectedGuide, 'attachmentType': 'guide'} : const {}),
              icon: const Icon(Icons.add),
              label: Text('New ' + (area.id == 'programs' ? 'track' :
                area.id == 'guides' ? 'guide' :
                area.id == 'quizzes' ? 'evaluation' : area.label.substring(0, area.label.length - 1))),
            )
          : null,
        body: SafeArea(child: LayoutBuilder(builder: (context, constraints) {
          return ListView(padding: EdgeInsets.symmetric(
            horizontal: constraints.maxWidth > 1100 ? 30 : 14, vertical: 14),
            children: [
              Container(padding: const EdgeInsets.all(20),
                decoration: BoxDecoration(
                  color: Theme.of(context).colorScheme.primaryContainer,
                  borderRadius: BorderRadius.circular(20)),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  const Text('VOICE OF PROPHECY · AUTHORING'),
                  const SizedBox(height: 8),
                  Text('Build meaningful study journeys',
                    style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                      fontWeight: FontWeight.w900)),
                  const SizedBox(height: 8),
                  const Text('Tracks → Guides → Lessons → Chapters → Sections → Blocks and evaluations'),
                ])),
              const SizedBox(height: 14),
              if (workspace['isSuperAdmin'] == true)
                Align(alignment: Alignment.centerLeft, child: OutlinedButton.icon(
                  icon: const Icon(Icons.business_outlined),
                  onPressed: () => _pickOrganization(workspace),
                  label: Text(_scopeTitle(workspace)),
                )),
              const SizedBox(height: 8),
              SizedBox(height: 58, child: ListView(
                scrollDirection: Axis.horizontal,
                children: [
                  for (final choice in areas)
                    Padding(padding: const EdgeInsets.only(right: 8),
                      child: ChoiceChip(
                        avatar: Icon(choice.icon, size: 17),
                        label: Text(choice.label + (_counts.containsKey(_key(choice.collection))
                          ? ' (' + _counts[_key(choice.collection)].toString() + ')' : '')),
                        selected: choice.id == area.id,
                        onSelected: (_) => _openArea(choice.id),
                      )),
                ],
              )),
              const SizedBox(height: 16),
              _studioBody(workspace, area),
            ],
          );
        })),
      );
    },
  );
}
