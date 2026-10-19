import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../core/vop_api.dart';
import 'learner_support_screen.dart';
import '../widgets/plate_page.dart';

class LessonScreen extends StatefulWidget {
  const LessonScreen({
    required this.api,
    required this.guideId,
    required this.lessonId,
    required this.language,
    required this.title,
    this.attachedQuizId,
    super.key,
  });
  final VopApi api;
  final String guideId, lessonId, language, title;
  final String? attachedQuizId;
  @override State<LessonScreen> createState()=>_LessonScreenState();
}

class _LessonScreenState extends State<LessonScreen> {
  late Future<Map<String, dynamic>> lesson;
  late Future<Map<String, dynamic>> resume;
  Future<Map<String, dynamic>>? quizSession;
  String? resolvedQuizId;
  Map<String, String> sectionQuizIds = {};
  String? lessonQuizId;
  String? currentLoadedQuizId;
  int page = 0;
  bool busy = false;
  String? notice;

  Map<String, dynamic>? _cachedLessonData;
  Map<String, dynamic>? _cachedGuideData;

  // Inline quiz state (unlimited attempts)
  Map<String, Object?> quizAnswers = {};
  Map<String, dynamic>? quizResult;
  bool quizSubmitting = false;
  int quizIndex = 0;
  bool quizReviewing = false;
  String? quizError;
  String? quizRestoredSession;

  @override void initState() {
    super.initState();
    resolvedQuizId = widget.attachedQuizId;
    lesson = widget.api.lesson(widget.guideId, widget.lessonId);
    resume = widget.api.progress();

    lesson.then((val) {
      if (!mounted) return;
      final lData = val['lesson'];
      if (lData is Map) {
        _cachedLessonData = Map<String, dynamic>.from(lData);
        _resolveQuizzes();
      }
    }).catchError((Object _) {});

    resume.then((value) {
      final rows = value['lessonResume'];
      if (rows is! Map) return;
      final key = '${widget.language}:${widget.guideId}:${widget.lessonId}';
      final entry = rows[key];
      if (entry is Map && entry['pageIndex'] is num && mounted) {
        setState(() => page = (entry['pageIndex'] as num).toInt());
      }
    }).catchError((Object error) {});

    // Discover attached quizzes from guide (both section-anchored and lesson-level)
    widget.api.guide(widget.guideId).then((gData) {
      if (!mounted) return;
      _cachedGuideData = gData;
      _resolveQuizzes();
    }).catchError((Object _) {});
  }

  void _resolveQuizzes() {
    final lessonData = _cachedLessonData;
    final guideData = _cachedGuideData;

    final lessonSectionIds = <String>{};
    final lessonChapterIds = <String>{};
    final directPageQuizzes = <String, String>{};
    String? directLessonQuiz;

    if (lessonData != null) {
      directLessonQuiz = (lessonData['quizLessonId'] ?? lessonData['attachedQuizId'])?.toString();
      final pages = (lessonData['pages'] as List? ?? []).whereType<Map>().toList();
      for (final p in pages) {
        final sId = (p['sectionId'] ?? '').toString();
        final cId = (p['chapterId'] ?? '').toString();
        if (sId.isNotEmpty) lessonSectionIds.add(sId);
        if (cId.isNotEmpty) lessonChapterIds.add(cId);
        final qId = (p['attachedQuizId'] ?? p['quizId'])?.toString();
        if (sId.isNotEmpty && qId != null && qId.isNotEmpty) {
          directPageQuizzes[sId] = qId;
        }
      }
      final chapters = (lessonData['chapters'] as List? ?? []).whereType<Map>().toList();
      for (final c in chapters) {
        final cId = (c['id'] ?? '').toString();
        if (cId.isNotEmpty) lessonChapterIds.add(cId);
        final sections = (c['sections'] as List? ?? []).whereType<Map>().toList();
        for (final s in sections) {
          final sId = (s['id'] ?? '').toString();
          if (sId.isNotEmpty) lessonSectionIds.add(sId);
          final qId = (s['attachedQuizId'] ?? s['quizId'])?.toString();
          if (sId.isNotEmpty && qId != null && qId.isNotEmpty) {
            directPageQuizzes[sId] = qId;
          }
        }
      }
    }

    final sMap = Map<String, String>.from(directPageQuizzes);
    String? lQuiz = directLessonQuiz;

    if (guideData != null) {
      final lList = (guideData['lessons'] as List? ?? []).whereType<Map>().toList();
      for (final e in lList) {
        if (e['type'] != 'Test' || e['attachmentType'] == 'guide' || e['assessmentKind'] == 'final_exam') continue;

        final qId = (e['id'] ?? '').toString();
        if (qId.isEmpty) continue;

        final anchor = (e['anchorId'] ?? '').toString();
        final attType = (e['attachmentType'] ?? '').toString();
        final eAttachedLesson = (e['attachedLessonId'] ?? '').toString();
        final eLessonId = (e['lessonId'] ?? '').toString();
        final eSourceQuiz = (e['sourceQuizId'] ?? '').toString();

        final matchesSectionAnchor = anchor.isNotEmpty && (
          lessonSectionIds.contains(anchor) ||
          lessonChapterIds.contains(anchor) ||
          attType == 'section' || attType == 'chapter'
        );

        final matchesLessonParent = eAttachedLesson == widget.lessonId ||
            eLessonId == widget.lessonId ||
            qId == 'quiz_${widget.lessonId}' ||
            qId == 'quiz-${widget.lessonId}' ||
            (widget.attachedQuizId != null && (qId == widget.attachedQuizId || eSourceQuiz == widget.attachedQuizId)) ||
            (directLessonQuiz != null && (qId == directLessonQuiz || eSourceQuiz == directLessonQuiz));

        if (anchor.isNotEmpty && (matchesSectionAnchor || matchesLessonParent)) {
          sMap[anchor] = qId;
        } else if (matchesLessonParent && anchor.isEmpty) {
          lQuiz ??= qId;
        } else if (matchesSectionAnchor) {
          sMap[anchor] = qId;
        }
      }
    }

    if (mounted) {
      setState(() {
        sectionQuizIds = sMap;
        if (lQuiz != null) lessonQuizId = lQuiz;
        if (resolvedQuizId == null && (lQuiz != null || sMap.isNotEmpty)) {
          resolvedQuizId = lQuiz ?? sMap.values.first;
        }
      });
    }
  }

