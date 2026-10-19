import 'package:flutter/material.dart';

import '../core/vop_api.dart';

class QuizScreen extends StatefulWidget {
  const QuizScreen({
    required this.api,
    required this.guideId,
    required this.lessonId,
    required this.language,
    required this.title,
    super.key,
  });

  final VopApi api;
  final String guideId, lessonId, language, title;

  @override
  State<QuizScreen> createState() => _QuizScreenState();
}

class _QuizScreenState extends State<QuizScreen> {
  late Future<Map<String, dynamic>> session;
  Map<String, Object?> answers = {};
  Map<String, dynamic>? result;
  bool submitting = false;
  int currentIndex = 0;
  bool reviewing = false;
  String? error;
  String? restoredSession;

  void _restore(Map<String, dynamic> data) {
    final id = (data['sessionId'] ?? '').toString();
    if (id.isEmpty || id == restoredSession) return;
    if (restoredSession != null) {
      answers = {};
      currentIndex = 0;
      reviewing = false;
    }
    restoredSession = id;
    widget.api.quizDraft(widget.language, widget.guideId, widget.lessonId, id).then((value) {
      if (mounted && value.isNotEmpty && answers.isEmpty) {
        setState(() => answers = value);
      }
    }).catchError((Object ignored) {});
  }

  void _answer(Map<String, dynamic> data, String key, Object? response) {
    setState(() => answers[key] = response);
    final id = (data['sessionId'] ?? '').toString();
    if (id.isNotEmpty) {
      widget.api.saveQuizDraft(
        widget.language,
        widget.guideId,
        widget.lessonId,
        id,
        answers,
        expiresAt: DateTime.tryParse((data['expiresAt'] ?? '').toString()),
      ).catchError((Object ignored) {});
    }
  }

  @override
  void initState() {
    super.initState();
    start();
  }

  void start({bool confirmRetake = false}) {
    session = widget.api.startQuiz(
      widget.guideId,
      widget.lessonId,
      widget.language,
      confirmRetake: confirmRetake,
    );
  }

