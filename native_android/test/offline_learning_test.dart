import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:vop/core/offline_study.dart';
import 'package:vop/core/vop_localizations.dart';

void main(){
  TestWidgetsFlutterBinding.ensureInitialized();
  setUp(()=>SharedPreferences.setMockInitialValues({}));
  test('downloaded published lessons are scoped to the signed-in user and language',()async{
    final learner=OfflineStudyStore('learner-1');
    final another=OfflineStudyStore('learner-2');
    final lesson={'ok':true,'lesson':{
      'id':'lesson-a','pages':[{'title':'First section','content':'Study text'}],
    }};
    await learner.saveLesson('guide-1','lesson-a','bem',lesson);
    expect(await learner.hasLesson('guide-1','lesson-a','bem'),true);
    expect(await learner.lesson('guide-1','lesson-a','bem'),lesson);
    expect(await learner.hasLesson('guide-1','lesson-a','en'),false);
    expect(await another.hasLesson('guide-1','lesson-a','bem'),false);
  });
  test('offline lesson storage rejects incomplete or oversized documents',()async{
    final learner=OfflineStudyStore('learner');
    expect(
      () => learner.saveLesson('guide','lesson','en',{'ok':true}),
      throwsStateError,
    );
    expect(
      () => learner.saveLesson('guide','lesson','en',{
        'lesson':{'pages':[{'content':'a'*800000}]},
      }),
      throwsStateError,
    );
  });
  test('study locale validates codes and falls back to authored labels',(){
    VopLocalizations.updateStudyLanguage('bem');
    expect(VopLocalizations.studyLanguage.value,'bem');
    VopLocalizations.updateStudyLanguage('../../unsafe');
    expect(VopLocalizations.studyLanguage.value,'');
    expect(VopLocalizations.t('navigation.discover','Discover'),'Discover');
  });
}
