import 'dart:async';
import 'package:flutter/widgets.dart';

class ForegroundRefreshController with WidgetsBindingObserver {
  ForegroundRefreshController({
    required this.onRefresh,
    this.interval = const Duration(seconds: 30),
  }) {
    final lifecycle = WidgetsBinding.instance.lifecycleState;
    _foreground = lifecycle == null || lifecycle == AppLifecycleState.resumed;
    WidgetsBinding.instance.addObserver(this);
    _timer = Timer.periodic(interval, (_) {
      if (_foreground) onRefresh();
    });
  }

  final VoidCallback onRefresh;
  final Duration interval;
  Timer? _timer;
  bool _foreground = true;

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    _foreground = state == AppLifecycleState.resumed;
  }

  void dispose() {
    _timer?.cancel();
    _timer = null;
    WidgetsBinding.instance.removeObserver(this);
  }
}
