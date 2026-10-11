import 'package:flutter/material.dart';
import '../core/vop_api.dart';
import '../core/offline_study.dart';
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
  final store=OfflineStudyStore();
  late Future<Map<String,dynamic>> guide;
  bool downloading=false;
  String? status;
  @override void initState(){super.initState();reload();}
  void reload(){guide=store.loadGuide(widget.api,widget.guideId);}
  Future<void> download()async{
    if(downloading)return;
    setState((){downloading=true;status=null;});
    try{
      final count=await store.downloadGuide(widget.api,widget.guideId);
      if(mounted)setState(()=>status='$count reading lessons are saved on this device. '
        'Quizzes need a server-started session before offline answers can be queued.');
    }catch(error){if(mounted)setState(()=>status='Download unavailable: $error');}
    finally{if(mounted)setState(()=>downloading=false);}
  }
  Future<void> openLesson(Map<String,dynamic> lesson,String language)async{
    if(lesson['unlocked']==false){
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content:Text('Finish preceding lessons and quizzes first.')));
      return;
    }
    final id=(lesson['id']??'').toString();
    final title=(lesson['title']??'Study').toString();
    final isQuiz=lesson['type']=='Test';
    await Navigator.push(context,MaterialPageRoute<void>(builder:(_)=>
      isQuiz?QuizScreen(api:widget.api,guideId:widget.guideId,
        lessonId:id,language:language,title:title)
      :LessonScreen(api:widget.api,guideId:widget.guideId,
        lessonId:id,language:language,title:title)));
    if(mounted)setState(reload);
  }
  @override Widget build(BuildContext context)=>Scaffold(
    appBar:AppBar(title:const Text('Study guide'),
      actions:[IconButton(onPressed:()=>setState(reload),
        icon:const Icon(Icons.refresh),tooltip:'Reload guide')]),
    body:FutureBuilder<Map<String,dynamic>>(
      future:guide,builder:(context,s){
        if(s.connectionState!=ConnectionState.done)return const VopSkeleton();
        if(s.hasError)return VopEmpty(icon:Icons.wifi_off,
          message:'${s.error}',onRetry:()=>setState(reload));
        final data=s.data??{},details=data['guide'] as Map? ?? {};
        final lessons=(data['lessons'] as List? ?? [])
            .whereType<Map>().map((e)=>Map<String,dynamic>.from(e)).toList();
        final title='${details['title']??'Study guide'}';
        final language='${details['language']??'en'}';
        final finished=lessons.where((row)=>row['completed']==true).length;
        return RefreshIndicator(
          onRefresh:()async{setState(reload);await guide;},
          child:ListView(padding:const EdgeInsets.all(16),children:[
            if(data['offlineCopy']==true)Card(child:ListTile(
              leading:const Icon(Icons.offline_pin_outlined),
              title:const Text('Reading offline'),
              subtitle:const Text('Progress will be verified once connected. '
                'Locked lessons cannot be unlocked offline.'))),
            Text(title,style:Theme.of(context).textTheme.headlineSmall?.copyWith(
              fontWeight:FontWeight.w800)),
            const SizedBox(height:6),
            Text('${details['description']??''}'),
            const SizedBox(height:12),
            Wrap(spacing:8,runSpacing:7,children:[
              Chip(avatar:const Icon(Icons.translate,size:16),
                label:Text(language.toUpperCase())),
              Chip(avatar:const Icon(Icons.task_alt,size:16),
                label:Text('$finished / ${lessons.length} complete')),
            ]),
            const SizedBox(height:10),
            LinearProgressIndicator(
              value:lessons.isEmpty?0:finished/lessons.length,minHeight:6,
              borderRadius:BorderRadius.circular(10)),
            const SizedBox(height:12),
            FilledButton.icon(onPressed:downloading?null:download,
              icon:downloading?const SizedBox(width:17,height:17,
                child:CircularProgressIndicator(strokeWidth:2))
                :const Icon(Icons.download_for_offline_outlined),
              label:Text(downloading?'Saving lesson pages…':'Download reading lessons')),
            if(status!=null)Padding(padding:const EdgeInsets.only(top:8),
              child:Text(status!,style:Theme.of(context).textTheme.bodySmall)),
            const SizedBox(height:18),
            Text('Lessons & assessments',
              style:Theme.of(context).textTheme.titleLarge),
            const SizedBox(height:7),
            if(lessons.isEmpty)const SizedBox(height:160,
              child:VopEmpty(icon:Icons.book_outlined,
                message:'No lessons have been published in this guide.')),
            ...lessons.asMap().entries.map((entry){
              final lesson=entry.value,isQuiz=lesson['type']=='Test';
              final locked=lesson['unlocked']==false,done=lesson['completed']==true;
              return Card(margin:const EdgeInsets.only(bottom:9),
                clipBehavior:Clip.antiAlias,
                child:ListTile(
                  contentPadding:const EdgeInsets.symmetric(horizontal:12,vertical:5),
                  leading:CircleAvatar(radius:19,child:Icon(
                    locked?Icons.lock_outline:done?Icons.check_rounded:
                    isQuiz?Icons.fact_check_outlined:Icons.auto_stories_outlined,
                    size:20)),
                  title:Text('${entry.key+1}. ${lesson['title']??'Lesson'}',
                    style:const TextStyle(fontWeight:FontWeight.w700)),
                  subtitle:Text(locked?'Locked · complete previous learning first'
                    :done?'Completed · tap to review'
                    :isQuiz?'Assessment · submit to VOP for marking'
                    :'${lesson['estimatedMinutes']??15} min reading'),
                  trailing:Icon(locked?Icons.lock:Icons.chevron_right,size:19),
                  onTap:locked?null:()=>openLesson(lesson,language),
                ));
            }),
            const SizedBox(height:25),
          ]),
        );
      },
    ),
  );
}
