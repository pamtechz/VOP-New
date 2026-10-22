import 'package:flutter/material.dart';
import 'package:flutter/foundation.dart';

import '../core/vop_api.dart';
import 'learner_support_screen.dart';
import 'lesson_screen.dart';
import 'quiz_screen.dart';
import 'lesson_flashcards_screen.dart';
import '../widgets/vop_section_study_card.dart';

class GuideScreen extends StatefulWidget {
  const GuideScreen({required this.api,required this.guideId,
    this.canEditChapterQuestions=false,this.onEditQuestions,super.key});
  final VopApi api;
  final String guideId;
  final bool canEditChapterQuestions;
  final void Function(String lessonId)? onEditQuestions;
  @override State<GuideScreen> createState()=>_GuideScreenState();
}
class _GuideScreenState extends State<GuideScreen> {
  late Future<Map<String,dynamic>> guide;
  bool downloading=false;
  Future<void> download()async{
    if (downloading) return;
    setState(()=>downloading=true);
    try{
      final count=await widget.api.downloadGuide(widget.guideId);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content:Text('$count lessons saved for offline study.')));
      }
    }catch(error){
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content:Text('Download failed: $error')));
      }
    }finally{
      if (mounted) setState(()=>downloading=false);
    }
  }
  Future<void> askForHelp() async {
    try {
      final result = await guide;
      final details = result['guide'];
      final title = details is Map
        ? (details['title'] ?? 'Study guide').toString()
        : 'Study guide';
      if (!mounted) return;
      await Navigator.push<void>(context, MaterialPageRoute(
        builder: (_) => LearnerSupportScreen(
          api: widget.api,
          initialReference: StudySupportReference(
            type: 'guide', id: widget.guideId,
            label: title, route: 'guide',
          ),
          openComposerOnStart: true,
        ),
      ));
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(error.toString())));
      }
    }
  }
  @override void initState(){super.initState();reload();}
  void reload(){guide=widget.api.guide(widget.guideId);}

  Future<void> _confirmResetLesson(Map<String, dynamic> lesson, String language) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Reset Lesson Progress?'),
        content: Text(
          'This will reset your completion and review quiz scores for "${lesson['title'] ?? 'this lesson'}". Subsequent lessons will be re-locked until you complete this lesson again.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: Theme.of(ctx).colorScheme.error),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Reset Progress'),
          ),
        ],
      ),
    );

    if (confirmed == true) {
      try {
        await widget.api.resetLessonProgress(widget.guideId, '${lesson['id']}', language);
        if (mounted) {
          setState(reload);
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Lesson progress reset. Subsequent lessons have been re-locked.')),
          );
        }
      } catch (e) {
        if (mounted) {
          final errorText = e.toString();
          final isPendingDeployment = errorText.contains('400') || errorText.contains('valid study progress');
          if (isPendingDeployment) {
            setState(reload);
          }
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(
                isPendingDeployment
                  ? 'Local progress reset. Deploy the latest backend update to sync reset remotely.'
                  : 'Failed to reset lesson progress: $e',
              ),
            ),
          );
        }
      }
    }
  }
  @override Widget build(BuildContext context)=>Scaffold(
    appBar:AppBar(title:const Text('Study guide'),
      actions:[
        IconButton(onPressed:askForHelp,
          icon:const Icon(Icons.support_agent_outlined),
          tooltip:'Ask for help with this course'),
        IconButton(onPressed:kIsWeb||downloading?null:download,
          tooltip:kIsWeb ? 'Encrypted offline lessons require the Android app' : 'Download lessons',
          icon:downloading?const SizedBox(width:18,height:18,
            child:CircularProgressIndicator(strokeWidth:2)):
            const Icon(Icons.download_for_offline_outlined)),
        IconButton(onPressed:()=>setState(reload),
          icon:const Icon(Icons.refresh),tooltip:'Reload guide'),
      ]),
    body:FutureBuilder<Map<String,dynamic>>(
      future:guide,
      builder:(context,s){
        if(s.connectionState!=ConnectionState.done){
          return const Center(child:CircularProgressIndicator());
        }
        if (s.hasError) {
          return Center(child:Padding(padding:const EdgeInsets.all(20),
            child:Text('${s.error}',textAlign:TextAlign.center)));
        }
        final data=s.data??{};
        final details=data['guide'] as Map? ?? {};
        final lessons=(data['lessons'] as List? ?? [])
            .whereType<Map>().map((e)=>Map<String,dynamic>.from(e)).toList();
        final studyLessons=lessons.where((e)=>e['type']!='Test').toList();
        final guideAssessments=lessons.where((e)=>e['type']=='Test'&&e['attachmentType']=='guide').toList();
        final title='${details['title']??'Study guide'}';
        final rawLang='${details['language']??''}'.trim().toLowerCase();
        final language=rawLang.isNotEmpty&&rawLang!='null'?rawLang:'en';
        return RefreshIndicator(
          onRefresh:()async{setState(reload);await guide;},
          child:ListView(padding:const EdgeInsets.all(16),children:[
            Text(title,style:Theme.of(context).textTheme.headlineSmall?.copyWith(
              fontWeight:FontWeight.w800)),
            const SizedBox(height:9),
            Text('${details['description']??''}'),
            const SizedBox(height:17),
            Row(children:[
              Chip(label:Text(language.toUpperCase())),
              if(data['offline']==true)...[
                const SizedBox(width:9),
                const Chip(avatar:Icon(Icons.offline_bolt_outlined,size:16),
                  label:Text('Offline')),
              ],
            ]),
            const SizedBox(height:16),
            Text(details['learnerEntryMode']=='sections'?'Sections':'Lessons',
              style:Theme.of(context).textTheme.titleLarge),
            const SizedBox(height:8),
            if(studyLessons.isEmpty)const Padding(padding:EdgeInsets.all(25),
              child:Text('There are no published lessons in this guide.')),
            ...studyLessons.expand((lesson){
              final locked=lesson['locked']==true;
              final completed=lesson['completed']==true;
              final attached=lessons.firstWhere(
                (e)=>e['type']=='Test'&&e['attachmentType']!='guide'&&e['assessmentKind']!='final_exam'&&(
                  e['attachedLessonId']==lesson['id']||
                  e['lessonId']==lesson['id']||
                  e['id']=='quiz_${lesson['id']}'||
                  e['id']=='quiz-${lesson['id']}'||
                  (lesson['quizLessonId']!=null&&(e['id']==lesson['quizLessonId']||e['sourceQuizId']==lesson['quizLessonId']))||
                  (lesson['attachedQuizId']!=null&&(e['id']==lesson['attachedQuizId']||e['sourceQuizId']==lesson['attachedQuizId']))||
                  ((e['attachedLessonId']==null||'${e['attachedLessonId']}'.isEmpty)&&e['lessonId']==lesson['id'])),
                orElse:()=><String,dynamic>{});
              final currentIndex = studyLessons.indexOf(lesson);
              String lockedReason = 'Finish earlier lessons to unlock';
              if (locked && currentIndex > 0) {
                final prevLesson = studyLessons[currentIndex - 1];
                final prevCompleted = prevLesson['completed'] == true;
                if (prevCompleted) {
                  lockedReason = 'Pass previous lesson review quiz to unlock';
                } else {
                  lockedReason = 'Complete previous lesson & quiz to unlock';
                }
              }

              final pageCount=lesson['pageCount'] is num
                ?(lesson['pageCount'] as num).toInt().clamp(0,200).toInt():0;
              final time=(lesson['estimatedMinutes'] is num
                ?(lesson['estimatedMinutes'] as num).toInt():15).clamp(1,240).toInt();
              // Chapter/section-first guides show one card per authored section.
              // Other guides retain a single lesson card for every lesson.
              final outlines=(lesson['sections'] as List? ?? [])
                .whereType<Map>().map((part)=>Map<String,dynamic>.from(part)).toList();
              final sectionFirst=details['learnerEntryMode']=='sections';
              final cardRows=sectionFirst&&outlines.isNotEmpty
                ?outlines:<Map<String,dynamic>>[{}];
              return cardRows.map((section){
                final isSection=section.isNotEmpty;
                final startPage=section['pageIndex'] is num
                  ?(section['pageIndex'] as num).toInt():0;
                final sectionPages=section['pageCount'] is num
                  ?(section['pageCount'] as num).toInt().clamp(0,200).toInt():pageCount;
                final sectionTitle=isSection
                  ?(section['title']??'').toString():(lesson['title']??'Lesson').toString();
                final sectionId=isSection?(section['id']??'').toString():null;
                final anchoredTest=isSection?lessons.where((e)=>
                    e['type']=='Test'&&e['attachmentType']=='section'&&
                    e['anchorId']==sectionId&&e['published']!=false)
                  .toList():<Map<String,dynamic>>[];
                final chosenTest=anchoredTest.isNotEmpty?anchoredTest.first:
                  (!isSection||section['number']==outlines.length)
                    ?attached:<String,dynamic>{};
                final chosenQuizId=chosenTest.isNotEmpty
                  ?(chosenTest['id']??'').toString():null;
                final sectionMinutes=isSection&&outlines.isNotEmpty
                  ?(time/outlines.length).ceil().clamp(1,240).toInt():time;
              Future<void> openLesson()async{
                await Navigator.push(context,MaterialPageRoute<void>(
                  builder:(_)=>LessonScreen(
                    api:widget.api,
                    guideId:widget.guideId,
                    lessonId:'${lesson['id']}',
                    language:language,
                    title:'${lesson['title']}',
                    attachedQuizId:chosenQuizId,
                    initialPageIndex:isSection?startPage:null,
                  ),
                ));
                if(mounted)setState(reload);
              }
              return VopSectionStudyCard(
                title:sectionTitle,
                headingLabel:isSection?'Section':'Lesson',
                description:locked?lockedReason:isSection
                  ?(section['chapterTitle']??'').toString()
                  :(lesson['description']??'').toString(),
                number:isSection?(section['number']??currentIndex+1).toString()
                  :(lesson['lessonNumber']??currentIndex+1).toString(),
                pageCount:isSection?sectionPages:pageCount,
                readMinutes:sectionMinutes,
                completed:completed,
                locked:locked,
                onOpen:locked?null:openLesson,
                onTakeTest:locked||chosenQuizId==null||chosenQuizId.isEmpty?null:()async{
                  await Navigator.push(context,MaterialPageRoute<void>(
                    builder:(_)=>QuizScreen(api:widget.api,
                      guideId:widget.guideId,lessonId:chosenQuizId,
                      language:language,title:(chosenTest['title']??'Lesson review').toString())));
                  if(mounted)setState(reload);
                },
                onFlashcards:locked||(isSection?sectionPages:pageCount)==0?null:()=>
                  Navigator.push(context,MaterialPageRoute<void>(
                    builder:(_)=>LessonFlashcardsScreen(
                      api:widget.api,guideId:widget.guideId,
                      lessonId:'${lesson['id']}',
                      title:sectionTitle,sectionId:sectionId))),
                onEditQuestions:widget.canEditChapterQuestions&&
                  widget.onEditQuestions!=null&&!locked
                  ?()=>widget.onEditQuestions!('${lesson['id']}'):null,
                onReset:completed&&!isSection?()=>_confirmResetLesson(lesson,language):null,
              );
              });
            }),
            if(guideAssessments.isNotEmpty)...[
              const SizedBox(height:20),
              Text('Final examination',
                style:Theme.of(context).textTheme.titleLarge),
              const SizedBox(height:8),
              ...guideAssessments.map((exam){
                final locked=exam['locked']==true;
                final completed=exam['completed']==true;
                final scheme = Theme.of(context).colorScheme;
                return Card(
                  margin: const EdgeInsets.only(bottom: 12),
                  elevation: locked ? 0.5 : 2,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(16),
                    side: BorderSide(
                      color: locked
                          ? scheme.outlineVariant.withValues(alpha: 0.3)
                          : (completed ? const Color(0xFF16A34A).withValues(alpha: 0.3) : const Color(0xFF002D72).withValues(alpha: 0.2)),
                      width: completed ? 1.5 : 1,
                    ),
                  ),
                  child: ListTile(
                    contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                    leading: Container(
                      width: 44,
                      height: 44,
                      decoration: BoxDecoration(
                        color: locked
                            ? Colors.grey.withValues(alpha: 0.12)
                            : (completed
                                ? const Color(0xFFDCFCE7)
                                : const Color(0xFF002D72).withValues(alpha: 0.1)),
                        shape: BoxShape.circle,
                      ),
                      alignment: Alignment.center,
                      child: Icon(
                        locked
                            ? Icons.lock_outline_rounded
                            : (completed ? Icons.emoji_events_rounded : Icons.quiz_rounded),
                        size: 22,
                        color: locked
                            ? Colors.grey.shade500
                            : (completed ? const Color(0xFF16A34A) : const Color(0xFF002D72)),
                      ),
                    ),
                    title: Text(
                      '${exam['title'] ?? 'Final Exam'}',
                      style: TextStyle(
                        fontWeight: FontWeight.w700,
                        color: locked ? scheme.onSurface.withValues(alpha: 0.55) : null,
                      ),
                    ),
                    subtitle: Padding(
                      padding: const EdgeInsets.only(top: 4),
                      child: Row(
                        children: [
                          if (locked) ...[
                            Icon(Icons.lock_clock_outlined, size: 14, color: scheme.error.withValues(alpha: 0.8)),
                            const SizedBox(width: 4),
                            Expanded(
                              child: Text(
                                'Complete all lessons & review quizzes to unlock',
                                style: TextStyle(fontSize: 12, color: scheme.error.withValues(alpha: 0.85), fontWeight: FontWeight.w600),
                              ),
                            ),
                          ] else if (completed) ...[
                            const Icon(Icons.done_all_rounded, size: 14, color: Color(0xFF16A34A)),
                            const SizedBox(width: 4),
                            const Text(
                              'Completed & Verified',
                              style: TextStyle(fontSize: 12, color: Color(0xFF16A34A), fontWeight: FontWeight.w700),
                            ),
                          ] else ...[
                            Icon(Icons.assignment_turned_in_outlined, size: 13, color: const Color(0xFF002D72)),
                            const SizedBox(width: 4),
                            const Text(
                              'Course final examination',
                              style: TextStyle(fontSize: 12, color: Color(0xFF002D72), fontWeight: FontWeight.w600),
                            ),
                          ],
                        ],
                      ),
                    ),
                    trailing: Icon(
                      locked ? Icons.lock_outline_rounded : Icons.chevron_right_rounded,
                      color: locked ? scheme.onSurface.withValues(alpha: 0.3) : scheme.onSurfaceVariant,
                    ),
                    onTap:locked?null:()async{
                      await Navigator.push(context, MaterialPageRoute<void>(
                        builder: (_) => QuizScreen(
                          api: widget.api,
                          guideId: widget.guideId,
                          lessonId: '${exam['id']}',
                          language: language,
                          title: '${exam['title']}',
                        ),
                      ));
                      if (mounted) setState(reload);
                    },
                  ),
                );
              }),
            ],
          ]),
        );
      },
    ),
  );
}
