import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

import '../core/vop_api.dart';
import '../core/foreground_refresh.dart';
import '../widgets/vop_ui.dart';

List<Map<String, dynamic>> _supportRows(dynamic input) => input is List
    ? input.whereType<Map>().map((row) => Map<String, dynamic>.from(row)).toList()
    : <Map<String, dynamic>>[];

class StudySupportReference {
  const StudySupportReference({
    required this.type,
    required this.id,
    required this.label,
    this.route = '',
    this.description = '',
  });

  final String type;
  final String id;
  final String label;
  final String route;
  final String description;

  Map<String, Object?> toJson() => {
    'type': type,
    'id': id,
    'label': label,
    if (route.isNotEmpty) 'route': route,
    if (description.isNotEmpty) 'description': description,
  };
}

class _ReferenceLibrary extends StatefulWidget {
  const _ReferenceLibrary({required this.api});
  final VopApi api;

  @override
  State<_ReferenceLibrary> createState() => _ReferenceLibraryState();
}

class _ReferenceLibraryState extends State<_ReferenceLibrary> {
  late final Future<Map<String, dynamic>> catalogue;

  @override
  void initState() {
    super.initState();
    catalogue = widget.api.catalogue();
  }

  void _pick(StudySupportReference reference) {
    Navigator.of(context).pop(reference);
  }

  Future<void> _openGuide(Map<String, dynamic> guide) async {
    final reference = await Navigator.push<StudySupportReference>(
      context,
      MaterialPageRoute(builder: (_) => _ReferenceGuide(api: widget.api, guide: guide)),
    );
    if (mounted && reference != null) _pick(reference);
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Attach study material')),
    body: FutureBuilder<Map<String, dynamic>>(
      future: catalogue,
      builder: (context, snapshot) {
        if (snapshot.connectionState != ConnectionState.done) {
          return const VopSkeleton(rows: 5);
        }
        if (snapshot.hasError) {
          return VopEmpty(icon: Icons.wifi_off_outlined,
              message: snapshot.error.toString());
        }
        final programs = _supportRows(snapshot.data?['programs']);
        final guides = _supportRows(snapshot.data?['guides']);
        return ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Text('Choose published material you can access.',
                style: Theme.of(context).textTheme.bodyMedium),
            const SizedBox(height: 14),
            if (programs.isNotEmpty)
              Text('Programs', style: Theme.of(context).textTheme.titleMedium),
            ...programs.map((program) => ListTile(
              leading: const Icon(Icons.school_outlined),
              title: Text((program['title'] ?? 'Program').toString()),
              onTap: () => _pick(StudySupportReference(
                type: 'program',
                id: (program['id'] ?? '').toString(),
                label: (program['title'] ?? 'Program').toString(),
                route: 'home',
              )),
            )),
            if (guides.isNotEmpty)
              Text('Courses and guides', style: Theme.of(context).textTheme.titleMedium),
            ...guides.map((guide) => ListTile(
              leading: const Icon(Icons.menu_book_outlined),
              title: Text((guide['title'] ?? 'Guide').toString()),
              subtitle: const Text('Tap to attach the guide, or browse its lessons'),
              onTap: () => _pick(StudySupportReference(
                type: 'guide',
                id: (guide['id'] ?? '').toString(),
                label: (guide['title'] ?? 'Guide').toString(),
                route: 'guide',
              )),
              trailing: IconButton(
                tooltip: 'Browse lessons',
                icon: const Icon(Icons.chevron_right),
                onPressed: () => _openGuide(guide),
              ),
            )),
            if (guides.isEmpty && programs.isEmpty)
              const VopEmpty(icon: Icons.auto_stories_outlined,
                  message: 'No published material is available to attach.'),
          ],
        );
      },
    ),
  );
}

class _ReferenceGuide extends StatefulWidget {
  const _ReferenceGuide({required this.api, required this.guide});
  final VopApi api;
  final Map<String, dynamic> guide;

  @override
  State<_ReferenceGuide> createState() => _ReferenceGuideState();
}

