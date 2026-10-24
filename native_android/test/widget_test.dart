import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:vop/main.dart';

void main() {
  for (final direction in [ViewFocusDirection.forward, ViewFocusDirection.backward]) {
    testWidgets('startup accepts $direction view focus before the first layout', (tester) async {
      await tester.pumpWidget(
        VopAndroidApp(initialization: Future<String?>.value(null)),
        phase: EnginePhase.build,
      );
      tester.binding.handleViewFocusChanged(ViewFocusEvent(
        viewId: tester.view.viewId,
        state: ViewFocusState.focused,
        direction: direction,
      ));
      await tester.pump();
      expect(tester.takeException(), isNull);
      expect(find.text('Configuration required'), findsOneWidget);
    });
  }
  testWidgets('native app fails closed when build config is missing',
      (WidgetTester tester) async {
    await tester.pumpWidget(
      VopAndroidApp(initialization: Future<String?>.value(null)),
    );
    expect(find.byType(MaterialApp), findsOneWidget);
    expect(find.text('Configuration required'), findsOneWidget);
  });
}
