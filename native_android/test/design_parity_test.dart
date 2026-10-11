import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:vop/theme/vop_theme.dart';
import 'package:vop/widgets/vop_ui.dart';
import 'package:vop/screens/content_screen.dart';

void main() {
  test('Flutter palette matches production web design tokens', () {
    expect(VopColors.navy, const Color(0xFF003366));
    expect(VopColors.navyDeep, const Color(0xFF002D72));
    expect(VopColors.gold, const Color(0xFFE69D12));
    expect(VopTheme.build(Brightness.light).useMaterial3, isTrue);
    expect(VopTheme.build(Brightness.dark).brightness, Brightness.dark);
  });
  test('the native content categories match VOP community routes', () {
    expect(VopContentKind.resources.title, 'Study Library');
    expect(VopContentKind.radio.title, 'Radio & Media');
    expect(VopContentKind.announcements.title, 'Announcements');
    expect(VopContentKind.events.title, 'Events');
  });
  testWidgets('branded hero has an accessible real action', (tester) async {
    var pressed = false;
    await tester.pumpWidget(MaterialApp(
      theme: VopTheme.build(Brightness.light),
      home: Scaffold(body: SingleChildScrollView(
        child: VopHeroCard(
          title: 'Discover truth.',
          description: 'Continue studying.',
          icon: Icons.menu_book,
          cta: 'Explore Lessons',
          onTap: () => pressed = true,
        ),
      )),
    ));
    expect(find.text('Discover truth.'), findsOneWidget);
    expect(find.text('Explore Lessons'), findsOneWidget);
    await tester.tap(find.text('Explore Lessons'));
    expect(pressed, isTrue);
  });
  testWidgets('empty state works without network services', (tester) async {
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(body: VopEmpty(
        icon: Icons.bookmark_border,
        message: 'No lessons available.',
      )),
    ));
    expect(find.text('No lessons available.'), findsOneWidget);
  });
}
