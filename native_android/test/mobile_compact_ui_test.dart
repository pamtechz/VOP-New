import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:vop/screens/home_shell.dart';
import 'package:vop/theme/vop_theme.dart';
import 'package:vop/widgets/vop_ui.dart';

void main() {
  test('display name never becomes an awkward single-letter greeting', () {
    expect(welcomeGreeting('P'), 'Welcome back');
    expect(welcomeGreeting(''), 'Welcome back');
    expect(welcomeGreeting('  Philip Mulima '), 'Hello, Philip');
    expect(welcomeGreeting('P. Philip'), 'Hello, Philip');
  });

  testWidgets('mobile discover hero stays compact with working CTA',
      (tester) async {
    var pressed = false;
    await tester.pumpWidget(MaterialApp(
      theme: VopTheme.build(Brightness.dark),
      home: Scaffold(body: Center(child: SizedBox(width: 360,
        child: VopHeroCard(
          title: 'Discover truth.\nGrow in faith.',
          description: 'Continue your Bible study journey and explore lessons.',
          icon: Icons.menu_book,
          cta: 'Explore Lessons',
          onTap: () => pressed = true,
        ),
      ))),
    ));
    final size = tester.getSize(find.byType(VopHeroCard));
    expect(size.height, lessThan(250));
    expect(size.width, 360);
    await tester.tap(find.text('Explore Lessons'));
    expect(pressed, isTrue);
  });

  testWidgets('non-interactive study hero has no fake action', (tester) async {
    await tester.pumpWidget(MaterialApp(
      theme: VopTheme.build(Brightness.light),
      home: const Scaffold(body: Center(child: SizedBox(width: 360,
        child: VopHeroCard(
          title: 'Lessons for life.',
          description: 'Explore the Bible at your own pace.',
          icon: Icons.auto_stories,
        ),
      ))),
    ));
    expect(tester.getSize(find.byType(VopHeroCard)).height, lessThan(180));
    expect(find.byType(FilledButton), findsNothing);
  });

  testWidgets('course card handles a missing published image', (tester) async {
    await tester.pumpWidget(MaterialApp(
      theme: VopTheme.build(Brightness.dark),
      home: Scaffold(body: SizedBox(width: 390,
        child: VopCourseCard(
          title: 'UKUSANGA',
          description: '',
          language: 'bem',
          imageUrl: '',
          onTap: () {},
        ),
      )),
    ));
    expect(find.text('UKUSANGA'), findsOneWidget);
    expect(find.text('BEM'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
