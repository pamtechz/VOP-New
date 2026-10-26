import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:vop/widgets/lesson_section_studio.dart';

void main() {
  for (final width in [320.0, 390.0, 1100.0]) {
    testWidgets('lesson studio selects and focuses a canonical section at $width px',
        (tester) async {
      tester.view.physicalSize=Size(width,820);
      tester.view.devicePixelRatio=1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      final chapters=<Map<String,dynamic>>[{
        'id':'chapter-one','title':'Beliefs',
        'sections':[
          {'id':'section-one','title':'First section','document':[
            {'id':'block-one','type':'p','children':[{'text':'Beginning'}]},
          ]},
          {'id':'section-two','title':'Evidence','document':[
            {'id':'block-two','type':'p','children':[{'text':'Reasoning'}]},
          ]},
        ],
      }];
      final data=<String,dynamic>{'chapters':chapters};
      var changed=0;
      var saved=0;
      await tester.pumpWidget(MaterialApp(home:Scaffold(body:
        SingleChildScrollView(child:StatefulBuilder(builder:(context,update)=>
          LessonSectionStudio(
            value:data,
            saving:false,
            onChanged:()=>update(()=>changed++),
            onSave:()=>saved++,
            onQuiz:(){},
            onAdvanced:(){},
          ),
        )),
      )));
      expect(tester.takeException(),isNull);
      expect(find.text('SECTION 1'),findsOneWidget);
      final destination=find.text('2. Evidence');
      await tester.ensureVisible(destination);
      await tester.tap(destination);
      await tester.pumpAndSettle();
      expect(find.text('SECTION 2'),findsOneWidget);
      expect(tester.takeException(),isNull);
      await tester.ensureVisible(find.text('Add Block'));
      await tester.tap(find.text('Add Block'));
      await tester.pumpAndSettle();
      expect(changed,greaterThan(0));
      final savedSections=(data['chapters'] as List).first['sections'] as List;
      expect(savedSections.first['id'],'section-one');
      expect(savedSections.last['id'],'section-two');
      expect((savedSections.last['document'] as List).length,2);
      expect((savedSections.first['document'] as List).length,1);
      expect(tester.takeException(),isNull);
      await tester.ensureVisible(find.text('Update'));
      await tester.tap(find.text('Update'));
      expect(saved,1);
    });
  }
}