class _ReferenceGuideState extends State<_ReferenceGuide> {
  late final Future<Map<String, dynamic>> details;

  @override
  void initState() {
    super.initState();
    details = widget.api.guide((widget.guide['id'] ?? '').toString());
  }

  Future<void> _openSections(Map<String, dynamic> lesson) async {
    final reference = await Navigator.push<StudySupportReference>(
      context,
      MaterialPageRoute(builder: (_) => _ReferenceSections(
        api: widget.api, guide: widget.guide, lesson: lesson,
      )),
    );
    if (mounted && reference != null) Navigator.pop(context, reference);
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: Text((widget.guide['title'] ?? 'Lessons').toString())),
    body: FutureBuilder<Map<String, dynamic>>(
      future: details,
      builder: (context, snapshot) {
        if (snapshot.connectionState != ConnectionState.done) {
          return const VopSkeleton(rows: 5);
        }
        if (snapshot.hasError) {
          return VopEmpty(icon: Icons.wifi_off_outlined,
              message: snapshot.error.toString());
        }
        final lessons = _supportRows(snapshot.data?['lessons']);
        return ListView(padding: const EdgeInsets.all(16), children: [
          const Text('Attach a lesson, or browse its published sections.'),
          const SizedBox(height: 12),
          ...lessons.where((lesson) => lesson['locked'] != true).map((lesson) =>
            ListTile(
              leading: Icon(lesson['type'] == 'Test'
                  ? Icons.fact_check_outlined : Icons.article_outlined),
              title: Text((lesson['title'] ?? 'Lesson').toString()),
              onTap: () => Navigator.pop(context, StudySupportReference(
                type: lesson['type'] == 'Test' ? 'quiz' : 'lesson',
                id: (lesson['id'] ?? '').toString(),
                label: (lesson['title'] ?? 'Lesson').toString(),
                route: 'lesson',
                description: (widget.guide['id'] ?? '').toString(),
              )),
              trailing: lesson['type'] == 'Test' ? null : IconButton(
                icon: const Icon(Icons.chevron_right),
                tooltip: 'Browse sections',
                onPressed: () => _openSections(lesson),
              ),
            ),
          ),
          if (lessons.isEmpty)
            const VopEmpty(icon: Icons.article_outlined,
                message: 'No published lessons are available.'),
        ]);
      },
    ),
  );
}

class _ReferenceSections extends StatefulWidget {
  const _ReferenceSections({
    required this.api, required this.guide, required this.lesson,
  });
  final VopApi api;
  final Map<String, dynamic> guide;
  final Map<String, dynamic> lesson;

  @override
  State<_ReferenceSections> createState() => _ReferenceSectionsState();
}

class _ReferenceSectionsState extends State<_ReferenceSections> {
  late final Future<Map<String, dynamic>> content;

  @override
  void initState() {
    super.initState();
    content = widget.api.lesson(
      (widget.guide['id'] ?? '').toString(),
      (widget.lesson['id'] ?? '').toString(),
    );
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Attach section')),
    body: FutureBuilder<Map<String, dynamic>>(
      future: content,
      builder: (context, snapshot) {
        if (snapshot.connectionState != ConnectionState.done) {
          return const VopSkeleton(rows: 5);
        }
        if (snapshot.hasError) {
          return VopEmpty(icon: Icons.wifi_off_outlined,
              message: snapshot.error.toString());
        }
        final content = snapshot.data?['lesson'];
        final pages = content is Map ? _supportRows(content['pages']) : <Map<String, dynamic>>[];
        return ListView(children: [
          ...pages.map((page) {
            final sectionId = (page['sectionId'] ?? '').toString().trim();
            final chapterId = (page['chapterId'] ?? '').toString().trim();
            final name = (page['title'] ?? '').toString().trim();
            final label = name.isEmpty
                ? 'Page ${(page['pageNumber'] ?? '')}' : name;
            return ListTile(
              leading: const Icon(Icons.segment_outlined),
              title: Text(label),
              subtitle: Text(chapterId.isEmpty ? 'Section' : (page['chapterTitle'] ?? 'Chapter').toString()),
              onTap: () => Navigator.pop(context, StudySupportReference(
                type: sectionId.isNotEmpty ? 'section'
                  : chapterId.isNotEmpty ? 'chapter' : 'lesson',
                id: sectionId.isNotEmpty ? sectionId
                  : chapterId.isNotEmpty ? chapterId
                  : (widget.lesson['id'] ?? '').toString(),
                label: label,
                route: 'lesson',
                description: 'Guide: ${widget.guide['id'] ?? ''}, lesson: ${widget.lesson['id'] ?? ''}',
              )),
            );
          }),
          if (pages.isEmpty)
            const VopEmpty(icon: Icons.article_outlined,
                message: 'This lesson has no available sections.'),
        ]);
      },
    ),
  );
}

