import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:vop/widgets/plate_page.dart';

void main() {
  for (final width in [320.0, 390.0, 1024.0]) {
    testWidgets('Scripture focus fits viewport at width $width',
        (tester) async {
      tester.view.physicalSize = Size(width, 570);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      await tester.pumpWidget(MaterialApp(
        home: Scaffold(
          body: SingleChildScrollView(
            child: PlatePageView(page: {
              'title': 'The Good News',
              'scriptureQuote': {
                'text': 'For God so loved the world.',
                'reference': 'A deliberately long Bible citation for small-screen layout testing that must wrap correctly rather than pushing controls outside the viewport',
              },
              'keyTakeaway': 'God loves every person.',
              'document': [
                {'id': 'intro', 'type': 'p', 'children': [{'text': 'Welcome.'}]},
              ],
            }),
          ),
        ),
      ));
      expect(tester.takeException(), isNull);
      expect(find.text('Explore Passage Details'), findsOneWidget);
      await tester.ensureVisible(find.text('Explore Passage Details'));
      await tester.tap(find.text('Explore Passage Details'));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      expect(find.text('HOLY SCRIPTURE FOCUS'), findsOneWidget);
      expect(find.text('Back to Study'), findsOneWidget);
      await Scrollable.ensureVisible(
        tester.element(find.text('Back to Study')),
        alignment: 0.5,
        duration: const Duration(milliseconds: 160),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('Back to Study'));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
    });
  }

  testWidgets('long Scripture details sheet scrolls on a compact phone',
      (tester) async {
    tester.view.physicalSize = const Size(320, 480);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(MaterialApp(
      home: Scaffold(body: SingleChildScrollView(child: PlatePageView(page: {
        'scriptureQuote': {
          'reference': 'Psalm 119:105',
          'text': List.filled(110, 'Your word is a lamp to my feet.').join(' '),
        },
        'document': [
          {'id': 'opening', 'type': 'p', 'children': [{'text': 'Reflect.'}]},
        ],
      }))),
    ));
    await tester.ensureVisible(find.text('Explore Passage Details'));
    await tester.tap(find.text('Explore Passage Details'));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    final close = find.text('Back to Study');
    await tester.drag(find.byType(SingleChildScrollView).last, const Offset(0, -2000));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    await Scrollable.ensureVisible(
      tester.element(close),
      alignment: 0.45,
      duration: const Duration(milliseconds: 160),
    );
    await tester.pumpAndSettle();
    await tester.tap(close);
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
  });
}
