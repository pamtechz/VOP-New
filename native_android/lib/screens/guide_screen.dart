import 'package:flutter/material.dart';
import 'package:flutter/foundation.dart';

import '../core/vop_api.dart';
import 'learner_support_screen.dart';
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
  bool downloading=false;
  Future<void> download()async{
    if(downloading)return;
    setState(()=>downloading=true);
    try{
      final count=await widget.api.downloadGuide(widget.guideId);
      if(mounted)ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content:Text(count.toString()+' lessons saved for offline study.')));
    }catch(error){
      if(mounted)ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content:Text('Download failed: '+error.toString())));
    }finally{if(mounted)setState(()=>downloading=false);}
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
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(error.toString())));
    }
  }
  @override void initState(){super.initState();reload();}
  void reload(){guide=widget.api.guide(widget.guideId);}
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
            Row(children:[
              Chip(label:Text(language.toUpperCase())),
              if(data['offline']==true)...[
                const SizedBox(width:9),
                const Chip(avatar:Icon(Icons.offline_bolt_outlined,size:16),
                  label:Text('Offline')),
              ],
            ]),
            const SizedBox(height:16),
            Text('Lessons and assessments',
              style:Theme.of(context).textTheme.titleLarge),
            const SizedBox(height:8),
            if(lessons.isEmpty)const Padding(padding:EdgeInsets.all(25),
              child:Text('There are no published lessons in this guide.')),
            ...lessons.map((lesson){
              final isQuiz=lesson['type']=='Test';
              final locked=lesson['locked']==true;
              final completed=lesson['completed']==true;
              return Card(margin:const EdgeInsets.only(bottom:10),
                child:ListTile(
                  contentPadding:const EdgeInsets.all(12),
                  leading:CircleAvatar(child:Icon(locked?Icons.lock_outline:
                    completed?Icons.check_circle_outline:
                    isQuiz?Icons.fact_check_outlined:Icons.auto_stories_outlined)),
                  title:Text('${lesson['title']??'Lesson'}',
                    style:const TextStyle(fontWeight:FontWeight.w700)),
                  subtitle:Text(locked?'Finish earlier lessons to unlock':
                    completed?'Completed':isQuiz?'Assessment':
                    '${lesson['estimatedMinutes']??15} min reading'),
                  trailing:Icon(locked?Icons.lock_outline:Icons.chevron_right),
                  onTap:locked?null:()async{
                    await Navigator.push(context,MaterialPageRoute<void>(
                    builder:(_)=>isQuiz
                      ?QuizScreen(api:widget.api,guideId:widget.guideId,
                        lessonId:'${lesson['id']}',language:language,
                        title:'${lesson['title']}')
                      :LessonScreen(api:widget.api,guideId:widget.guideId,
                        lessonId:'${lesson['id']}',language:language,
                        title:'${lesson['title']}')));
                    if(mounted)setState(reload);
                  },
                ));
            }),
          ]),
        );
      },
    ),
  );
}