Future<StudySupportReference?> pickStudySupportReference(
  BuildContext context, VopApi api,
) => Navigator.push<StudySupportReference>(
  context,
  MaterialPageRoute(builder: (_) => _ReferenceLibrary(api: api)),
);

class _SupportComposer extends StatefulWidget {
  const _SupportComposer({required this.api, this.initialReference});
  final VopApi api;
  final StudySupportReference? initialReference;

  @override
  State<_SupportComposer> createState() => _SupportComposerState();
}

class _SupportComposerState extends State<_SupportComposer> {
  final subject = TextEditingController();
  final message = TextEditingController();
  final references = <StudySupportReference>[];
  String target = 'both';
  String category = 'lesson_clarification';
  bool sending = false;
  String? error;

  static const categories = <String, String>{
    'lesson_clarification': 'Lesson clarification',
    'bible_question': 'Bible question',
    'doctrine': 'Doctrine',
    'assessment': 'Quiz or examination',
    'prayer': 'Prayer support',
    'evangelism': 'Evangelism',
    'baptism': 'Baptism',
    'other': 'Other',
  };
  static const targets = <String, String>{
    'both': 'Mentor and support team',
    'mentor': 'Assigned mentor',
    'support_team': 'Organization support team',
  };

  @override
  void initState() {
    super.initState();
    if (widget.initialReference != null) references.add(widget.initialReference!);
  }

  @override
  void dispose() {
    subject.dispose();
    message.dispose();
    super.dispose();
  }

  Future<void> _attach() async {
    final reference = await pickStudySupportReference(context, widget.api);
    if (!mounted || reference == null) return;
    if (!references.any((value) =>
        value.type == reference.type && value.id == reference.id)) {
      setState(() => references.add(reference));
    }
  }

  Future<void> _submit() async {
    if (sending) return;
    if (message.text.trim().length < 3) {
      setState(() => error = 'Describe your question in at least 3 characters.');
      return;
    }
    setState(() { sending = true; error = null; });
    try {
      await widget.api.action('/api/mentorship', {
        'action': 'createSupportRequest',
        'subject': subject.text.trim(),
        'message': message.text.trim(),
        'target': target,
        'channel': 'in_app',
        'category': category,
        'references': references.map((ref) => ref.toJson()).toList(),
      });
      if (mounted) Navigator.pop(context, true);
    } catch (problem) {
      if (mounted) setState(() => error = problem.toString());
    } finally {
      if (mounted) setState(() => sending = false);
    }
  }

