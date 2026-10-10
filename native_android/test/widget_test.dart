import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:vop/main.dart';

void main() {
  testWidgets('native app fails closed when build config is missing',
      (WidgetTester tester) async {
    await tester.pumpWidget(const VopAndroidApp());
    expect(find.byType(MaterialApp), findsOneWidget);
    expect(find.text('Configuration required'), findsOneWidget);
  });
}
