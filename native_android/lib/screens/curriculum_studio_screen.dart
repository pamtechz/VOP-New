import 'package:flutter/material.dart';
import '../core/vop_api.dart';
import 'workspace_records_screen.dart';

class CurriculumStudioScreen extends StatelessWidget {
  const CurriculumStudioScreen({required this.api, super.key});
  final VopApi api;
  @override
  Widget build(BuildContext context) => DefaultTabController(
    length: 3,
    child: Scaffold(
      appBar: AppBar(title: const Text('Curriculum Studio'), bottom: const TabBar(
        tabs: [Tab(text: 'Programs'), Tab(text: 'Guides & lessons'), Tab(text: 'Assessments')],
      )),
      body: TabBarView(children: [
        for (final collection in ['programs', 'guides', 'quizzes'])
          WorkspaceRecordsScreen(api: api, collection: collection),
      ]),
    ),
  );
}