  @override
  Widget build(BuildContext context) => Padding(
    padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
    child:SafeArea(top: false, child: SingleChildScrollView(
      padding: const EdgeInsets.all(20),
      child: Column(mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('Ask for support', style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 15),
          TextField(controller: subject, maxLength: 180,
            decoration: const InputDecoration(labelText: 'Subject')),
          DropdownButtonFormField<String>(
            initialValue: target, isExpanded: true,
            decoration: const InputDecoration(labelText: 'Send to'),
            items: targets.entries.map((entry) =>
              DropdownMenuItem(value: entry.key, child: Text(entry.value))).toList(),
            onChanged: sending ? null : (value) => setState(() => target = value ?? target),
          ),
          const SizedBox(height: 12),
          DropdownButtonFormField<String>(
            initialValue: category, isExpanded: true,
            decoration: const InputDecoration(labelText: 'Topic'),
            items: categories.entries.map((entry) =>
              DropdownMenuItem(value: entry.key, child: Text(entry.value))).toList(),
            onChanged: sending ? null : (value) => setState(() => category = value ?? category),
          ),
          const SizedBox(height: 12),
          TextField(controller: message, minLines: 3, maxLines: 7, maxLength: 10000,
            decoration: const InputDecoration(labelText: 'How can we help?',
              alignLabelWithHint: true)),
          ...references.map((reference) => InputChip(
            avatar: const Icon(Icons.link_outlined, size: 16),
            label: Text(reference.label),
            onDeleted: sending ? null : () => setState(() => references.remove(reference)),
          )),
          Align(alignment: Alignment.centerLeft, child: TextButton.icon(
            onPressed: sending ? null : _attach,
            icon: const Icon(Icons.attach_file),
            label: const Text('Attach program, course, lesson or section'),
          )),
          if (error != null) Padding(
            padding: const EdgeInsets.symmetric(vertical: 8),
            child: Text(error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
          ),
          const SizedBox(height: 8),
          FilledButton.icon(
            onPressed: sending ? null : _submit,
            icon: const Icon(Icons.send_outlined),
            label: Text(sending ? 'Sending…' : 'Send support request'),
          ),
        ],
      ),
    )),
  );
}

class LearnerSupportScreen extends StatefulWidget {
  const LearnerSupportScreen({
    required this.api,
    this.embedded = false,
    this.initialReference,
    this.openComposerOnStart = false,
    super.key,
  });
  final VopApi api;
  final bool embedded;
  final StudySupportReference? initialReference;
  final bool openComposerOnStart;

  @override
  State<LearnerSupportScreen> createState() => _LearnerSupportScreenState();
}

class _LearnerSupportScreenState extends State<LearnerSupportScreen> {
  late Future<Map<String, dynamic>> requests;

  @override
  void initState() {
    super.initState();
    _reload();
    if (widget.openComposerOnStart) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _compose();
      });
    }
  }

  void _reload() => requests = widget.api.action(
    '/api/mentorship', {'action': 'listMySupportRequests'},
  );

  Future<void> _compose() async {
    final created = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      showDragHandle: true,
      builder: (_) => _SupportComposer(
        api: widget.api, initialReference: widget.initialReference,
      ),
    );
    if (created == true && mounted) setState(_reload);
  }

  @override
  Widget build(BuildContext context) {
    final body = FutureBuilder<Map<String, dynamic>>(
      future: requests,
      builder: (context, snapshot) {
        if (snapshot.connectionState != ConnectionState.done) {
          return const VopSkeleton(rows: 4);
        }
        if (snapshot.hasError) {
          return VopEmpty(icon: Icons.support_agent_outlined,
            message: snapshot.error.toString(),
            onRetry: () => setState(_reload));
        }
        final items = _supportRows(snapshot.data?['items']);
        return RefreshIndicator(
          onRefresh: () async { setState(_reload); await requests; },
          child: ListView(padding: const EdgeInsets.all(16), children: [
            if (!widget.embedded) const Text(
              'Contact your assigned mentor or organization support team.'),
            const SizedBox(height: 8),
            FilledButton.icon(onPressed: _compose,
              icon: const Icon(Icons.add_comment_outlined),
              label: const Text('New support request')),
            const SizedBox(height: 12),
            if (items.isEmpty) const SizedBox(height: 230,
              child: VopEmpty(icon: Icons.mark_chat_unread_outlined,
                message: 'You have no support requests yet.')),
            ...items.map((item) => Card(
              child: ListTile(
                leading: Icon(item['unread'] == true
                  ? Icons.mark_chat_unread_outlined : Icons.forum_outlined),
                title: Text((item['subject'] ?? 'Support request').toString()),
                subtitle: Text((item['status'] ?? 'Open').toString()),
                trailing: const Icon(Icons.chevron_right),
                onTap: () async {
                  await Navigator.push(context, MaterialPageRoute(
                    builder: (_) => SupportThreadScreen(api: widget.api, request: item)));
                  if (mounted) setState(_reload);
                },
              ),
            )),
          ]),
        );
      },
    );
    return widget.embedded ? body : Scaffold(
      appBar: AppBar(title: const Text('Learning support')),
      body: body,
    );
  }
}

