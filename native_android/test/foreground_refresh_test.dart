import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:vop/core/foreground_refresh.dart';

void main() {
  testWidgets('conversation refresh only runs while app is foregrounded', (tester) async {
    var refreshes = 0;
    final controller = ForegroundRefreshController(
      interval: const Duration(seconds: 2),
      onRefresh: () => refreshes++,
    );

    await tester.pump(const Duration(seconds: 2));
    expect(refreshes, 1);

    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
    await tester.pump(const Duration(seconds: 4));
    expect(refreshes, 1);

    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pump(const Duration(seconds: 2));
    expect(refreshes, 2);

    controller.dispose();
    await tester.pump(const Duration(seconds: 4));
    expect(refreshes, 2);
  });
}
