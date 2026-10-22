import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:vop/widgets/vop_section_study_card.dart';

Widget studyCard({
  bool locked = false,
  VoidCallback? onOpen,
  VoidCallback? onTakeTest,
  VoidCallback? onFlashcards,
  VoidCallback? onEditQuestions,
}) => MaterialApp(
  home: Scaffold(
    body: ListView(
      children: [
        VopSectionStudyCard(
          title: 'A published section with a descriptive title',
          description: 'Reading material from the selected guide.',
          number: '2',
          pageCount: 3,
          readMinutes: 8,
          completed: false,
          locked: locked,
          onOpen: onOpen,
          onTakeTest: onTakeTest,
          onFlashcards: onFlashcards,
          onEditQuestions: onEditQuestions,
        ),
      ],
    ),
  ),
);

void main() {
  for (final width in [360.0, 1280.0]) {
    testWidgets('learner study actions fit at width $width without editing', (
      tester,
    ) async {
      tester.view.physicalSize = Size(width, 900);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      var opened = false;
      var tested = false;
      var flashed = false;
      await tester.pumpWidget(
        studyCard(
          onOpen: () => opened = true,
          onTakeTest: () => tested = true,
          onFlashcards: () => flashed = true,
        ),
      );
      expect(tester.takeException(), isNull);
      expect(find.text('Edit Chapter Questions'), findsNothing);
      expect(find.text('3 pages'), findsOneWidget);
      await tester.tap(find.textContaining('Section 2:'));
      await tester.tap(find.text('Take Test'));
      await tester.tap(find.text('Flashcards'));
      expect(opened && tested && flashed, isTrue);
    });
  }

  testWidgets('question editing requires an explicit editor callback', (
    tester,
  ) async {
    var edited = false;
    await tester.pumpWidget(studyCard(onEditQuestions: () => edited = true));
    await tester.tap(find.text('Edit Chapter Questions'));
    expect(edited, isTrue);
  });

  testWidgets('locked sections cannot open reading, tests or flashcards', (
    tester,
  ) async {
    var invoked = false;
    void invoke() => invoked = true;
    await tester.pumpWidget(
      studyCard(
        locked: true,
        onOpen: invoke,
        onTakeTest: invoke,
        onFlashcards: invoke,
      ),
    );
    expect(find.text('Locked'), findsOneWidget);
    expect(find.text('Take Test'), findsNothing);
    expect(find.text('Flashcards'), findsNothing);
    await tester.tap(find.textContaining('Section 2:'));
    expect(invoked, isFalse);
  });
}