class SupportThreadScreen extends StatefulWidget {
  const SupportThreadScreen({required this.api, required this.request, super.key});
  final VopApi api;
  final Map<String, dynamic> request;

  @override
  State<SupportThreadScreen> createState() => _SupportThreadScreenState();
}

class _SupportThreadScreenState extends State<SupportThreadScreen> {
  final composer = TextEditingController();
  final references = <StudySupportReference>[];
  late Future<Map<String, dynamic>> messages;
  Map<String, dynamic>? lastMessages;
  ForegroundRefreshController? autoRefresh;
  bool sending = false;

  String get requestId => (widget.request['id'] ?? '').toString();

  @override
  void initState() {
    super.initState();
    _refresh();
    autoRefresh = ForegroundRefreshController(onRefresh: () {
      if (mounted && ModalRoute.of(context)?.isCurrent == true) {
        setState(_refresh);
      }
    });
  }

  void _refresh() {
    final request = widget.api.action('/api/mentorship',
      {'action': 'supportRequestMessages', 'requestId': requestId});
    messages = request;
    request.then((result) {
      if (mounted) setState(() => lastMessages = result);
    }).catchError((Object ignored) {});
  }

  @override
  void dispose() {
    autoRefresh?.dispose();
    composer.dispose();
    super.dispose();
  }

  Future<void> _attach() async {
    final value = await pickStudySupportReference(context, widget.api);
    if (!mounted || value == null) return;
    if (!references.any((item) => item.type == value.type && item.id == value.id)) {
      setState(() => references.add(value));
    }
  }