  List<Map> _findQuestionsForQuiz(String quizId) {
    if (_cachedGuideData != null) {
      final lList = (_cachedGuideData!['lessons'] as List? ?? []).whereType<Map>().toList();
      for (final e in lList) {
        if (e['id'] == quizId || e['sourceQuizId'] == quizId) {
          final qList = (e['questions'] as List? ?? e['quiz'] as List? ?? []).whereType<Map>().toList();
          if (qList.isNotEmpty) return qList;
        }
      }
    }
    if (_cachedLessonData != null) {
      if (_cachedLessonData!['quizLessonId'] == quizId ||
          _cachedLessonData!['attachedQuizId'] == quizId ||
          _cachedLessonData!['id'] == quizId) {
        final qList = (_cachedLessonData!['questions'] as List? ?? _cachedLessonData!['quiz'] as List? ?? []).whereType<Map>().toList();
        if (qList.isNotEmpty) return qList;
      }
    }
    return [];
  }

  Map<String, dynamic> _computeLocalQuizScore(List<Map> questions, Map<String, dynamic> quizData) {
    var correct = 0;
    for (var i = 0; i < questions.length; i++) {
      final q = questions[i];
      final userAns = quizAnswers[i.toString()];
      final correctIdx = q['correctOptionIndex'] ?? q['answer'];
      if (correctIdx != null) {
        if (userAns == correctIdx) correct++;
      } else {
        correct++;
      }
    }
    final score = questions.isNotEmpty ? ((correct / questions.length) * 100).round() : 100;
    final threshold = (quizData['threshold'] ?? quizData['assessmentPassThreshold'] ?? 70) as num;
    final passed = score >= threshold.toInt();
    return <String, dynamic>{
      'score': score,
      'passed': passed,
      'threshold': threshold,
      'offline': true,
      'feedbackMode': 'after_submit',
    };
  }

  void _loadQuiz(String quizId, {bool confirmRetake = true}) {
    setState(() {
      currentLoadedQuizId = quizId;
      quizAnswers = {};
      quizResult = null;
      quizIndex = 0;
      quizReviewing = false;
      quizError = null;
      quizSession = widget.api.startQuiz(
        widget.guideId, quizId, widget.language, confirmRetake: confirmRetake);
    });
  }

  void _restoreQuizDraft(Map<String, dynamic> data, String quizId) {
    final id = (data['sessionId'] ?? '').toString();
    if (id.isEmpty || id == quizRestoredSession) return;
    if (quizRestoredSession != null) {
      quizAnswers = {};
      quizIndex = 0;
      quizReviewing = false;
    }
    quizRestoredSession = id;
    widget.api.quizDraft(widget.language, widget.guideId, quizId, id).then((value) {
      if (mounted && value.isNotEmpty && quizAnswers.isEmpty) {
        setState(() => quizAnswers = value);
      }
    }).catchError((Object _) {});
  }

  void _answerQuiz(Map<String, dynamic> data, String quizId, String key, Object? response) {
    setState(() => quizAnswers[key] = response);
    final id = (data['sessionId'] ?? '').toString();
    if (id.isNotEmpty) {
      widget.api.saveQuizDraft(
        widget.language, widget.guideId, quizId, id, quizAnswers,
        expiresAt: DateTime.tryParse((data['expiresAt'] ?? '').toString()),
      ).catchError((Object _) {});
    }
  }

  Future<void> _submitInlineQuiz(String quizId, Map<String, dynamic> quizData) async {
    if (quizSubmitting) return;
    final questions = (quizData['questions'] as List? ?? []).whereType<Map>().toList();
    if (quizAnswers.length < questions.length) {
      final incomplete = List.generate(questions.length, (i) => i)
        .firstWhere((i) => !quizAnswers.containsKey(i.toString()), orElse: () => 0);
      setState(() {
        quizIndex = incomplete;
        quizReviewing = false;
        quizError = 'Answer all questions before submitting.';
      });
      return;
    }
    setState(() { quizSubmitting = true; quizError = null; });
    try {
      final sessionId = '${quizData['sessionId']}';
      Map<String, dynamic>? response;
      if (!sessionId.startsWith('session_')) {
        try {
          response = await widget.api.submitQuiz(
            widget.guideId, quizId, widget.language,
            sessionId, quizAnswers,
          );
        } catch (_) {
          response = null;
        }
      }
      response ??= _computeLocalQuizScore(questions, quizData);

      // Save lesson completion if passed
      if (response['passed'] == true) {
        await widget.api.completeLesson(
          widget.guideId, widget.lessonId, widget.language,
        ).catchError((Object _) => <String, dynamic>{});
      }

      if (mounted) setState(() => quizResult = response);
    } catch (e) {
      final fallback = _computeLocalQuizScore(questions, quizData);
      if (fallback['passed'] == true) {
        await widget.api.completeLesson(
          widget.guideId, widget.lessonId, widget.language,
        ).catchError((Object _) => <String, dynamic>{});
      }
      if (mounted) setState(() => quizResult = fallback);
    } finally {
      if (mounted) setState(() => quizSubmitting = false);
    }
  }

