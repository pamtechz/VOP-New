import 'package:flutter/material.dart';

import '../core/vop_api.dart';
import 'lesson_screen.dart';
import 'quiz_screen.dart';

class GuideScreen extends StatefulWidget {
  const GuideScreen({required this.api,required this.guideId,super.key});
  final VopApi api;
  final String guideId;
  @override State<GuideScreen> createState()=>_GuideScreenState();
}
class _GuideScreenState extends State<GuideScreen> {
  late Future<Map<String,dynamic>> guide;
  @override void initState(){super.initState();reload();}
  void reload(){guide=widget.api.guide(widget.guideId);}
  @override Widget build(BuildContext context)=>Scaffold(
    appBar:AppBar(title:const Text('Study guide'),
      actions:[IconButton(onPressed:()=>setState(reload),
        icon:const Icon(Icons.refresh),tooltip:'Reload guide')]),
    body:FutureBuilder<Map<String,dynamic>>(
      future:guide,
      builder:(context,s){
        if(s.connectionState!=ConnectionState.done){
          return const Center(child:CircularProgressIndicator());
        }
        if(s.hasError)return Center(child:Padding(padding:const EdgeInsets.all(20),
          child:Text('${s.error}',textAlign:TextAlign.center)));
        final data=s.data??{};
        final details=data['guide'] as Map? ?? {};
        final lessons=(data['lessons'] as List? ?? [])
            .whereType<Map>().map((e)=>Map<String,dynamic>.from(e)).toList();
        final title='${details['title']??'Study guide'}';
        final language='${details['language']??'en'}';
        return RefreshIndicator(
          onRefresh:()async{setState(reload);await guide;},
          child:ListView(padding:const EdgeInsets.all(16),children:[
            Text(title,style:Theme.of(context).textTheme.headlineSmall?.copyWith(
              fontWeight:FontWeight.w800)),
            const SizedBox(height:9),
            Text('${details['description']??''}'),
            const SizedBox(height:17),
            Chip(label:Text(language.toUpperCase())),
            const SizedBox(height:16),
            Text('Lessons and assessments',
              style:Theme.of(context).textTheme.titleLarge),
            const SizedBox(height:8),
            if(lessons.isEmpty)const Padding(padding:EdgeInsets.all(25),
              child:Text('There are no published lessons in this guide.')),
            ...lessons.map((lesson){
              final isQuiz=lesson['type']=='Test';
              return Card(margin:const EdgeInsets.only(bottom:10),
                child:ListTile(
                  contentPadding:const EdgeInsets.all(12),
                  leading:CircleAvatar(child:Icon(isQuiz
                    ?Icons.fact_check_outlined:Icons.auto_stories_outlined)),
                  title:Text('${lesson['title']??'Lesson'}',
                    style:const TextStyle(fontWeight:FontWeight.w700)),
                  subtitle:Text(isQuiz?'Assessment': '${lesson['estimatedMinutes']??15} min reading'),
                  trailing:const Icon(Icons.chevron_right),
                  onTap:()=>Navigator.push(context,MaterialPageRoute<void>(
                    builder:(_)=>isQuiz
                      ?QuizScreen(api:widget.api,guideId:widget.guideId,
                        lessonId:'${lesson['id']}',language:language,
                        title:'${lesson['title']}')
                      :LessonScreen(api:widget.api,guideId:widget.guideId,
                        lessonId:'${lesson['id']}',language:language,
                        title:'${lesson['title']}'))),
                ));
            }),
          ]),
        );
      },
    ),
  );
}