  Future<void> _send() async {
    final value = composer.text.trim();
    if (value.isEmpty || sending) return;
    setState(() => sending = true);
    try {
      await widget.api.action('/api/mentorship', {
        'action': 'replySupportRequest',
        'requestId': requestId,
        'message': value,
        'references': references.map((item) => item.toJson()).toList(),
      });
      composer.clear();
      if (mounted) {
        setState(() { references.clear(); _refresh(); });
      }
    } catch (problem) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(problem.toString())));
      }
    } finally {
      if (mounted) {
        setState(() => sending = false);
      }
    }
  }

  Future<void> _editOrDelete(Map<String, dynamic> item, bool delete) async {
    final messageId = (item['id'] ?? '').toString();
    if (messageId.isEmpty) return;
    var value = (item['body'] ?? '').toString();
    if (!delete) {
      final controller = TextEditingController(text: value);
      final next = await showDialog<String>(context: context, builder: (dialogContext) =>
        AlertDialog(
          title: const Text('Edit message'),
          content: TextField(controller: controller,
            minLines: 2, maxLines: 6, maxLength: 10000),
          actions: [
            TextButton(onPressed: () => Navigator.pop(dialogContext),
              child: const Text('Cancel')),
            FilledButton(onPressed: () => Navigator.pop(dialogContext, controller.text.trim()),
              child: const Text('Save')),
          ],
        ));
      controller.dispose();
      if (next == null || next.trim().isEmpty) return;
      value = next;
    } else {
      final confirmed = await showDialog<bool>(context: context,
        builder: (dialogContext) => AlertDialog(
          title: const Text('Delete message?'),
          content: const Text('The deleted message will no longer be visible.'),
          actions: [
            TextButton(onPressed: () => Navigator.pop(dialogContext, false),
              child: const Text('Cancel')),
            FilledButton(onPressed: () => Navigator.pop(dialogContext, true),
              child: const Text('Delete')),
          ],
        ));
      if (confirmed != true) return;
    }
    try {
      await widget.api.action('/api/mentorship', {
        'action': delete ? 'deleteSupportMessage' : 'editSupportMessage',
        'requestId': requestId,
        'messageId': messageId,
        if (!delete) 'message': value,
        if (!delete) 'references': item['references'] is List
          ? item['references'] : <Object>[],
      });
      if (mounted) {
        setState(_refresh);
      }
    } catch (problem) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(problem.toString())));
      }
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: Text((widget.request['subject'] ?? 'Support request').toString()),
      actions: [IconButton(tooltip: 'Refresh', icon: const Icon(Icons.refresh),
        onPressed: () => setState(_refresh))],
    ),
    body: Column(children: [
      Expanded(child: FutureBuilder<Map<String, dynamic>>(
        future: messages,
        builder: (context, snapshot) {
          if (snapshot.connectionState != ConnectionState.done &&
              snapshot.data == null && lastMessages == null) {
            return const VopSkeleton(rows: 4);
          }
          if (snapshot.hasError && lastMessages == null) {
            return VopEmpty(icon: Icons.wifi_off_outlined,
                message: snapshot.error.toString(),
                onRetry: () => setState(_refresh));
          }
          final items = _supportRows(snapshot.data?['items'] ?? lastMessages?['items']);
          final selfId = FirebaseAuth.instance.currentUser?.uid ?? '';
          return RefreshIndicator(
            onRefresh: () async { setState(_refresh); await messages; },
            child: ListView.builder(
              padding: const EdgeInsets.all(12),
              itemCount: items.length,
              itemBuilder: (context, index) {
                final item = items[index];
                final mine = selfId.isNotEmpty && item['senderId'] == selfId;
                final deleted = item['deleted'] == true;
                final linked = _supportRows(item['references']);
                return Card(child: Padding(
                  padding: const EdgeInsets.all(12),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Row(children: [
                        Expanded(child: Text(mine ? 'You' :
                          (item['senderRole'] ?? 'Support team').toString(),
                          style: Theme.of(context).textTheme.labelLarge)),
                        if (mine && !deleted) PopupMenuButton<String>(
                          tooltip: 'Message actions',
                          onSelected: (selection) => _editOrDelete(item, selection == 'delete'),
                          itemBuilder: (_) => const [
                            PopupMenuItem(value: 'edit', child: Text('Edit')),
                            PopupMenuItem(value: 'delete', child: Text('Delete')),
                          ],
                        ),
                      ]),
                      Text(deleted ? 'Message deleted' : (item['body'] ?? '').toString()),
                      ...linked.map((reference) => Padding(
                        padding: const EdgeInsets.only(top: 7),
                        child: Chip(
                          avatar: const Icon(Icons.link_outlined, size: 16),
                          label: Text((reference['label'] ?? '').toString()),
                        ),
                      )),
                    ],
                  ),
                ));
              },
            ),
          );
        },
      )),
      SafeArea(top: false, child: Padding(
        padding: const EdgeInsets.all(10),
        child: Column(children: [
          if (references.isNotEmpty) SizedBox(height: 38,
            child: ListView(scrollDirection: Axis.horizontal, children: [
              ...references.map((reference) => InputChip(
                label: Text(reference.label),
                onDeleted: () => setState(() => references.remove(reference)),
              )),
            ])),
          Row(children: [
            IconButton(onPressed: sending ? null : _attach,
              tooltip: 'Attach study reference',
              icon: const Icon(Icons.attach_file)),
            Expanded(child: TextField(controller: composer,
              minLines: 1, maxLines: 4, maxLength: 10000,
              decoration: const InputDecoration(hintText: 'Reply to support'))),
            IconButton(onPressed: sending ? null : _send,
              tooltip: 'Send reply',
              icon: sending ? const SizedBox(width: 20, height: 20,
                child: CircularProgressIndicator(strokeWidth: 2))
                : const Icon(Icons.send)),
          ]),
        ]),
      )),
    ]),
  );
}
