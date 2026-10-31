import 'package:flutter/material.dart';
import 'plate_document_editor.dart';
import 'plate_page.dart';

/// Full Flutter-Web implementation of the screenshot-matched, continuous
/// lesson editor. All changes stay in the canonical chapter/section Plate
/// structure supplied to RecordEditor; no second data store or API is used.
class ClassicWebLessonStudio extends StatefulWidget {
  const ClassicWebLessonStudio({
    required this.value, required this.onChanged, required this.onSave,
    required this.onQuiz, required this.onAdvanced, required this.saving,
    this.guideTitle = '', this.dirty = false, super.key,
  });
  final Map<String, dynamic> value;
  final VoidCallback onChanged, onSave, onQuiz, onAdvanced;
  final bool saving, dirty;
  final String guideTitle;
  @override State<ClassicWebLessonStudio> createState() => _ClassicWebLessonStudioState();
}

class _ClassicWebLessonStudioState extends State<ClassicWebLessonStudio> {
  static const blue = Color(0xFF1748D8);
  static const ink = Color(0xFF173C71);
  static const border = Color(0xFFDCE6F3);
  static const pale = Color(0xFFF4F8FD);
  String tab = 'Home';
  String? activeId;
  bool preview = false, pageListVisible = true, sidebarCollapsed = false;
  int serial = 0;
  String fontFamily = 'Arial';
  double fontSize = 11;
  final Map<String, GlobalKey> anchors = {};
  final Map<String, GlobalKey> sidebarKeys = {};
  final Map<String, GlobalKey<PlateDocumentEditorState>> documentKeys = {};
  final ScrollController documentScroll = ScrollController();
  final ScrollController outlineScroll = ScrollController();
  final GlobalKey documentViewport = GlobalKey();
  bool jumpingToPage = false, trackingScroll = false;

  @override void initState() {
    super.initState();
    documentScroll.addListener(trackVisiblePage);
  }
  @override void dispose() {
    documentScroll.removeListener(trackVisiblePage);
    documentScroll.dispose();
    outlineScroll.dispose();
    super.dispose();
  }

