import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:store_marketplace/main.dart';

void main() {
  testWidgets('MarketplaceApp smoke test', (WidgetTester tester) async {
    await tester.pumpWidget(const ProviderScope(child: MarketplaceApp()));
    expect(find.byType(MarketplaceApp), findsOneWidget);
  });
}
