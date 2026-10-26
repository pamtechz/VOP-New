import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:vop/widgets/plate_document_editor.dart';

Map<String, dynamic> initialParagraph() => {
  'id': 'stable-block-one',
  'type': 'p',
  'children': [{'text': 'Before'}],
};

String firstText(List<Map<String, dynamic>> document) {
  final children = document.first['children'] as List;
  return (children.first as Map)['text'] as String;
}

void main() {
  testWidgets('Flutter Plate undo and redo restore content without changing block IDs',
      (tester) async {
    final written = <List<Map<String, dynamic>>>[];
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(body: SingleChildScrollView(
        child: PlateDocumentEditor(
          document: [initialParagraph()],
          onChanged: written.add,
        ),
      )),
    ));

    expect(find.byTooltip('Undo'), findsOneWidget);
    expect(find.byTooltip('Redo'), findsOneWidget);
    expect(find.text('Before'), findsOneWidget);

    await tester.enterText(find.byType(TextFormField).first, 'After');
    await tester.pump();
    expect(written, isNotEmpty);
    expect(firstText(written.last), 'After');
    expect(written.last.first['id'], 'stable-block-one');

    await tester.tap(find.byTooltip('Undo'));
    await tester.pump();
    expect(firstText(written.last), 'Before');
    expect(written.last.first['id'], 'stable-block-one');

    await tester.tap(find.byTooltip('Redo'));
    await tester.pump();
    expect(firstText(written.last), 'After');
    expect(written.last.first['id'], 'stable-block-one');

    // Undo, then make a new edit: the obsolete redo chain must be discarded.
    await tester.tap(find.byTooltip('Undo'));
    await tester.pump();
    await tester.enterText(find.byType(TextFormField).first, 'Different');
    await tester.pump();
    expect(firstText(written.last), 'Different');
    final redo = tester.widget<IconButton>(find.byTooltip('Redo'));
    expect(redo.onPressed, isNull);
    expect(tester.takeException(), isNull);
  });

  testWidgets('the final block cannot be removed from a lesson section',
      (tester) async {
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(body: SingleChildScrollView(
        child: PlateDocumentEditor(document: [initialParagraph()],
            onChanged: (_) {}),
      )),
    ));
    final remove = tester.widget<IconButton>(find.byTooltip('Remove block'));
    expect(remove.onPressed, isNull);
    expect(tester.takeException(), isNull);
  });
}