  // Scroll detection is scheduled after layout: changing a selected page
  // directly from a ScrollPosition listener can rebuild during layout.
  void trackVisiblePage() {
    if (!mounted || jumpingToPage || trackingScroll) return;
    trackingScroll = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      trackingScroll = false;
      if (!mounted || jumpingToPage || pages.isEmpty) return;
      final viewport = documentViewport.currentContext?.findRenderObject();
      if (viewport is! RenderBox || !viewport.attached) return;
      var next = pages.first['id'].toString();
      for (final page in pages) {
        final sid = page['id'].toString();
        final render = anchors[sid]?.currentContext?.findRenderObject();
        if (render is! RenderBox || !render.attached) continue;
        final dy = render.localToGlobal(Offset.zero, ancestor: viewport).dy;
        if (dy <= 90) next = sid;
        else break;
      }
      if (next != activeId) {
        setState(() => activeId = next);
        revealSidebarPage(next);
      }
    });
  }
  void revealSidebarPage(String sid) {
    if (!outlineScroll.hasClients) return;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      final target = sidebarKeys[sid]?.currentContext;
      if (target != null) {
        Scrollable.ensureVisible(target, alignment: .12,
          duration: const Duration(milliseconds: 180),
          curve: Curves.easeInOut);
      }
    });
  }

  Map<String, dynamic> map(dynamic raw) => raw is Map
      ? Map<String, dynamic>.from(raw) : <String, dynamic>{};
  List<Map<String, dynamic>> rows(dynamic raw) => raw is List
      ? raw.whereType<Map>().map((value) => Map<String, dynamic>.from(value)).toList()
      : <Map<String, dynamic>>[];
  List<Map<String, dynamic>> get chapters => rows(widget.value['chapters']);
  List<Map<String, dynamic>> get pages => [
    for (final chapter in chapters) ...rows(chapter['sections'])
  ];
  String makeId() => 'vop-' + DateTime.now().microsecondsSinceEpoch.toRadixString(36)
      + '-' + (serial++).toString();
  String get selectedId {
    if (pages.isEmpty) return '';
    if (pages.any((page) => page['id'].toString() == activeId)) return activeId!;
    return pages.first['id'].toString();
  }
  GlobalKey sectionAnchor(String id) =>
      anchors.putIfAbsent(id, () => GlobalKey());
  GlobalKey outlineAnchor(String id) =>
      sidebarKeys.putIfAbsent(id, () => GlobalKey());
  GlobalKey<PlateDocumentEditorState> editorKey(String id) =>
      documentKeys.putIfAbsent(id, () => GlobalKey<PlateDocumentEditorState>());
  PlateDocumentEditorState? get editor => documentKeys[selectedId]?.currentState;

  void editMetadata(String name, String next) {
    widget.value[name] = next;
    widget.onChanged();
  }
  void editPage(String sid, Map<String, dynamic> changes) {
    final source = chapters;
    for (final chapter in source) {
      final sections = rows(chapter['sections']);
      final i = sections.indexWhere((item) => item['id'].toString() == sid);
      if (i < 0) continue;
      sections[i] = {...sections[i], ...changes};
      chapter['sections'] = sections;
      widget.value['chapters'] = source;
      widget.onChanged();
      return;
    }
  }
  void focus(String sid) {
    if (!pages.any((p) => p['id'].toString() == sid)) return;
    jumpingToPage = true;
    setState(() => activeId = sid);
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      if (!mounted || !documentScroll.hasClients) {
        jumpingToPage = false;
        return;
      }
      final render = anchors[sid]?.currentContext?.findRenderObject();
      final viewport = documentViewport.currentContext?.findRenderObject();
      if (render is! RenderBox || viewport is! RenderBox ||
          !render.attached || !viewport.attached) {
        jumpingToPage = false;
        return;
      }
      // Move only the document's vertical ScrollPosition. ensureVisible on a
      // nested widget also scrolls ancestors, taking the pinned ribbon away.
      final localY = render.localToGlobal(Offset.zero, ancestor: viewport).dy;
      final position = documentScroll.position;
      final destination = (position.pixels + localY - 26)
          .clamp(position.minScrollExtent, position.maxScrollExtent).toDouble();
      try {
        await documentScroll.animateTo(destination,
          duration: const Duration(milliseconds: 260),
          curve: Curves.easeInOut);
      } finally {
        jumpingToPage = false;
      }
      revealSidebarPage(sid);
    });
  }
  void addSection() {
    final source = chapters;
    if (source.isEmpty) {
      source.add({'id': makeId(), 'title': 'New chapter', 'sections': []});
    }
    final chapter = source.firstWhere(
      (item) => rows(item['sections']).any((s) => s['id'].toString() == selectedId),
      orElse: () => source.first,
    );
    final parts = rows(chapter['sections']);
    if (parts.length >= 40) return;
    final sid = makeId();
    final next = {'id': sid, 'title': 'New section',
      'document': [{'id': makeId(), 'type': 'p', 'children': [{'text': ''}]}]};
    final index = parts.indexWhere((page) => page['id'].toString() == selectedId);
    parts.insert(index < 0 ? parts.length : index + 1, next);
    chapter['sections'] = parts;
    widget.value['chapters'] = source;
    widget.onChanged();
    focus(sid);
  }
  void addChapter() {
    final source = chapters;
    if (source.length >= 40) return;
    final sid = makeId();
    source.add({'id': makeId(), 'title': 'New chapter',
      'sections': [{'id': sid, 'title': 'New section',
        'document': [{'id': makeId(), 'type': 'p', 'children': [{'text': ''}]}]}]});
    widget.value['chapters'] = source;
    widget.onChanged();
    focus(sid);
  }
  Future<void> renamePage(String sid) async {
    final original = pages.where((p) => p['id'].toString() == sid).toList();
    if (original.isEmpty) return;
    final controller = TextEditingController(text: (original.first['title'] ?? '').toString());
    final result = await showDialog<bool>(context: context, builder: (ctx) => AlertDialog(
      title: const Text('Section / learner page'),
      content: TextField(controller: controller, autofocus: true, maxLength: 240,
        decoration: const InputDecoration(labelText: 'Section title')),
      actions: [
        TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
        FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Save')),
      ],
    ));
    if (result == true && controller.text.trim().isNotEmpty) {
      editPage(sid, {'title': controller.text.trim()});
    }
    controller.dispose();
  }
  void removePage(String sid) {
    if (pages.length < 2) return;
    final source = chapters;
    for (final chapter in source) {
      final parts = rows(chapter['sections']);
      if (!parts.any((p) => p['id'].toString() == sid) || parts.length < 2) continue;
      parts.removeWhere((p) => p['id'].toString() == sid);
      chapter['sections'] = parts;
      widget.value['chapters'] = source;
      widget.onChanged();
      focus(parts.first['id'].toString());
      return;
    }
  }
  Future<void> scripture() async {
    final p = pages.where((p) => p['id'].toString() == selectedId).toList();
    if (p.isEmpty) return;
    final previous = map(p.first['scriptureQuote']);
    final reference = TextEditingController(text: (previous['reference'] ?? '').toString());
    final passage = TextEditingController(text: (previous['text'] ?? '').toString());
    final accepted = await showDialog<bool>(context: context, builder: (ctx) => AlertDialog(
      title: const Text('Scripture focus'),
      content: SizedBox(width: 500, child: SingleChildScrollView(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          TextField(controller: reference, decoration: const InputDecoration(labelText: 'Bible reference')),
          const SizedBox(height: 9),
          TextField(controller: passage, maxLines: 5,
            decoration: const InputDecoration(labelText: 'Passage text')),
        ]))),
      actions: [
        TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
        FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Save')),
      ],
    ));
    if (accepted == true) editPage(selectedId, {'scriptureQuote': {
      'reference': reference.text.trim(), 'text': passage.text.trim()}});
    reference.dispose();
    passage.dispose();
  }
  void run(void Function(PlateDocumentEditorState) command) {
    final current = editor;
    if (current != null && !preview) command(current);
  }
  Widget shell(Widget child, {EdgeInsets padding = const EdgeInsets.all(12)}) =>
      Container(padding: padding, decoration: BoxDecoration(color: Colors.white,
        border: Border.all(color: border), borderRadius: BorderRadius.circular(11)),
        child: child);
  Widget caption(String value) => Text(value, style: const TextStyle(
    fontSize: 11, color: Color(0xFF587292), fontWeight: FontWeight.w700));
  Widget field(String title, String name, double width, {bool locked = false, String? shown}) {
    return SizedBox(width: width, child: Column(
      crossAxisAlignment: CrossAxisAlignment.start, children: [
        caption(title),
        const SizedBox(height: 5),
        SizedBox(height: 39, child: TextFormField(
          key: ValueKey('classic-meta-' + name),
          initialValue: shown ?? (widget.value[name] ?? '').toString(),
          readOnly: locked,
          onChanged: locked ? null : (next) => editMetadata(name, next),
          style: const TextStyle(fontSize: 13, color: ink, fontWeight: FontWeight.w600),
          decoration: InputDecoration(isDense: true, filled: true,
            fillColor: locked ? pale : Colors.white,
            contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 11),
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(7),
              borderSide: const BorderSide(color: border)),
            enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(7),
              borderSide: const BorderSide(color: border)),
          ),
        )),
      ]));
  }
  Widget header(bool compact) {
    final guide = widget.guideTitle.isNotEmpty ? widget.guideTitle
        : (widget.value['guideId'] ?? 'Guide').toString();
    final title = (widget.value['title'] ?? 'New lesson').toString();
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Padding(padding: const EdgeInsets.only(left: 2, bottom: 8), child: Row(children: [
        const Icon(Icons.auto_stories_outlined, color: Color(0xFF647F9F), size: 17),
        const SizedBox(width: 8),
        Flexible(child: Text(guide.toUpperCase(), overflow: TextOverflow.ellipsis,
          style: const TextStyle(color: Color(0xFF657B96), fontSize: 12, fontWeight: FontWeight.w700))),
        const Padding(padding: EdgeInsets.symmetric(horizontal: 8),
          child: Icon(Icons.chevron_right, color: Color(0xFF7290AC), size: 16)),
        Flexible(child: Text(title.toUpperCase(), maxLines: 1, overflow: TextOverflow.ellipsis,
          style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w800, color: ink))),
      ])),
      shell(Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        SingleChildScrollView(scrollDirection: Axis.horizontal,
          child: Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
            Padding(padding: const EdgeInsets.only(bottom: 1, right: 8),
              child: SizedBox(width: 39, height: 39, child: OutlinedButton(
                onPressed: () => Navigator.maybePop(context),
                style: OutlinedButton.styleFrom(padding: EdgeInsets.zero,
                  side: const BorderSide(color: border)),
                child: const Icon(Icons.arrow_back, size: 21)))),
            SizedBox(width: compact ? 225 : 320, height: 39, child:
              DropdownButtonFormField<String>(
                key: ValueKey('classic-chapter-' + selectedId),
                initialValue: selectedId.isEmpty ? null : selectedId,
                isExpanded: true,
                decoration: InputDecoration(isDense: true, filled: true, fillColor: Colors.white,
                  contentPadding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(7),
                    borderSide: const BorderSide(color: border))),
                items: [for (var i = 0; i < pages.length; i++)
                  DropdownMenuItem(value: pages[i]['id'].toString(),
                    child: Text((i + 1).toString() + '. ' +
                      (pages[i]['title'] ?? '').toString(), overflow: TextOverflow.ellipsis,
                      style: const TextStyle(color: ink, fontSize: 12)))],
                onChanged: (id) {if (id != null) focus(id);},
              )),
            const SizedBox(width: 8),
            field('Lesson Title *', 'title', compact ? 215 : 335),
            const SizedBox(width: 9),
            field('Lesson # *', 'lessonNumber', 103),
            const SizedBox(width: 9),
            field('Guide *', 'guideId', 190, locked: true, shown: guide),
            const SizedBox(width: 9),
            field('Season / Quarter', 'season', 155),
            const SizedBox(width: 9),
            field('Language', 'language', 140),
          ])),
        const SizedBox(height: 10),
        SingleChildScrollView(scrollDirection: Axis.horizontal, child: Row(children: [
          Container(padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
            decoration: BoxDecoration(color: widget.dirty ? const Color(0xFFFFF7E4)
              : const Color(0xFFEAFFF2), borderRadius: BorderRadius.circular(7),
              border: Border.all(color: widget.dirty ? const Color(0xFFF9D78D)
                : const Color(0xFFB3F0CC))),
            child: Row(children: [
              Icon(widget.dirty ? Icons.edit_note : Icons.check_circle_outline,
                size: 16, color: widget.dirty ? const Color(0xFF9A6700)
                  : const Color(0xFF06985B)),
              const SizedBox(width: 6),
              Text(widget.saving ? 'Saving…' : widget.dirty ? 'Unsaved changes' : 'No unsaved changes',
                style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700,
                  color: widget.dirty ? const Color(0xFF946000) : const Color(0xFF008B57))),
            ])),
          const SizedBox(width: 7),
          OutlinedButton.icon(onPressed: () => setState(() => preview = !preview),
            icon: Icon(preview ? Icons.edit_outlined : Icons.visibility_outlined, size: 17),
            label: Text(preview ? 'Edit' : 'Preview')),
          const SizedBox(width: 7),
          OutlinedButton.icon(onPressed: widget.saving ? null : widget.onSave,
            icon: const Icon(Icons.save_outlined, size: 17), label: const Text('Save draft')),
          const SizedBox(width: 7),
          FilledButton.icon(onPressed: widget.saving ? null : widget.onSave,
            icon: const Icon(Icons.send_outlined, size: 17), label: const Text('Update')),
          const SizedBox(width: 7),
          PopupMenuButton<String>(tooltip: 'More lesson options',
            onSelected: (action) {
              if (action == 'chapter') addChapter();
              if (action == 'quiz') widget.onQuiz();
              if (action == 'advanced') widget.onAdvanced();
            },
            itemBuilder: (_) => const [
              PopupMenuItem(value: 'chapter', child: Text('Add chapter')),
              PopupMenuItem(value: 'quiz', child: Text('Quiz library')),
              PopupMenuItem(value: 'advanced', child: Text('Advanced structure')),
            ]),
        ])),
      ]), padding: const EdgeInsets.all(11)),
    ]);
  }
  Widget ribbonIcon(IconData icon, String name, VoidCallback action) =>
    IconButton(onPressed: preview ? null : action, tooltip: name, icon: Icon(icon, size: 19),
      color: const Color(0xFF1D395E), constraints: const BoxConstraints(minWidth: 36, minHeight: 35),
      visualDensity: VisualDensity.compact);
  Widget ribbonSeparator() => Container(width: 1, height: 65,
    margin: const EdgeInsets.symmetric(horizontal: 9), color: border);
  Widget ribbonButton(String label, VoidCallback action, {double width = 118}) =>
    SizedBox(width: width, height: 34, child: OutlinedButton(
      onPressed: preview ? null : action,
      style: OutlinedButton.styleFrom(padding: const EdgeInsets.symmetric(horizontal: 7),
        side: const BorderSide(color: border), shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(7))),
      child: Text(label, overflow: TextOverflow.ellipsis,
        style: const TextStyle(fontSize: 12, color: ink))));
  Widget ribbon() {
    return Container(key: const ValueKey('classic-sticky-ribbon'),
      decoration: BoxDecoration(
      color: Colors.white, borderRadius: BorderRadius.circular(11),
      border: Border.all(color: border)), child: Column(children: [
        Row(children: [
          for (final name in ['Home', 'Insert', 'Scripture & Layout'])
            TextButton(onPressed: () => setState(() => tab = name),
              style: TextButton.styleFrom(
                backgroundColor: tab == name ? const Color(0xFFEAF2FF) : Colors.transparent,
                foregroundColor: tab == name ? blue : ink,
                shape: const RoundedRectangleBorder()),
              child: Text(name, style: TextStyle(
                fontSize: 12, fontWeight: tab == name ? FontWeight.w800 : FontWeight.w600))),
          const Spacer(),
          PopupMenuButton<String>(tooltip: 'More ribbon actions',
            onSelected: (action) {
              if (action == 'advanced') widget.onAdvanced();
              if (action == 'quiz') widget.onQuiz();
            },
            itemBuilder: (_) => const [
              PopupMenuItem(value: 'advanced', child: Text('Advanced editing')),
              PopupMenuItem(value: 'quiz', child: Text('Quiz library')),
            ]),
        ]),
        const Divider(height: 1, color: border),
        SizedBox(height: 87, child: SingleChildScrollView(scrollDirection: Axis.horizontal,
          child: Padding(padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
            child: Row(children: [
              if (tab == 'Home') ...[
                Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                  Row(children: [
                    ribbonIcon(Icons.undo, 'Undo', () => run((e) => e.undo())),
                    ribbonIcon(Icons.redo, 'Redo', () => run((e) => e.redo())),
                    ribbonIcon(Icons.content_cut, 'Cut', () => run((e) => e.cutSelection())),
                    ribbonIcon(Icons.content_copy, 'Copy', () => run((e) => e.copySelection())),
                    ribbonIcon(Icons.content_paste, 'Paste', () => run((e) => e.pasteClipboard())),
                  ]),
                  const Text('Clipboard', style: TextStyle(color: Color(0xFF8190A3), fontSize: 10)),
                ]),
                ribbonSeparator(),
                Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                  ribbonButton('Paragraph ▾', () => run((e) => e.styleActiveBlock('p')), width: 135),
                  const SizedBox(height: 3),
                  Row(children: [
                    ribbonIcon(Icons.title, 'Heading', () => run((e) => e.styleActiveBlock('h2'))),
                    ribbonIcon(Icons.format_quote, 'Quote', () => run((e) => e.styleActiveBlock('blockquote'))),
                  ]),
                ]),
                ribbonSeparator(),
                Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                  Row(children: [
                    DropdownButton<String>(value: fontFamily, underline: const SizedBox.shrink(),
                      items: ['Arial', 'Georgia', 'Roboto'].map((v) =>
                        DropdownMenuItem(value: v, child: Text(v, style: const TextStyle(fontSize: 12)))).toList(),
                      onChanged: (v) {
                        if (v == null) return;
                        setState(() => fontFamily = v);
                        run((e) => e.setActiveFontFamily(v));
                      }),
                    const SizedBox(width: 13),
                    DropdownButton<double>(value: fontSize, underline: const SizedBox.shrink(),
                      items: (<double>{9.0, 10.0, 11.0, 12.0, 14.0, 16.0, 18.0, 24.0, fontSize}.toList()..sort())
                        .map((v) => DropdownMenuItem(value: v,
                          child: Text(v.toInt().toString() + ' pt',
                            style: const TextStyle(fontSize: 12)))).toList(),
                      onChanged: (v) {
                        if (v == null) return;
                        setState(() => fontSize = v);
                        run((e) => e.setActiveFontSize(v));
                      }),
                    ribbonIcon(Icons.text_increase, 'Increase font size', () {
                      setState(() => fontSize = (fontSize + 1).clamp(9.0, 40.0).toDouble());
                      run((e) => e.setActiveFontSize(fontSize));
                    }),
                    ribbonIcon(Icons.text_decrease, 'Decrease font size', () {
                      setState(() => fontSize = (fontSize - 1).clamp(9.0, 40.0).toDouble());
                      run((e) => e.setActiveFontSize(fontSize));
                    }),
                  ]),
                  Row(children: [
                    ribbonIcon(Icons.format_bold, 'Bold', () => run((e) => e.markActiveBlock('bold'))),
                    ribbonIcon(Icons.format_italic, 'Italic', () => run((e) => e.markActiveBlock('italic'))),
                    ribbonIcon(Icons.format_underlined, 'Underline', () => run((e) => e.markActiveBlock('underline'))),
                    ribbonIcon(Icons.strikethrough_s, 'Strikethrough', () => run((e) => e.markActiveBlock('strikethrough'))),
                    ribbonIcon(Icons.code, 'Code', () => run((e) => e.markActiveBlock('code'))),
                    ribbonIcon(Icons.subscript, 'Subscript', () => run((e) => e.markActiveBlock('subscript'))),
                    ribbonIcon(Icons.superscript, 'Superscript', () => run((e) => e.markActiveBlock('superscript'))),
                    ribbonIcon(Icons.format_color_text, 'Text color', () => run((e) => e.setActiveColor('#1644AE'))),
                  ]),
                ]),
                ribbonSeparator(),
                Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                  Row(children: [
                    ribbonIcon(Icons.format_list_bulleted, 'Bulleted list', () => run((e) => e.insertBlock('ul'))),
                    ribbonIcon(Icons.format_list_numbered, 'Numbered list', () => run((e) => e.insertBlock('ol'))),
                    ribbonIcon(Icons.format_indent_decrease, 'Outdent', () => run((e) => e.setActiveIndent(-1))),
                    ribbonIcon(Icons.format_indent_increase, 'Indent', () => run((e) => e.setActiveIndent(1))),
                    ribbonIcon(Icons.format_align_left, 'Align left', () => run((e) => e.setActiveAlignment('left'))),
                    ribbonIcon(Icons.format_align_center, 'Align center', () => run((e) => e.setActiveAlignment('center'))),
                    ribbonIcon(Icons.format_align_right, 'Align right', () => run((e) => e.setActiveAlignment('right'))),
                    ribbonIcon(Icons.format_align_justify, 'Justify', () => run((e) => e.setActiveAlignment('justify'))),
                  ]),
                  const Text('Paragraph', style: TextStyle(color: Color(0xFF8190A3), fontSize: 10)),
                ]),
              ] else if (tab == 'Insert') ...[
                for (final item in <(String, IconData, String)>[
                  ('p', Icons.subject, 'Paragraph'), ('h2', Icons.title, 'Heading'),
                  ('blockquote', Icons.format_quote, 'Quote'), ('img', Icons.image_outlined, 'Image'),
                  ('table', Icons.table_chart_outlined, 'Table'), ('video', Icons.ondemand_video_outlined, 'Video'),
                  ('audio', Icons.audiotrack_outlined, 'Audio'), ('ul', Icons.format_list_bulleted, 'Bullets'),
                  ('ol', Icons.format_list_numbered, 'Numbers'), ('link', Icons.link, 'Link'),
                ]) Padding(padding: const EdgeInsets.only(right: 6),
                  child: ribbonIcon(item.$2, item.$3, () => run((e) => e.insertBlock(item.$1)))),
              ] else ...[
                ribbonButton('Scripture focus', scripture, width: 160),
                const SizedBox(width: 8),
                ribbonButton('Start section', addSection, width: 144),
                const SizedBox(width: 8),
                ribbonButton('Quiz library', widget.onQuiz, width: 142),
              ],
            ])))),
      ]));
  }
  Widget sidebarCard(Map<String, dynamic> page, int index, bool compact) {
    final sid = page['id'].toString();
    final active = sid == selectedId;
    return Container(key: outlineAnchor(sid),
      margin: const EdgeInsets.only(bottom: 6),
      decoration: BoxDecoration(
        border: Border.all(color: active ? const Color(0xFF79A7FF) : border),
        color: active ? const Color(0xFFF1F6FF) : Colors.white,
        borderRadius: BorderRadius.circular(9)),
      child: InkWell(key: ValueKey('classic-page-button-$sid'),
        onTap: () => focus(sid), child: Padding(
        padding: EdgeInsets.symmetric(horizontal: compact ? 7 : 11, vertical: 10),
        child: Row(children: [
          const Icon(Icons.drag_indicator, size: 13, color: Color(0xFF9FB5D1)),
          const SizedBox(width: 7),
          Container(width: 30, height: 30, alignment: Alignment.center,
            decoration: BoxDecoration(color: const Color(0xFF21419A),
              borderRadius: BorderRadius.circular(5)),
            child: Text((index + 1).toString(), style: const TextStyle(
              color: Colors.white, fontWeight: FontWeight.w800))),
          const SizedBox(width: 9),
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text((page['title'] ?? 'Section').toString().toUpperCase(),
              maxLines: 2, overflow: TextOverflow.ellipsis,
              style: const TextStyle(color: ink, fontSize: 12, fontWeight: FontWeight.w800)),
            const SizedBox(height: 2),
            Text(rows(page['document']).length.toString() + ' content blocks',
              style: const TextStyle(color: Color(0xFF6F86A6), fontSize: 11)),
          ])),
          if (!compact) IconButton(onPressed: () => renamePage(sid),
            tooltip: 'Rename section', icon: const Icon(Icons.edit_outlined, size: 16),
            constraints: const BoxConstraints(minWidth: 27, minHeight: 30)),
          PopupMenuButton<String>(tooltip: 'Section actions', icon: const Icon(Icons.more_vert, size: 19),
            onSelected: (v) {
              if (v == 'rename') renamePage(sid);
              if (v == 'delete') removePage(sid);
              if (v == 'add') addSection();
            }, itemBuilder: (_) => [
              const PopupMenuItem(value: 'rename', child: Text('Rename section')),
              const PopupMenuItem(value: 'add', child: Text('Add section after')),
              if (pages.length > 1) const PopupMenuItem(value: 'delete', child: Text('Remove section')),
            ]),
        ]))));
  }
  Widget sidebar({required bool compact}) {
    return shell(Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Row(children: [
        const Expanded(child: Text('LEARNER PAGES', style: TextStyle(
          color: Color(0xFF5F7898), fontSize: 12, fontWeight: FontWeight.w800))),
        IconButton(onPressed: () => setState(() => preview = !preview),
          tooltip: 'Preview learner pages', icon: const Icon(Icons.visibility_outlined, size: 18)),
        IconButton(onPressed: addSection,
          tooltip: 'Add learner page', icon: const Icon(Icons.add, size: 18)),
        IconButton(onPressed: () => setState(() => sidebarCollapsed = !sidebarCollapsed),
          tooltip: sidebarCollapsed ? 'Show sidebar' : 'Collapse sidebar',
          icon: Icon(sidebarCollapsed ? Icons.last_page : Icons.first_page, size: 18)),
      ]),
      Text(pages.length.toString() + ' sections', style: const TextStyle(
        fontSize: 12, color: ink, fontWeight: FontWeight.w800)),
      const SizedBox(height: 9),
      Container(padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
        decoration: BoxDecoration(color: pale, borderRadius: BorderRadius.circular(8)),
        child: const Text('Sections are page boundaries inside the document—not separate block forms.',
          style: TextStyle(color: Color(0xFF6C84A2), fontSize: 11, height: 1.5))),
      const SizedBox(height: 7),
      Expanded(child: Scrollbar(controller: outlineScroll,
        thumbVisibility: true, child: ListView.builder(
          key: const PageStorageKey('classic-outline-scroll'),
          controller: outlineScroll, primary: false,
          itemCount: pages.length,
          itemBuilder: (_, i) => sidebarCard(pages[i], i, compact)))),
    ]), padding: const EdgeInsets.all(9));
  }
  Widget sectionContent(Map<String, dynamic> page, int i) {
    final sid = page['id'].toString();
    final document = rows(page['document']);
    return Column(key: sectionAnchor(sid),
      crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      if (i > 0) ...[
        Container(margin: const EdgeInsets.only(top: 14, bottom: 20),
          child: Row(children: [
            Expanded(child: Container(padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(color: const Color(0xFFF2F7FF),
                border: Border.all(color: const Color(0xFFBAD5FF)),
                borderRadius: BorderRadius.circular(10)),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                const Row(children: [
                  Icon(Icons.layers_outlined, color: Color(0xFF2563EB), size: 16),
                  SizedBox(width: 6),
                  Text('SECTION / LEARNER PAGE', style: TextStyle(
                    color: Color(0xFF2563EB), fontSize: 12, fontWeight: FontWeight.w800)),
                ]),
                const SizedBox(height: 9),
                TextFormField(key: ValueKey('section-title-' + sid),
                  initialValue: (page['title'] ?? '').toString(), maxLength: 240,
                  onTap: () => setState(() => activeId = sid),
                  onChanged: (next) => editPage(sid, {'title': next}),
                  style: const TextStyle(fontSize: 13, color: ink, fontWeight: FontWeight.w700),
                  decoration: InputDecoration(counterText: '', filled: true, fillColor: Colors.white,
                    isDense: true, suffixIcon: IconButton(
                      tooltip: 'Rename section', onPressed: () => renamePage(sid),
                      icon: const Icon(Icons.edit_outlined, size: 17, color: blue)),
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(7),
                      borderSide: const BorderSide(color: border)))),
                const SizedBox(height: 5),
                const Text('Everything below belongs to this page until the next section boundary.',
                  style: TextStyle(color: Color(0xFF6C84A2), fontSize: 11)),
              ]))),
            Expanded(child: Divider(color: border, indent: 10)),
          ])),
      ],
      if (preview)
        PlatePageView(page: {...page, 'title': ''})
      else PlateDocumentEditor(
        key: editorKey(sid),
        document: document,
        inlineMode: true,
        onFocused: () {
          if (activeId != sid) setState(() => activeId = sid);
          revealSidebarPage(sid);
        },
        onChanged: (next) => editPage(sid, {'document': next}),
      ),
      const SizedBox(height: 15),
    ]);
  }
  Widget documentCanvas() {
    return Container(key: documentViewport, color: Colors.white,
      child: Scrollbar(controller: documentScroll, thumbVisibility: true,
        child: SingleChildScrollView(
          key: const PageStorageKey('classic-document-scroll'),
          controller: documentScroll,
          primary: false,
          physics: const ClampingScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(52, 36, 52, 70),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            for (var i = 0; i < pages.length; i++) sectionContent(pages[i], i),
            if (!preview) Padding(padding: const EdgeInsets.only(top: 10),
              child: Align(alignment: Alignment.centerLeft,
                child: TextButton.icon(onPressed: addSection,
                  icon: const Icon(Icons.add),
                  label: const Text('Start another section')))),
          ]),
        ),
      ),
    );
  }
  Widget mobilePageList() {
    return shell(Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Row(children: [
        Expanded(child: Text('LEARNER PAGES  ·  ' + pages.length.toString() + ' sections',
          style: const TextStyle(color: ink, fontWeight: FontWeight.w800))),
        IconButton(onPressed: addSection, icon: const Icon(Icons.add)),
        IconButton(onPressed: () => setState(() => pageListVisible = !pageListVisible),
          icon: Icon(pageListVisible ? Icons.expand_less : Icons.expand_more)),
      ]),
      if (pageListVisible) SizedBox(height: 75,
        child: ListView(scrollDirection: Axis.horizontal, children: [
          for (var i = 0; i < pages.length; i++)
            SizedBox(width: 215, child: sidebarCard(pages[i], i, true)),
        ])),
    ]), padding: const EdgeInsets.all(8));
  }
  @override Widget build(BuildContext context) {
    return Theme(data: ThemeData.light(useMaterial3: true).copyWith(
      colorScheme: ColorScheme.fromSeed(seedColor: blue),
      scaffoldBackgroundColor: pale), child: LayoutBuilder(builder: (ctx, limits) {
      final veryCompact = limits.maxWidth < 700;
      final width = limits.maxWidth >= 1500 ? 385.0 : 225.0;
      return Container(color: pale, padding: EdgeInsets.all(veryCompact ? 8 : 15),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          header(limits.maxWidth < 1450),
          const SizedBox(height: 12),
          if (veryCompact) mobilePageList(),
          if (veryCompact) const SizedBox(height: 8),
          Expanded(child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            if (!veryCompact && !sidebarCollapsed) ...[
              SizedBox(width: width, child: sidebar(compact: limits.maxWidth < 1500)),
              const SizedBox(width: 12),
            ],
            Expanded(child: Container(decoration: BoxDecoration(color: Colors.white,
              border: Border.all(color: border),
              borderRadius: BorderRadius.circular(11)), clipBehavior: Clip.antiAlias,
              child: Column(children: [
                ribbon(),
                Expanded(child: pages.isEmpty
                  ? Center(child: OutlinedButton.icon(onPressed: addChapter,
                    icon: const Icon(Icons.add), label: const Text('Create first section')))
                  : documentCanvas()),
              ]))),
          ])),
        ]));
    }));
  }
}