  Future<void> _save(int index) async {
    setState(() => page = index);
    try {
      await widget.api.saveResume(
        widget.guideId, widget.lessonId, widget.language, index);
    } catch (error) {
      if (mounted) setState(() => notice = 'Resume could not sync: $error');
    }
  }

  Future<void> _openUrl(String raw) async {
    final uri = Uri.tryParse(raw);
    if (uri == null || uri.scheme != 'https') return;
    await launchUrl(uri, mode: LaunchMode.externalApplication);
  }

  Future<void> _complete() async {
    if (busy) return;
    if (resolvedQuizId != null && resolvedQuizId!.isNotEmpty) {
      if (quizResult == null || quizResult!['passed'] != true) {
        setState(() => notice = 'You must pass the attached review quiz before completing this lesson.');
        return;
      }
    }
    setState(() { busy = true; notice = null; });
    try {
      final result = await widget.api.completeLesson(
        widget.guideId, widget.lessonId, widget.language);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(result['queued'] == true
          ? 'Completion saved offline. It will sync when connected.'
          : 'Lesson completion saved to VOP.')));
      Navigator.pop(context, true);
    } catch (error) {
      if (mounted) setState(() => notice = 'Completion failed: $error');
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> _confirmResetProgress() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Reset Lesson Progress?'),
        content: const Text(
          'This will reset your completion and review quiz scores for this lesson. Subsequent lessons will be re-locked until you complete this lesson again.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: Theme.of(ctx).colorScheme.error),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Reset Progress'),
          ),
        ],
      ),
    );

    if (confirmed == true) {
      setState(() => busy = true);
      try {
        final rawLang = widget.language.trim().toLowerCase();
        final lang = rawLang.isNotEmpty && rawLang != 'null' ? rawLang : 'en';
        await widget.api.resetLessonProgress(widget.guideId, widget.lessonId, lang);
        if (mounted) {
          setState(() {
            page = 0;
            quizResult = null;
            quizAnswers = {};
            quizIndex = 0;
            quizReviewing = false;
            quizError = null;
            notice = 'Lesson progress reset. You can now start fresh.';
          });
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Lesson progress reset.')),
          );
        }
      } catch (e) {
        if (mounted) {
          final errorText = e.toString();
          final isPendingDeployment = errorText.contains('400') || errorText.contains('valid study progress');
          if (isPendingDeployment) {
            setState(() {
              page = 0;
              quizResult = null;
              quizAnswers = {};
              quizIndex = 0;
              quizReviewing = false;
              quizError = null;
              currentLoadedQuizId = null;
              quizSession = null;
              notice = 'Local lesson progress reset.';
            });
          }
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(
                isPendingDeployment
                  ? 'Local progress reset. Deploy the latest backend update to sync reset remotely.'
                  : 'Failed to reset progress: $e',
              ),
            ),
          );
        }
      } finally {
        if (mounted) setState(() => busy = false);
      }
    }
  }

  @override Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: Text(widget.title), actions: [
      if (resolvedQuizId != null && resolvedQuizId!.isNotEmpty)
        IconButton(
          tooltip: 'Jump to review quiz',
          icon: const Icon(Icons.quiz_outlined),
          onPressed: () => _save(9999),
        ),
      IconButton(
        tooltip: 'Reset lesson progress',
        icon: const Icon(Icons.restart_alt_rounded),
        onPressed: _confirmResetProgress,
      ),
      IconButton(
        tooltip: 'Ask for help with this lesson',
        icon: const Icon(Icons.support_agent_outlined),
        onPressed: () => Navigator.push<void>(context, MaterialPageRoute(
          builder: (_) => LearnerSupportScreen(
            api: widget.api,
            initialReference: StudySupportReference(
              type: 'lesson', id: widget.lessonId, label: widget.title,
              route: 'lesson', description: 'Guide: ${widget.guideId}',
            ),
            openComposerOnStart: true,
          ),
        )),
      ),
    ]),
    body: FutureBuilder<Map<String, dynamic>>(
      future: lesson,
      builder: (context, s) {
        if (s.connectionState != ConnectionState.done) {
          return const Center(child: CircularProgressIndicator());
        }
        if (s.hasError) {
          return Center(child: Padding(
            padding: const EdgeInsets.all(22),
            child: Text('${s.error}', textAlign: TextAlign.center)));
        }
        final data = s.data?['lesson'];
        final offline = s.data?['offline'] == true;
        final pages = data is Map && data['pages'] is List
          ? (data['pages'] as List).whereType<Map>()
              .map((v) => Map<String, dynamic>.from(v)).toList()
          : <Map<String, dynamic>>[];

        if (pages.isEmpty) {
          return const Center(child: Text(
            'This lesson has no published reading pages.'));
        }

        final quizIdFromData = data is Map ? (data['quizLessonId'] ?? data['attachedQuizId'])?.toString() : null;
        final totalSteps = pages.length;
        final safePage = page.clamp(0, totalSteps - 1).toInt();

        final lessonMedia = data is Map && data['media'] is Map ? data['media'] as Map : null;
        final lessonVideoUrl = (lessonMedia?['videoUrl'] ?? (data is Map ? data['videoUrl'] : null))?.toString().trim();
        final lessonAudioUrl = (lessonMedia?['audioUrl'] ?? (data is Map ? data['audioUrl'] : null))?.toString().trim();
        final hasLessonMedia = safePage == 0 &&
            ((lessonVideoUrl != null && lessonVideoUrl.startsWith('https://')) ||
             (lessonAudioUrl != null && lessonAudioUrl.startsWith('https://')));

        final currentPage = pages[safePage];
        final currentSectionId = (currentPage['sectionId'] ?? '').toString();
        final currentChapterId = (currentPage['chapterId'] ?? '').toString();
        final pageAttachedQuiz = (currentPage['attachedQuizId'] ?? currentPage['quizId'])?.toString();

        final sectionQuizId = (currentSectionId.isNotEmpty ? sectionQuizIds[currentSectionId] : null) ??
            (currentChapterId.isNotEmpty ? sectionQuizIds[currentChapterId] : null) ??
            (pageAttachedQuiz != null && pageAttachedQuiz.isNotEmpty ? pageAttachedQuiz : null) ??
            (currentSectionId.isNotEmpty ? (sectionQuizIds['quiz_$currentSectionId'] ?? sectionQuizIds['quiz-$currentSectionId']) : null);

        final targetQuizId = sectionQuizId ?? (safePage == totalSteps - 1 ? (lessonQuizId ?? resolvedQuizId ?? quizIdFromData) : null);
        final showQuizOnPage = targetQuizId != null && targetQuizId.isNotEmpty;
        final hasAnyQuiz = sectionQuizIds.isNotEmpty || lessonQuizId != null || resolvedQuizId != null || quizIdFromData != null;

        // Auto-load inline quiz safely after frame builds without setState during build
        if (showQuizOnPage && currentLoadedQuizId != targetQuizId && !busy) {
          WidgetsBinding.instance.addPostFrameCallback((_) {
            if (mounted && currentLoadedQuizId != targetQuizId) {
              setState(() {
                currentLoadedQuizId = targetQuizId;
                quizAnswers = {};
                quizResult = null;
                quizIndex = 0;
                quizReviewing = false;
                quizError = null;
                quizSession = widget.api.startQuiz(
                  widget.guideId, targetQuizId, widget.language, confirmRetake: true
                );
              });
            }
          });
        } else if (!showQuizOnPage && currentLoadedQuizId != null) {
          currentLoadedQuizId = null;
        }

        final progressPercent = ((safePage + 1) * 100 / totalSteps).round();
        return Column(children: [
          Container(
            margin: const EdgeInsets.fromLTRB(16, 12, 16, 6),
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            decoration: BoxDecoration(
              color: Theme.of(context).colorScheme.surface,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: Theme.of(context).colorScheme.outlineVariant.withValues(alpha: 0.5)),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withValues(alpha: 0.03),
                  blurRadius: 10,
                  offset: const Offset(0, 2),
                ),
              ],
            ),
            child: Column(children: [
              Row(children: [
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 3.5),
                  decoration: BoxDecoration(
                    color: const Color(0xFF002D72).withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: Text(
                    'PAGE ${safePage + 1} OF $totalSteps',
                    style: const TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w800,
                      color: Color(0xFF002D72),
                      letterSpacing: 0.5,
                    ),
                  ),
                ),
                const Spacer(),
                Text(
                  '$progressPercent% read',
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                    color: Theme.of(context).colorScheme.onSurfaceVariant,
                  ),
                ),
                if (offline) ...[
                  const SizedBox(width: 8),
                  const Chip(
                    avatar: Icon(Icons.offline_bolt_outlined, size: 14),
                    label: Text('Offline', style: TextStyle(fontSize: 11)),
                    visualDensity: VisualDensity.compact,
                  ),
                ],
              ]),
              const SizedBox(height: 10),
              ClipRRect(
                borderRadius: BorderRadius.circular(9999),
                child: LinearProgressIndicator(
                  value: (safePage + 1) / totalSteps,
                  minHeight: 6,
                  backgroundColor: Theme.of(context).colorScheme.surfaceContainerHighest,
                  color: const Color(0xFF002D72),
                ),
              ),
            ]),
          ),
          if (hasAnyQuiz)
            Container(
              margin: const EdgeInsets.fromLTRB(16, 0, 16, 6),
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
              decoration: BoxDecoration(
                color: const Color(0xFFFEF3C7),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: const Color(0xFFF59E0B).withValues(alpha: 0.35)),
              ),
              child: Row(
                children: [
                  const Icon(Icons.quiz_outlined, size: 18, color: Color(0xFFB45309)),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      showQuizOnPage
                        ? (sectionQuizId != null
                            ? 'Section Review Quiz attached below'
                            : 'Lesson Review Quiz attached below')
                        : 'Review Quiz attached at end of lesson',
                      style: const TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                        color: Color(0xFF92400E),
                      ),
                    ),
                  ),
                  if (!showQuizOnPage)
                    TextButton.icon(
                      style: TextButton.styleFrom(
                        visualDensity: VisualDensity.compact,
                        foregroundColor: const Color(0xFFB45309),
                        padding: const EdgeInsets.symmetric(horizontal: 8),
                      ),
                      onPressed: () => _save(totalSteps - 1),
                      icon: const Icon(Icons.arrow_forward, size: 14),
                      label: const Text('Go to Quiz', style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold)),
                    ),
                ],
              ),
            ),
          Expanded(child: ListView(
            key: ValueKey(safePage),
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            children: [
              if (hasLessonMedia)
                Container(
                  margin: const EdgeInsets.only(bottom: 14),
                  decoration: BoxDecoration(
                    gradient: const LinearGradient(
                      colors: [Color(0xFF0F172A), Color(0xFF1E293B)],
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                    ),
                    borderRadius: BorderRadius.circular(18),
                    border: Border.all(color: const Color(0xFF3B82F6).withValues(alpha: 0.3)),
                    boxShadow: [
                      BoxShadow(
                        color: Colors.black.withValues(alpha: 0.15),
                        blurRadius: 14,
                        offset: const Offset(0, 4),
                      ),
                    ],
                  ),
                  padding: const EdgeInsets.all(18),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                            decoration: BoxDecoration(
                              color: const Color(0xFF3B82F6).withValues(alpha: 0.25),
                              borderRadius: BorderRadius.circular(6),
                            ),
                            child: const Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Icon(Icons.play_circle_filled_rounded, size: 13, color: Color(0xFF60A5FA)),
                                SizedBox(width: 5),
                                Text(
                                  'LESSON MEDIA',
                                  style: TextStyle(
                                    color: Color(0xFF93C5FD),
                                    fontSize: 10.5,
                                    fontWeight: FontWeight.w900,
                                    letterSpacing: 0.6,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          const Spacer(),
                          const Text(
                            'Audio & Video',
                            style: TextStyle(color: Colors.white54, fontSize: 11.5, fontWeight: FontWeight.w600),
                          ),
                        ],
                      ),
                      const SizedBox(height: 10),
                      Text(
                        widget.title,
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 16.5,
                          fontWeight: FontWeight.w800,
                          letterSpacing: -0.2,
                        ),
                      ),
                      const SizedBox(height: 4),
                      const Text(
                        'Watch or listen to accompany this study guide before reading.',
                        style: TextStyle(
                          color: Color(0xFF94A3B8),
                          fontSize: 12.5,
                          height: 1.4,
                        ),
                      ),
                      const SizedBox(height: 14),
                      Wrap(
                        spacing: 10,
                        runSpacing: 10,
                        children: [
                          if (lessonVideoUrl != null && lessonVideoUrl.startsWith('https://'))
                            FilledButton.icon(
                              style: FilledButton.styleFrom(
                                backgroundColor: const Color(0xFFDC2626),
                                foregroundColor: Colors.white,
                                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                              ),
                              onPressed: () => _openUrl(lessonVideoUrl),
                              icon: const Icon(Icons.play_arrow_rounded, size: 18),
                              label: const Text('Watch Video', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 12.5)),
                            ),
                          if (lessonAudioUrl != null && lessonAudioUrl.startsWith('https://'))
                            FilledButton.icon(
                              style: FilledButton.styleFrom(
                                backgroundColor: const Color(0xFF2563EB),
                                foregroundColor: Colors.white,
                                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                              ),
                              onPressed: () => _openUrl(lessonAudioUrl),
                              icon: const Icon(Icons.headphones_rounded, size: 18),
                              label: const Text('Listen Audio', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 12.5)),
                            ),
                        ],
                      ),
                    ],
                  ),
                ),
              Card(
                elevation: 1.5,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(18),
                  side: BorderSide(color: Theme.of(context).colorScheme.outlineVariant.withValues(alpha: 0.45)),
                ),
                clipBehavior: Clip.antiAlias,
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 22),
                  child: PlatePageView(page: pages[safePage]),
                ),
              ),
              if (showQuizOnPage) ...[
                const SizedBox(height: 24),
                _buildInlineQuizView(targetQuizId, offline, totalPages: totalSteps, currentPage: safePage),
              ],
              const SizedBox(height: 20),
              if (notice != null)
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 6),
                  child: Text(notice!,
                    style: TextStyle(color: Theme.of(context).colorScheme.error, fontWeight: FontWeight.w600)),
                ),
            ],
          )),
          SafeArea(top: false, child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
            child: Row(children: [
              OutlinedButton.icon(
                onPressed: safePage == 0 || busy ? null : () => _save(safePage - 1),
                icon: const Icon(Icons.chevron_left),
                label: const Text('Previous')),
              const Spacer(),
              FilledButton.icon(
                onPressed: busy ? null : () {
                  if (safePage < pages.length - 1) {
                    _save(safePage + 1);
                  } else if (showQuizOnPage && quizResult == null) {
                    setState(() => notice = 'Please complete and submit the review quiz above to finish this lesson.');
                  } else if (showQuizOnPage && quizResult!['passed'] != true) {
                    setState(() {
                      notice = 'Pass mark is ${quizResult!['threshold'] ?? 70}%. You scored ${quizResult!['score'] ?? 0}%. Please retake the quiz above to unlock the next lesson.';
                      quizResult = null;
                      quizAnswers = {};
                      quizIndex = 0;
                      quizReviewing = false;
                      quizError = null;
                      _loadQuiz(targetQuizId, confirmRetake: true);
                    });
                  } else {
                    _complete();
                  }
                },
                icon: busy
                  ? const SizedBox(width: 16, height: 16,
                      child: CircularProgressIndicator(strokeWidth: 2))
                  : Icon(safePage == pages.length - 1
                      ? (showQuizOnPage && quizResult == null
                          ? Icons.quiz_outlined
                          : (showQuizOnPage && quizResult!['passed'] != true
                              ? Icons.replay_rounded
                              : Icons.check_circle_outline))
                      : Icons.chevron_right),
                label: Text(safePage == pages.length - 1
                  ? (showQuizOnPage && quizResult == null
                      ? 'Submit quiz above'
                      : (showQuizOnPage && quizResult!['passed'] != true
                          ? 'Retake quiz to pass'
                          : 'Complete lesson'))
                  : 'Next page')),
            ]))),
        ]);
      },
    ),
  );

  Widget _buildInlineQuizView(String quizId, bool offline, {required int totalPages, required int currentPage}) {
    if (quizResult != null) {
      return _buildQuizResultView(quizId, totalPages: totalPages, currentPage: currentPage);
    }
    if (quizSession == null) {
      return const Center(child: CircularProgressIndicator());
    }

    return FutureBuilder<Map<String, dynamic>>(
      future: quizSession,
      builder: (context, snapshot) {
        if (snapshot.connectionState != ConnectionState.done) {
          return const Center(child: CircularProgressIndicator());
        }
        Map<String, dynamic> data;
        List<Map> questions;

        if (snapshot.hasError) {
          final fallbackQuestions = _findQuestionsForQuiz(quizId);
          if (fallbackQuestions.isNotEmpty) {
            data = <String, dynamic>{
              'sessionId': 'session_$quizId',
              'questions': fallbackQuestions,
              'threshold': 70,
            };
            questions = fallbackQuestions;
          } else {
            return Center(child: Padding(
              padding: const EdgeInsets.all(25),
              child: Column(mainAxisSize: MainAxisSize.min, children: [
                const Icon(Icons.quiz_outlined, size: 48, color: Colors.amber),
                const SizedBox(height: 12),
                Text('${snapshot.error}', textAlign: TextAlign.center),
                const SizedBox(height: 16),
                FilledButton.icon(
                  onPressed: () => _loadQuiz(quizId, confirmRetake: true),
                  icon: const Icon(Icons.refresh),
                  label: const Text('Try again (unlimited retries)')),
                const SizedBox(height: 8),
                OutlinedButton(
                  onPressed: () => _save(page - 1),
                  child: const Text('Return to reading')),
                const SizedBox(height: 8),
                TextButton(
                  onPressed: _complete,
                  child: const Text('Complete lesson without quiz')),
              ])));
          }
        } else {
          data = snapshot.data ?? {};
          questions = (data['questions'] as List? ?? []).whereType<Map>().toList();
          if (questions.isEmpty) {
            final fallbackQuestions = _findQuestionsForQuiz(quizId);
            if (fallbackQuestions.isNotEmpty) {
              questions = fallbackQuestions;
              data = {
                ...data,
                'sessionId': data['sessionId'] ?? 'session_$quizId',
                'questions': fallbackQuestions,
              };
            }
          }
        }

        _restoreQuizDraft(data, quizId);
        if (questions.isEmpty) {
          return Center(child: Padding(
            padding: const EdgeInsets.all(20),
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              const Text('No review questions published for this section or lesson.'),
              const SizedBox(height: 16),
              FilledButton(
                onPressed: _complete,
                child: const Text('Complete lesson without quiz')),
            ])));
        }

        final current = quizIndex.clamp(0, questions.length - 1).toInt();
        final question = questions[current];
        final options = (question['options'] is List)
          ? question['options'] as List : [true, false];
        final selected = quizAnswers[current.toString()];
        final scheme = Theme.of(context).colorScheme;
        final completed = quizAnswers.length;

        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Hero Quiz Banner
            Container(
              decoration: BoxDecoration(
                gradient: const LinearGradient(
                  colors: [Color(0xFF002D72), Color(0xFF1D4ED8)],
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                ),
                borderRadius: BorderRadius.circular(20),
                boxShadow: [
                  BoxShadow(
                    color: const Color(0xFF002D72).withValues(alpha: 0.28),
                    blurRadius: 16,
                    offset: const Offset(0, 5),
                  ),
                ],
              ),
              padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 16),
              child: Row(
                children: [
                  Container(
                    width: 44,
                    height: 44,
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: 0.15),
                      shape: BoxShape.circle,
                    ),
                    child: const Icon(Icons.school_rounded, color: Colors.white, size: 24),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2.5),
                          decoration: BoxDecoration(
                            color: const Color(0xFFFBBF24).withValues(alpha: 0.25),
                            borderRadius: BorderRadius.circular(6),
                          ),
                          child: const Text(
                            'KNOWLEDGE CHECK',
                            style: TextStyle(
                              color: Color(0xFFFDE68A),
                              fontSize: 10,
                              fontWeight: FontWeight.w900,
                              letterSpacing: 0.6,
                            ),
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          sectionQuizIds.values.contains(quizId)
                            ? 'Section Review Quiz'
                            : 'Lesson Review Quiz',
                          style: const TextStyle(
                            color: Colors.white,
                            fontWeight: FontWeight.w800,
                            fontSize: 16,
                          ),
                        ),
                        Text(
                          'Pass to unlock next lesson · Unlimited retries',
                          style: TextStyle(
                            color: Colors.white.withValues(alpha: 0.85),
                            fontSize: 11.5,
                          ),
                        ),
                      ],
                    ),
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: 0.18),
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: Text(
                      '$completed/${questions.length}',
                      style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w800,
                        fontSize: 13,
                      ),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),

            if (quizReviewing) ...[
              Text('Review your answers',
                style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800)),
              const SizedBox(height: 12),
              ...questions.asMap().entries.map((entry) => Card(
                margin: const EdgeInsets.only(bottom: 10),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(14),
                  side: BorderSide(color: scheme.outlineVariant.withValues(alpha: 0.4)),
                ),
                child: ListTile(
                  leading: Icon(quizAnswers.containsKey(entry.key.toString())
                    ? Icons.check_circle_rounded : Icons.radio_button_unchecked,
                    color: quizAnswers.containsKey(entry.key.toString())
                      ? const Color(0xFF16A34A) : scheme.onSurfaceVariant),
                  title: Text((entry.value['prompt'] ?? entry.value['question'] ?? 'Question').toString(),
                    maxLines: 2, overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
                  subtitle: Text(quizAnswers.containsKey(entry.key.toString())
                    ? 'Answered' : 'Not answered',
                    style: TextStyle(
                      color: quizAnswers.containsKey(entry.key.toString())
                        ? const Color(0xFF16A34A) : scheme.error,
                      fontWeight: FontWeight.w600,
                    )),
                  trailing: const Icon(Icons.edit_outlined, size: 18),
                  onTap: () => setState(() {
                    quizIndex = entry.key;
                    quizReviewing = false;
                  }),
                ))),
              const SizedBox(height: 14),
              FilledButton.icon(
                style: FilledButton.styleFrom(
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                ),
                onPressed: quizSubmitting || completed < questions.length
                  ? null : () => _submitInlineQuiz(quizId, data),
                icon: quizSubmitting
                  ? const SizedBox(width: 17, height: 17, child: CircularProgressIndicator(strokeWidth: 2))
                  : const Icon(Icons.fact_check_outlined),
                label: Text(quizSubmitting
                  ? 'Submitting…'
                  : (sectionQuizIds.values.contains(quizId)
                      ? 'Submit Section Quiz'
                      : 'Submit Review Quiz & Complete Lesson'))),
              const SizedBox(height: 8),
              TextButton(
                onPressed: () => setState(() => quizReviewing = false),
                child: const Text('Back to questions')),
            ] else ...[
              Card(
                elevation: 2,
                shadowColor: Colors.black.withValues(alpha: 0.06),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(20),
                  side: BorderSide(color: scheme.outlineVariant.withValues(alpha: 0.45)),
                ),
                child: Padding(
                  padding: const EdgeInsets.all(20),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Row(children: [
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                        decoration: BoxDecoration(
                          color: scheme.primary.withValues(alpha: 0.1),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Text(
                          'QUESTION ${current + 1} OF ${questions.length}',
                          style: TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w900,
                            color: scheme.primary,
                            letterSpacing: 0.6,
                          ),
                        ),
                      ),
                      const Spacer(),
                      if (selected != null)
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                          decoration: BoxDecoration(
                            color: const Color(0xFFDCFCE7),
                            borderRadius: BorderRadius.circular(6),
                          ),
                          child: const Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(Icons.check, size: 12, color: Color(0xFF16A34A)),
                              SizedBox(width: 4),
                              Text('Selected', style: TextStyle(color: Color(0xFF16A34A), fontSize: 11, fontWeight: FontWeight.bold)),
                            ],
                          ),
                        ),
                    ]),
                    const SizedBox(height: 14),
                    Text(
                      (question['prompt'] ?? question['question'] ?? '').toString(),
                      style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        height: 1.5,
                        fontWeight: FontWeight.w700,
                        fontSize: 16.5,
                      ),
                    ),
                    const SizedBox(height: 20),
                    ...options.asMap().entries.map((option) {
                      final value = question['options'] is List ? option.key : option.key == 0;
                      final label = question['options'] is List
                        ? option.value.toString() : (option.key == 0 ? 'True' : 'False');
                      final chosen = selected == value;
                      final letter = String.fromCharCode(65 + option.key);
                      return Padding(
                        padding: const EdgeInsets.only(bottom: 10),
                        child: Material(
                          color: chosen
                            ? scheme.primary.withValues(alpha: 0.08)
                            : scheme.surface,
                          shape: RoundedRectangleBorder(
                            side: BorderSide(
                              color: chosen ? scheme.primary : scheme.outlineVariant.withValues(alpha: 0.6),
                              width: chosen ? 2.0 : 1.0,
                            ),
                            borderRadius: BorderRadius.circular(14),
                          ),
                          clipBehavior: Clip.antiAlias,
                          child: InkWell(
                            onTap: () => _answerQuiz(data, quizId, current.toString(), value),
                            child: Padding(
                              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                              child: Row(children: [
                                Container(
                                  width: 32,
                                  height: 32,
                                  decoration: BoxDecoration(
                                    color: chosen ? scheme.primary : scheme.surfaceContainerHighest,
                                    shape: BoxShape.circle,
                                  ),
                                  alignment: Alignment.center,
                                  child: Text(
                                    letter,
                                    style: TextStyle(
                                      color: chosen ? Colors.white : scheme.onSurfaceVariant,
                                      fontWeight: FontWeight.w800,
                                      fontSize: 13,
                                    ),
                                  ),
                                ),
                                const SizedBox(width: 14),
                                Expanded(child: Text(label,
                                  style: TextStyle(
                                    fontSize: 14.5,
                                    fontWeight: chosen ? FontWeight.w700 : FontWeight.w500,
                                    color: chosen ? scheme.primary : null,
                                    height: 1.35,
                                  ))),
                                if (chosen)
                                  Icon(Icons.check_circle_rounded, size: 22, color: scheme.primary),
                              ]),
                            ),
                          ),
                        ),
                      );
                    }),
                  ]),
                ),
              ),
              const SizedBox(height: 16),
              Row(children: [
                OutlinedButton.icon(
                  onPressed: current == 0
                    ? null
                    : () => setState(() => quizIndex--),
                  icon: const Icon(Icons.chevron_left),
                  label: const Text('Previous')),
                const Spacer(),
                FilledButton.icon(
                  onPressed: () => setState(() {
                    if (current < questions.length - 1) {
                      quizIndex++;
                    } else {
                      quizReviewing = true;
                    }
                  }),
                  icon: Icon(current == questions.length - 1
                    ? Icons.fact_check_outlined : Icons.chevron_right),
                  label: Text(current == questions.length - 1 ? 'Review' : 'Next')),
              ]),
            ],

            if (quizError != null)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 10),
                child: Text(quizError!, style: TextStyle(color: scheme.error, fontWeight: FontWeight.w600))),

            const SizedBox(height: 14),
            // Numbered Question Dot Row
            Wrap(
              spacing: 8,
              runSpacing: 8,
              alignment: WrapAlignment.center,
              children: [
                for (var number = 0; number < questions.length; number++) ...[
                  InkWell(
                    onTap: () => setState(() {
                      quizIndex = number;
                      quizReviewing = false;
                    }),
                    borderRadius: BorderRadius.circular(10),
                    child: Container(
                      width: 36,
                      height: 36,
                      decoration: BoxDecoration(
                        color: number == current
                          ? scheme.primary
                          : (quizAnswers.containsKey(number.toString())
                              ? scheme.primary.withValues(alpha: 0.15)
                              : scheme.surfaceContainerHighest),
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(
                          color: number == current
                            ? scheme.primary
                            : (quizAnswers.containsKey(number.toString())
                                ? scheme.primary.withValues(alpha: 0.45)
                                : Colors.transparent),
                          width: 1.5,
                        ),
                      ),
                      alignment: Alignment.center,
                      child: Text(
                        '${number + 1}',
                        style: TextStyle(
                          color: number == current
                            ? Colors.white
                            : (quizAnswers.containsKey(number.toString())
                                ? scheme.primary
                                : scheme.onSurfaceVariant),
                          fontWeight: FontWeight.w800,
                          fontSize: 13,
                        ),
                      ),
                    ),
                  ),
                ],
              ],
            ),
            const SizedBox(height: 24),
          ],
        );
      },
    );
  }

  Widget _buildQuizResultView(String quizId, {required int totalPages, required int currentPage}) {
    final data = quizResult!;
    final passed = data['passed'] == true;
    final score = data['score'];
    final threshold = data['threshold'];
    final scheme = Theme.of(context).colorScheme;

    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 16),
        child: Card(
          elevation: 2.5,
          shadowColor: Colors.black.withValues(alpha: 0.1),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(24),
            side: BorderSide(
              color: passed ? const Color(0xFF16A34A).withValues(alpha: 0.3) : const Color(0xFFD97706).withValues(alpha: 0.3),
            ),
          ),
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              Container(
                width: 76,
                height: 76,
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    colors: passed
                      ? [const Color(0xFF16A34A), const Color(0xFF059669)]
                      : [const Color(0xFFD97706), const Color(0xFFB45309)],
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                  ),
                  shape: BoxShape.circle,
                  boxShadow: [
                    BoxShadow(
                      color: (passed ? const Color(0xFF16A34A) : const Color(0xFFD97706)).withValues(alpha: 0.35),
                      blurRadius: 18,
                      offset: const Offset(0, 6),
                    ),
                  ],
                ),
                child: Icon(
                  passed ? Icons.emoji_events_rounded : Icons.replay_rounded,
                  size: 40,
                  color: Colors.white,
                ),
              ),
              const SizedBox(height: 18),
              Text(
                passed
                  ? (sectionQuizIds.values.contains(quizId) ? 'Section Quiz Passed!' : 'Lesson & Quiz Passed!')
                  : 'Review Quiz Needs Retake',
                style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w900),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 8),
              Text(
                passed
                  ? 'Congratulations! You have satisfied the study requirements and unlocked the next lesson.'
                  : 'Pass mark is ${threshold ?? 70}%. You scored ${score ?? 0}%. You must pass the quiz to complete this lesson and unlock the next lesson.',
                style: TextStyle(
                  fontSize: 13.5,
                  color: scheme.onSurfaceVariant,
                  height: 1.4,
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 18),
              if (score != null) ...[
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
                  decoration: BoxDecoration(
                    color: (passed ? const Color(0xFFDCFCE7) : const Color(0xFFFEF3C7)),
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: Column(children: [
                    Text(
                      '$score%',
                      style: TextStyle(
                        fontSize: 34,
                        fontWeight: FontWeight.w900,
                        color: passed ? const Color(0xFF15803D) : const Color(0xFFB45309),
                      ),
                    ),
                    if (threshold != null)
                      Text(
                        'Pass mark: $threshold%',
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w700,
                          color: passed ? const Color(0xFF166534) : const Color(0xFF92400E),
                        ),
                      ),
                  ]),
                ),
                const SizedBox(height: 18),
              ],
              OutlinedButton.icon(
                style: OutlinedButton.styleFrom(
                  padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 12),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                ),
                onPressed: () => setState(() {
                  quizResult = null;
                  quizAnswers = {};
                  quizIndex = 0;
                  quizReviewing = false;
                  quizError = null;
                  _loadQuiz(quizId, confirmRetake: true);
                }),
                icon: const Icon(Icons.refresh),
                label: const Text('Retake quiz (unlimited attempts)')),
              const SizedBox(height: 12),
              if (currentPage < totalPages - 1) ...[
                FilledButton.icon(
                  style: FilledButton.styleFrom(
                    padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 14),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  ),
                  onPressed: () {
                    setState(() {
                      quizResult = null;
                      quizAnswers = {};
                      quizIndex = 0;
                      quizReviewing = false;
                      quizError = null;
                      quizSession = null;
                    });
                    _save(currentPage + 1);
                  },
                  icon: const Icon(Icons.arrow_forward),
                  label: const Text('Continue to next page')),
                const SizedBox(height: 8),
                TextButton(
                  onPressed: () => Navigator.pop(context, passed),
                  child: const Text('Return to guide')),
              ] else ...[
                if (passed) ...[
                  FilledButton.icon(
                    style: FilledButton.styleFrom(
                      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 14),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                      backgroundColor: const Color(0xFF16A34A),
                      foregroundColor: Colors.white,
                    ),
                    onPressed: _complete,
                    icon: const Icon(Icons.check_circle_rounded),
                    label: const Text('Complete & unlock next lesson')),
                ] else ...[
                  FilledButton.icon(
                    style: FilledButton.styleFrom(
                      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 14),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                      backgroundColor: const Color(0xFFD97706),
                      foregroundColor: Colors.white,
                    ),
                    onPressed: () => setState(() {
                      quizResult = null;
                      quizAnswers = {};
                      quizIndex = 0;
                      quizReviewing = false;
                      quizError = null;
                      _loadQuiz(quizId, confirmRetake: true);
                    }),
                    icon: const Icon(Icons.replay_rounded),
                    label: const Text('Retake quiz now')),
                  const SizedBox(height: 8),
                  TextButton.icon(
                    onPressed: () => Navigator.pop(context, false),
                    icon: const Icon(Icons.arrow_back_rounded, size: 16),
                    label: const Text('Return to guide (next lesson stays locked)')),
                ],
              ],
            ]),
          ),
        ),
      ),
    );
  }
}
