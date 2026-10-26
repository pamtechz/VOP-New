import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:vop/screens/workspace_records_screen.dart';

void main() {
  for (final width in [320.0, 390.0, 1024.0]) {
    testWidgets('Flutter lesson chapter form fits and creates valid nested content at $width px',
        (tester) async {
      tester.view.physicalSize = Size(width, 760);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      final data = <String, dynamic>{'chapters': <Map<String, dynamic>>[]};
      final schema = <Map<String, dynamic>>[{
        'key': 'chapters',
        'label': 'Chapters',
        'type': 'list',
        'fields': [
          {'key': 'id', 'label': 'Reference'},
          {'key': 'title', 'label': 'Chapter title'},
          {'key': 'sections', 'label': 'Sections', 'type': 'list', 'fields': [
            {'key': 'id', 'label': 'Section reference'},
            {'key': 'title', 'label': 'Section title'},
            {'key': 'document', 'label': 'Rich lesson content', 'type': 'plate'},
          ]},
        ],
      }];
      await tester.pumpWidget(MaterialApp(
        home: Scaffold(body: StatefulBuilder(
          builder: (context, update) => ListView(children: [
            SchemaFields(
              fields: schema,
              value: data,
              options: const {},
              onChanged: () => update(() {}),
            ),
          ]),
        )),
      ));
      expect(tester.takeException(), isNull);
      // The add control can be below the fold on compact viewports.
      await tester.ensureVisible(find.text('Add Chapters'));
      await tester.tap(find.text('Add Chapters'));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      final chapters = recordRows(data['chapters']);
      expect(chapters.length, 1);
      final sections = recordRows(chapters.single['sections']);
      expect(sections.length, 1);
      expect(sections.single['title'], 'New section');
      final document = recordRows(sections.single['document']);
      expect(document.single['type'], 'p');
      expect(document.single['id'], isNotEmpty);
      expect(find.text('New chapter'), findsWidgets);

      // The existing chapter must remain usable after a second insertion.
      await tester.ensureVisible(find.text('Add Chapters'));
      await tester.tap(find.text('Add Chapters'));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      expect(recordRows(data['chapters']).length, 2);
      final first = recordRows(data['chapters']).first;
      final second = recordRows(data['chapters']).last;
      expect(first['id'], isNot(second['id']));
      expect(tester.takeException(), isNull);
    });
  }
}
