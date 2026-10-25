import 'package:flutter/material.dart';
import '../core/vop_api.dart';
import '../screens/workspace_navigation.dart';

/// Shared desktop surface for Classic web administration routes.
/// Keeps mobile pages native and preserves their original responsive logic.
class VopDesktopWorkspaceFrame extends StatelessWidget {
  const VopDesktopWorkspaceFrame({
    required this.api,
    required this.child,
    this.maxContentWidth = 1460,
    super.key,
  });
  final VopApi api;
  final Widget child;
  final double maxContentWidth;

  static bool isDesktop(BuildContext context) =>
    MediaQuery.sizeOf(context).width >= 1160;

  @override
  Widget build(BuildContext context) {
    if (!isDesktop(context)) return child;
    final theme = Theme.of(context);
    return Row(children: [
      SizedBox(width: 258, child: Material(
        color: theme.colorScheme.surface,
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Padding(padding: const EdgeInsets.fromLTRB(18, 22, 14, 15),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('VOP WORKSPACE', style: theme.textTheme.labelMedium?.copyWith(
                fontWeight: FontWeight.w900,
                color: theme.colorScheme.primary,
                letterSpacing: 1)),
              const SizedBox(height: 6),
              Text('Quick navigation',
                style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
            ])),
          const Divider(height: 1),
          Expanded(child: ListView(padding: const EdgeInsets.fromLTRB(10, 10, 10, 20),
            children: [WorkspaceNavigation(api: api, compact: true)])),
        ]),
      )),
      const VerticalDivider(width: 1),
      Expanded(child: ColoredBox(color: theme.colorScheme.surfaceContainerLowest,
        child: Center(child: ConstrainedBox(
          constraints: BoxConstraints(maxWidth: maxContentWidth),
          child: child,
        )),
      )),
    ]);
  }
}

/// A readable content column inside web pages, unconstrained on Android.
class VopDesktopContent extends StatelessWidget {
  const VopDesktopContent({required this.child, this.maxWidth = 1420, super.key});
  final Widget child;
  final double maxWidth;
  @override
  Widget build(BuildContext context) {
    if (MediaQuery.sizeOf(context).width < 1000) return child;
    return Center(child: ConstrainedBox(
      constraints: BoxConstraints(maxWidth: maxWidth), child: child));
  }
}
