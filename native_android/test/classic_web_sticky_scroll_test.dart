import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:vop/widgets/classic_web_lesson_studio.dart';

Map<String, dynamic> longLesson() => {
  'id': 'lesson-one',
  'title': 'KUTI TWA SUMINA MULI LESA',
  'lessonNumber': '01',
  'guideId': 'ukusanga',
  'language': 'BEM',
  'chapters': [
    {
      'id': 'chapter-one',
      'title': 'Ukusanga',
      'sections': [
        for (var page = 0; page < 6; page++)
          {
            'id': 'section-$page',
            'title': 'LEARNER PAGE ${page + 1}',
            'document': [
              for (var block = 0; block < 12; block++)
                {
                  'id': 'block-$page-$block',
                  'type': 'p',
                  'children': [
                    {'text': 'Long form lesson text with scripture and explanation. '
                      'Keep the lesson header and editing toolbar visible. '}
                  ],
                },
            ],
          },
      ],
    },
  ],
};

void main() {
  testWidgets('sticky ribbon remains pinned when document is scrolled',
      (tester) async {
    tester.view.physicalSize = const Size(1440, 820);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final lesson = longLesson();
    await tester.pumpWidget(MaterialApp(home: Scaffold(body:
      ClassicWebLessonStudio(
        value: lesson, guideTitle: 'UKUSANGA', saving: false,
        onChanged: () {}, onSave: () {}, onQuiz: () {},
        onAdvanced: () {},
      ),
    )));
    await tester.pumpAndSettle();
    final ribbon = find.byKey(const ValueKey('classic-sticky-ribbon'));
    final scrollFinder = find.byKey(const PageStorageKey('classic-document-scroll'));
    final outlineFinder = find.byKey(const PageStorageKey('classic-outline-scroll'));
    expect(ribbon, findsOneWidget);
    expect(scrollFinder, findsOneWidget);
    expect(outlineFinder, findsOneWidget);

    final firstTop = tester.getTopLeft(ribbon).dy;
    final document = tester.widget<SingleChildScrollView>(scrollFinder).controller!;
    final outline = tester.widget<ListView>(outlineFinder).controller!;
    expect(identical(document, outline), isFalse);
    expect(document.hasClients, isTrue);
    expect(document.position.maxScrollExtent, greaterThan(500));
    document.jumpTo(500);
    await tester.pumpAndSettle();
    expect(tester.getTopLeft(ribbon).dy, closeTo(firstTop, .1));
    expect(document.offset, closeTo(500, 1));
    expect(outline.offset, 0);
    expect(tester.takeException(), isNull);
  });

  testWidgets('clicking page outline scrolls only the document and keeps ribbon pinned',
      (tester) async {
    tester.view.physicalSize = const Size(1280, 800);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final lesson = longLesson();
    await tester.pumpWidget(MaterialApp(home: Scaffold(body:
      ClassicWebLessonStudio(
        value: lesson, guideTitle: 'UKUSANGA', saving: false,
        onChanged: () {}, onSave: () {}, onQuiz: () {},
        onAdvanced: () {},
      ),
    )));
    await tester.pumpAndSettle();
    final ribbon = find.byKey(const ValueKey('classic-sticky-ribbon'));
    final firstTop = tester.getTopLeft(ribbon).dy;
    final scrollFinder = find.byKey(const PageStorageKey('classic-document-scroll'));
    final document = tester.widget<SingleChildScrollView>(scrollFinder).controller!;
    expect(document.offset, 0);
    final target = find.byKey(const ValueKey('classic-page-button-section-4'));
    await tester.ensureVisible(target);
    await tester.pumpAndSettle();
    await tester.tap(target);
    await tester.pumpAndSettle();
    expect(document.offset, greaterThan(500));
    expect(tester.getTopLeft(ribbon).dy, closeTo(firstTop, .1));
    expect(tester.takeException(), isNull);
  });
}