  Future<void> submit(Map<String, dynamic> data) async {
    if (submitting) return;
    final questions = (data['questions'] as List? ?? []).whereType<Map>().toList();
    if (answers.length < questions.length) {
      final incomplete = List.generate(questions.length, (i) => i)
          .firstWhere((index) => !answers.containsKey(index.toString()), orElse: () => 0);
      setState(() {
        currentIndex = incomplete;
        reviewing = false;
        error = 'Please answer all questions before submitting.';
      });
      return;
    }
    setState(() {
      submitting = true;
      error = null;
    });
    try {
      final response = await widget.api.submitQuiz(
        widget.guideId,
        widget.lessonId,
        widget.language,
        '${data['sessionId']}',
        answers,
      );
      if (mounted) setState(() => result = response);
    } catch (e) {
      if (mounted) setState(() => error = '$e');
    } finally {
      if (mounted) setState(() => submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: Text(widget.title),
      elevation: 0,
    ),
    body: result != null
        ? resultView()
        : FutureBuilder<Map<String, dynamic>>(
            future: session,
            builder: (context, s) {
              if (s.connectionState != ConnectionState.done) {
                return const Center(child: CircularProgressIndicator());
              }
              if (s.hasError) {
                final exception = s.error;
                final retake = exception is VopApiException &&
                    exception.code == 'ASSESSMENT_RETAKE_CONFIRMATION';
                return Center(
                  child: Padding(
                    padding: const EdgeInsets.all(25),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Container(
                          width: 72,
                          height: 72,
                          decoration: BoxDecoration(
                            color: Colors.amber.withValues(alpha: 0.15),
                            shape: BoxShape.circle,
                          ),
                          child: const Icon(Icons.assignment_late_outlined, size: 36, color: Colors.amber),
                        ),
                        const SizedBox(height: 18),
                        Text(
                          '${s.error}',
                          textAlign: TextAlign.center,
                          style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15),
                        ),
                        const SizedBox(height: 20),
                        if (retake)
                          FilledButton.icon(
                            style: FilledButton.styleFrom(
                              padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
                              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                            ),
                            onPressed: () => setState(() => start(confirmRetake: true)),
                            icon: const Icon(Icons.replay_rounded),
                            label: const Text('Confirm Retake (Unlimited Attempts)'),
                          ),
                        if (!retake)
                          OutlinedButton.icon(
                            onPressed: () => setState(start),
                            icon: const Icon(Icons.refresh),
                            label: const Text('Retry'),
                          ),
                      ],
                    ),
                  ),
                );
              }

              final data = s.data ?? {};
              _restore(data);
              final questions = (data['questions'] as List? ?? []).whereType<Map>().toList();
              if (questions.isEmpty) {
                return const Center(child: Text('No published questions are available.'));
              }
              final policy = data['assessmentPolicy'] is Map ? data['assessmentPolicy'] as Map : {};
              final current = currentIndex.clamp(0, questions.length - 1).toInt();
              final question = questions[current];
              final options = (question['options'] is List)
                  ? question['options'] as List
                  : [true, false];
              final selected = answers[current.toString()];
              final scheme = Theme.of(context).colorScheme;
              final completed = answers.length;

              return ListView(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
                children: [
                  // Hero Assessment Header Banner
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
                          color: const Color(0xFF002D72).withValues(alpha: 0.25),
                          blurRadius: 14,
                          offset: const Offset(0, 4),
                        ),
                      ],
                    ),
                    padding: const EdgeInsets.all(20),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
                              decoration: BoxDecoration(
                                color: const Color(0xFFFEF3C7),
                                borderRadius: BorderRadius.circular(6),
                              ),
                              child: const Text(
                                'ASSESSMENT & VERIFICATION',
                                style: TextStyle(
                                  color: Color(0xFF92400E),
                                  fontWeight: FontWeight.w900,
                                  fontSize: 10.5,
                                  letterSpacing: 0.8,
                                ),
                              ),
                            ),
                            const Spacer(),
                            if (data['offline'] == true)
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                                decoration: BoxDecoration(
                                  color: Colors.white.withValues(alpha: 0.2),
                                  borderRadius: BorderRadius.circular(6),
                                ),
                                child: const Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    Icon(Icons.cloud_off, size: 12, color: Colors.white),
                                    SizedBox(width: 4),
                                    Text('Offline', style: TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.bold)),
                                  ],
                                ),
                              ),
                          ],
                        ),
                        const SizedBox(height: 12),
                        Text(
                          widget.title,
                          style: const TextStyle(
                            fontSize: 20,
                            fontWeight: FontWeight.w900,
                            color: Colors.white,
                            letterSpacing: -0.2,
                          ),
                        ),
                        const SizedBox(height: 6),
                        Text(
                          'Answer all questions to verify your comprehension and satisfy course completion requirements.',
                          style: TextStyle(
                            fontSize: 13,
                            color: Colors.white.withValues(alpha: 0.88),
                            height: 1.35,
                          ),
                        ),
                        const SizedBox(height: 16),
                        Row(
                          children: [
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                              decoration: BoxDecoration(
                                color: Colors.white.withValues(alpha: 0.15),
                                borderRadius: BorderRadius.circular(12),
                              ),
                              child: Text(
                                'Question ${current + 1} of ${questions.length}',
                                style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.w700),
                              ),
                            ),
                            const Spacer(),
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                              decoration: BoxDecoration(
                                color: Colors.white.withValues(alpha: 0.15),
                                borderRadius: BorderRadius.circular(12),
                              ),
                              child: Text(
                                '$completed/${questions.length} answered',
                                style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.w700),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 10),
                        ClipRRect(
                          borderRadius: BorderRadius.circular(6),
                          child: LinearProgressIndicator(
                            value: completed / questions.length,
                            minHeight: 6,
                            backgroundColor: Colors.white.withValues(alpha: 0.2),
                            valueColor: const AlwaysStoppedAnimation<Color>(Color(0xFFFBBF24)),
                          ),
                        ),
                      ],
                    ),
                  ),

                  const SizedBox(height: 20),

                  if (reviewing) ...[
                    // Review Mode
                    Text(
                      'Review Your Answers',
                      style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      'Check your answers before submitting for official verification.',
                      style: TextStyle(fontSize: 13, color: scheme.onSurfaceVariant),
                    ),
                    const SizedBox(height: 16),
                    ...questions.asMap().entries.map((entry) {
                      final hasAns = answers.containsKey(entry.key.toString());
                      return Card(
                        margin: const EdgeInsets.only(bottom: 10),
                        elevation: 1,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(14),
                          side: BorderSide(
                            color: hasAns ? const Color(0xFF16A34A).withValues(alpha: 0.3) : const Color(0xFFD97706).withValues(alpha: 0.4),
                          ),
                        ),
                        child: ListTile(
                          contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
                          leading: Container(
                            width: 32,
                            height: 32,
                            decoration: BoxDecoration(
                              color: hasAns ? const Color(0xFFDCFCE7) : const Color(0xFFFEF3C7),
                              shape: BoxShape.circle,
                            ),
                            child: Icon(
                              hasAns ? Icons.check_circle_rounded : Icons.radio_button_unchecked,
                              size: 18,
                              color: hasAns ? const Color(0xFF16A34A) : const Color(0xFFB45309),
                            ),
                          ),
                          title: Text(
                            (entry.value['prompt'] ?? entry.value['question'] ?? 'Question').toString(),
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14),
                          ),
                          subtitle: Text(
                            hasAns ? 'Answered' : 'Unanswered (tap to answer)',
                            style: TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w600,
                              color: hasAns ? const Color(0xFF16A34A) : const Color(0xFFB45309),
                            ),
                          ),
                          trailing: const Icon(Icons.edit_outlined, size: 18),
                          onTap: () => setState(() {
                            currentIndex = entry.key;
                            reviewing = false;
                          }),
                        ),
                      );
                    }),
                    const SizedBox(height: 16),
                    FilledButton.icon(
                      style: FilledButton.styleFrom(
                        padding: const EdgeInsets.symmetric(vertical: 16),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                      ),
                      onPressed: submitting || completed < questions.length ? null : () => submit(data),
                      icon: submitting
                          ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                          : const Icon(Icons.fact_check_outlined),
                      label: Text(submitting ? 'Submitting for verification…' : 'Submit for verification ($completed/${questions.length})'),
                    ),
                    const SizedBox(height: 8),
                    TextButton.icon(
                      onPressed: () => setState(() => reviewing = false),
                      icon: const Icon(Icons.arrow_back),
                      label: const Text('Back to questions'),
                    ),
                  ] else ...[
                    // Active Question Card
                    Card(
                      elevation: 2,
                      shadowColor: Colors.black.withValues(alpha: 0.08),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(20),
                        side: BorderSide(color: scheme.outlineVariant.withValues(alpha: 0.6)),
                      ),
                      clipBehavior: Clip.antiAlias,
                      child: Padding(
                        padding: const EdgeInsets.all(20),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                                  decoration: BoxDecoration(
                                    color: scheme.primary.withValues(alpha: 0.1),
                                    borderRadius: BorderRadius.circular(8),
                                  ),
                                  child: Text(
                                    'QUESTION ${current + 1} OF ${questions.length}',
                                    style: TextStyle(
                                      color: scheme.primary,
                                      fontWeight: FontWeight.w900,
                                      fontSize: 11,
                                      letterSpacing: 0.5,
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
                              ],
                            ),
                            const SizedBox(height: 14),
                            Text(
                              (question['prompt'] ?? question['question'] ?? '').toString(),
                              style: Theme.of(context).textTheme.titleMedium?.copyWith(
                                height: 1.45,
                                fontWeight: FontWeight.w700,
                                fontSize: 17,
                              ),
                            ),
                            const SizedBox(height: 20),
                            ...options.asMap().entries.map((option) {
                              final value = question['options'] is List ? option.key : option.key == 0;
                              final label = question['options'] is List
                                  ? option.value.toString()
                                  : option.key == 0 ? 'True' : 'False';
                              final chosen = selected == value;
                              final letter = String.fromCharCode(65 + option.key);

                              return Padding(
                                padding: const EdgeInsets.only(bottom: 10),
                                child: Material(
                                  color: chosen ? scheme.primary.withValues(alpha: 0.08) : scheme.surface,
                                  shape: RoundedRectangleBorder(
                                    side: BorderSide(
                                      color: chosen ? scheme.primary : scheme.outlineVariant.withValues(alpha: 0.6),
                                      width: chosen ? 2.0 : 1.0,
                                    ),
                                    borderRadius: BorderRadius.circular(14),
                                  ),
                                  clipBehavior: Clip.antiAlias,
                                  child: InkWell(
                                    onTap: () => _answer(data, current.toString(), value),
                                    child: Padding(
                                      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                                      child: Row(
                                        children: [
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
                                          Expanded(
                                            child: Text(
                                              label,
                                              style: TextStyle(
                                                fontSize: 14.5,
                                                fontWeight: chosen ? FontWeight.w700 : FontWeight.w500,
                                                color: chosen ? scheme.primary : null,
                                                height: 1.35,
                                              ),
                                            ),
                                          ),
                                          if (chosen)
                                            Icon(Icons.check_circle_rounded, size: 22, color: scheme.primary),
                                        ],
                                      ),
                                    ),
                                  ),
                                ),
                              );
                            }),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(height: 16),
                    Row(
                      children: [
                        OutlinedButton.icon(
                          onPressed: current == 0 ? null : () => setState(() => currentIndex--),
                          icon: const Icon(Icons.chevron_left),
                          label: const Text('Previous'),
                        ),
                        const Spacer(),
                        FilledButton.icon(
                          onPressed: () => setState(() {
                            if (current < questions.length - 1) {
                              currentIndex++;
                            } else {
                              reviewing = true;
                            }
                          }),
                          icon: Icon(current == questions.length - 1 ? Icons.fact_check_outlined : Icons.chevron_right),
                          label: Text(current == questions.length - 1 ? 'Review' : 'Next'),
                        ),
                      ],
                    ),
                  ],

                  if ((policy['instructions'] ?? '').toString().isNotEmpty) ...[
                    const SizedBox(height: 14),
                    Text(
                      (policy['instructions'] ?? '').toString(),
                      style: TextStyle(fontSize: 12, color: scheme.onSurfaceVariant),
                    ),
                  ],

                  if (error != null)
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 10),
                      child: Text(error!, style: TextStyle(color: scheme.error, fontWeight: FontWeight.w600)),
                    ),

                  const SizedBox(height: 16),
                  // Squircle Number Navigator
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    alignment: WrapAlignment.center,
                    children: [
                      for (var number = 0; number < questions.length; number++)
                        InkWell(
                          onTap: () => setState(() {
                            currentIndex = number;
                            reviewing = false;
                          }),
                          borderRadius: BorderRadius.circular(10),
                          child: Container(
                            width: 36,
                            height: 36,
                            decoration: BoxDecoration(
                              color: number == current
                                  ? scheme.primary
                                  : (answers.containsKey(number.toString())
                                      ? scheme.primary.withValues(alpha: 0.15)
                                      : scheme.surfaceContainerHighest),
                              borderRadius: BorderRadius.circular(10),
                              border: Border.all(
                                color: number == current
                                    ? scheme.primary
                                    : (answers.containsKey(number.toString())
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
                                    : (answers.containsKey(number.toString())
                                        ? scheme.primary
                                        : scheme.onSurfaceVariant),
                                fontWeight: FontWeight.w800,
                                fontSize: 13,
                              ),
                            ),
                          ),
                        ),
                    ],
                  ),
                ],
              );
            },
          ),
  );

  Widget resultView() {
    final data = result!;
    final scheme = Theme.of(context).colorScheme;

    if (data['queued']==true) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Card(
            elevation: 2,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Container(
                    width: 72,
                    height: 72,
                    decoration: BoxDecoration(
                      color: const Color(0xFF002D72).withValues(alpha: 0.1),
                      shape: BoxShape.circle,
                    ),
                    child: const Icon(Icons.cloud_upload_outlined, size: 38, color: Color(0xFF002D72)),
                  ),
                  const SizedBox(height: 18),
                  Text('Answers saved offline', style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w800)),
                  const SizedBox(height: 10),
                  const Text(
                    'Your attempt has been safely saved on this device. Your official result and progression unlock will be verified once connected to VOP.',
                    textAlign: TextAlign.center,
                    style: TextStyle(fontSize: 14, height: 1.4),
                  ),
                  const SizedBox(height: 20),
                  FilledButton.icon(
                    style: FilledButton.styleFrom(
                      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    ),
                    onPressed: () async {
                      final sync = await widget.api.syncPending();
                      if (!mounted) return;
                      if (sync['pending'] == 0) {
                        Navigator.pop(context, true);
                      } else {
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(content: Text('Still waiting for an internet connection.')),
                        );
                      }
                    },
                    icon: const Icon(Icons.sync),
                    label: const Text('Sync now'),
                  ),
                  const SizedBox(height: 8),
                  TextButton(
                    onPressed: () => Navigator.pop(context, false),
                    child: const Text('Return to course'),
                  ),
                ],
              ),
            ),
          ),
        ),
      );
    }

    final passed = data['passed'] == true;
    final score = data['score'];
    final threshold = data['threshold'] ?? 70;

    return Center(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Card(
          elevation: 3,
          shadowColor: Colors.black.withValues(alpha: 0.12),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(24),
            side: BorderSide(
              color: passed ? const Color(0xFF16A34A).withValues(alpha: 0.3) : const Color(0xFFD97706).withValues(alpha: 0.3),
            ),
          ),
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
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
                  passed ? 'Assessment Passed!' : 'Assessment Needs Retake',
                  style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w900),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 8),
                Text(
                  passed
                      ? 'Congratulations! You have satisfied the verification criteria and unlocked completion.'
                      : 'Pass mark is $threshold%. You scored ${score ?? 0}%. You must pass to satisfy course requirements.',
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
                    padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
                    decoration: BoxDecoration(
                      color: passed ? const Color(0xFFDCFCE7) : const Color(0xFFFEF3C7),
                      borderRadius: BorderRadius.circular(16),
                    ),
                    child: Column(
                      children: [
                        Text(
                          '$score%',
                          style: TextStyle(
                            fontSize: 36,
                            fontWeight: FontWeight.w900,
                            color: passed ? const Color(0xFF15803D) : const Color(0xFFB45309),
                          ),
                        ),
                        Text(
                          'Pass mark: $threshold%',
                          style: TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w700,
                            color: passed ? const Color(0xFF166534) : const Color(0xFF92400E),
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 20),
                ],
                if (passed) ...[
                  FilledButton.icon(
                    style: FilledButton.styleFrom(
                      padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 14),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                      backgroundColor: const Color(0xFF16A34A),
                      foregroundColor: Colors.white,
                    ),
                    onPressed: () => Navigator.pop(context, true),
                    icon: const Icon(Icons.check_circle_rounded),
                    label: const Text('Return to course & continue'),
                  ),
                ] else ...[
                  FilledButton.icon(
                    style: FilledButton.styleFrom(
                      padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 14),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                      backgroundColor: const Color(0xFFD97706),
                      foregroundColor: Colors.white,
                    ),
                    onPressed: () => setState(() {
                      result = null;
                      answers = {};
                      currentIndex = 0;
                      reviewing = false;
                      error = null;
                      start(confirmRetake: true);
                    }),
                    icon: const Icon(Icons.replay_rounded),
                    label: const Text('Retake assessment now'),
                  ),
                  const SizedBox(height: 8),
                  TextButton.icon(
                    onPressed: () => Navigator.pop(context, false),
                    icon: const Icon(Icons.arrow_back_rounded, size: 16),
                    label: const Text('Return to guide (stays incomplete)'),
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}
