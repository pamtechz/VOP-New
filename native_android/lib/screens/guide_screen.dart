import 'package:flutter/material.dart';

import '../core/vop_api.dart';
import '../widgets/vop_ui.dart';
import 'lesson_screen.dart';
import 'quiz_screen.dart';

class GuideScreen extends StatefulWidget {
  const GuideScreen({required this.api,required this.guideId,super.key});
  final VopApi api;
  final String guideId;
  @override State<GuideScreen> createState()=>_GuideScreenState();
}
class _GuideScreenState extends State<GuideScreen> {
  late Future<List<Map<String,dynamic>>> data;
  @override void initState(){super.initState();reload();}
  void reload(){
    data=Future.wait([widget.api.guide(widget.guideId),widget.api.progress()]);
  }
  Future<void> refresh()async{setState(reload);await data;}
  Future<void> openLesson(Map<String,dynamic> lesson,String language,bool isQuiz)async{
    final id=(lesson['id']??'').toString();
    final title=(lesson['title']??'Lesson').toString();
    final result=await Navigator.push<bool>(context,MaterialPageRoute<bool>(
      builder:(_)=>isQuiz
        ?QuizScreen(api:widget.api,guideId:widget.guideId,
          lessonId:id,language:language,title:title)
        :LessonScreen(api:widget.api,guideId:widget.guideId,
          lessonId:id,language:language,title:title)));
    if(mounted)setState(reload);
  }
  @override Widget build(BuildContext context)=>Scaffold(
    appBar:AppBar(title:const Text('Study guide')),
    body:FutureBuilder<List<Map<String,dynamic>>>(
      future:data,builder:(context,s){
        if(s.connectionState!=ConnectionState.done)return const VopSkeleton(rows:4);
        if(s.hasError)return VopEmpty(icon:Icons.wifi_off,
          message:'${s.error}',onRetry:()=>setState(reload));
        final result=s.data??[];
        if(result.length<2)return const VopEmpty(icon:Icons.error_outline,
          message:'Unable to retrieve this study guide.');
        final source=result[0],progress=result[1];
        final details=source['guide'] is Map
          ?Map<String,dynamic>.from(source['guide'] as Map):<String,dynamic>{};
        final lessons=(source['lessons'] as List? ?? [])
          .whereType<Map>().map((e)=>Map<String,dynamic>.from(e)).toList();
        final completed=(progress['completedLessons'] as List? ?? [])
          .map((e)=>e.toString()).toSet();
        final language=(details['language']??'en').toString();
        final title=(details['title']??'Study guide').toString();
        final done=lessons.where((item)=>completed.contains(
          '$language:${widget.guideId}:${item['id']}')).length;
        var firstIncomplete=lessons.indexWhere((item)=>!completed.contains(
          '$language:${widget.guideId}:${item['id']}'));
        if(firstIncomplete<0)firstIncomplete=lessons.length;
        return RefreshIndicator(onRefresh:refresh,
          child:ListView(padding:const EdgeInsets.all(16),children:[
            Text(title,style:Theme.of(context).textTheme.headlineSmall?.copyWith(
              fontWeight:FontWeight.w800)),
            if((details['description']??'').toString().trim().isNotEmpty)...[
              const SizedBox(height:9),
              Text('${details['description']}'),
            ],
            const SizedBox(height:13),
            Row(children:[
              Chip(label:Text(language.toUpperCase())),
              const SizedBox(width:9),
              Expanded(child:Text('$done / ${lessons.length} completed',
                style:Theme.of(context).textTheme.labelMedium)),
            ]),
            const SizedBox(height:8),
            if(lessons.isNotEmpty)ClipRRect(
              borderRadius:BorderRadius.circular(8),
              child:LinearProgressIndicator(value:done/lessons.length,minHeight:6)),
            const SizedBox(height:21),
            Text('Lessons and assessments',style:Theme.of(context).textTheme.titleLarge),
            const SizedBox(height:8),
            if(lessons.isEmpty)const SizedBox(height:170,
              child:VopEmpty(icon:Icons.auto_stories_outlined,
                message:'No published lessons are available yet.')),
            ...lessons.asMap().entries.map((entry){
              final index=entry.key,lesson=entry.value;
              final isQuiz=lesson['type']=='Test';
              final finished=completed.contains(
                '$language:${widget.guideId}:${lesson['id']}');
              final locked=index>firstIncomplete;
              return Card(margin:const EdgeInsets.only(bottom:10),
                clipBehavior:Clip.antiAlias,
                child:ListTile(
                  enabled:!locked,
                  contentPadding:const EdgeInsets.symmetric(horizontal:13,vertical:6),
                  leading:CircleAvatar(
                    backgroundColor:finished
                      ?Theme.of(context).colorScheme.primaryContainer
                      :Theme.of(context).colorScheme.surfaceContainerHigh,
                    child:Icon(finished?Icons.check_rounded:
                      locked?Icons.lock_outline_rounded:
                      isQuiz?Icons.fact_check_outlined:Icons.auto_stories_outlined)),
                  title:Text((lesson['title']??'Lesson').toString(),
                    style:const TextStyle(fontWeight:FontWeight.w700)),
                  subtitle:Text(finished?'Completed':locked?'Locked':
                    isQuiz?'Assessment': '${lesson['estimatedMinutes']??15} min reading'),
                  trailing:Icon(locked?Icons.lock_outline:
                    finished?Icons.check_circle:Icons.chevron_right),
                  onTap:locked?null:()=>openLesson(lesson,language,isQuiz),
                ));
            }),
            const SizedBox(height:25),
          ]));
      }),
  );
}
