import 'package:flutter/material.dart';

import '../core/vop_api.dart';
import '../screens/workspace_navigation.dart';
import 'vop_ui.dart';

/// Persistent role-aware management navigation on desktop. All destinations
/// come from the authenticated workspace permission schema; none are invented
/// or presented to roles that do not have the corresponding access.
class WorkspaceDesktopShell extends StatelessWidget {
  const WorkspaceDesktopShell({
    required this.api,
    required this.title,
    required this.child,
    super.key,
  });
  final VopApi api;
  final String title;
  final Widget child;

  static bool activeFor(BuildContext context) =>
      MediaQuery.sizeOf(context).width >= 1180;

  @override
  Widget build(BuildContext context) {
    if (!activeFor(context)) return child;
    final theme = Theme.of(context);
    return Row(children: [
      SizedBox(
        width: 258,
        child: Material(
          color: theme.colorScheme.surface,
          child: Column(children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 22, 16, 15),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const VopBrand(),
                  const SizedBox(height: 18),
                  Text(title,
                    style: theme.textTheme.titleMedium?.copyWith(
                      fontWeight: FontWeight.w900)),
                  const SizedBox(height: 3),
                  Text('Management services',
                    style: theme.textTheme.bodySmall),
                ],
              ),
            ),
            const Divider(height: 1),
            Expanded(child: ListView(
              padding: const EdgeInsets.symmetric(
                horizontal: 10, vertical: 12),
              children: [
                WorkspaceNavigation(api: api, compact: true),
              ],
            )),
          ]),
        ),
      ),
      const VerticalDivider(width: 1),
      Expanded(child: child),
    ]);
  }
}
