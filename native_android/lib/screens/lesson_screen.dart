import 'package:flutter/material.dart';

import '../core/vop_api.dart';
import '../core/offline_study.dart';
import '../widgets/plate_page.dart';

class LessonScreen extends StatefulWidget {
  const LessonScreen({
    required this.api,required this.guideId,required this.lessonId,
    required this.language,required this.title,super.key,
  });
  final VopApi api;
  final String guideId,lessonId,language,title;
  @override State<LessonScreen> createState()=>_LessonScreenState();
}
class _LessonScreenState extends State<LessonScreen> {
  late Future<Map<String,dynamic>> lesson;
  late Future<Map<String,dynamic>> resume;
  int page=0;
  bool busy=false;
  String? notice;
  @override void initState(){
    super.initState();
    lesson=_loadLesson();
    resume=widget.api.progress();
    resume.then((value){
      final rows=value['lessonResume'];
      if(rows is! Map)return;
      final key='${widget.language}:${widget.guideId}:${widget.lessonId}';
      final entry=rows[key];
      if(entry is Map&&entry['pageIndex'] is num&&mounted){
        setState(()=>page=(entry['pageIndex'] as num).toInt());
      }
    }).catchError((Object error){});
  }
  Future<Map<String,dynamic>> _loadLesson()async{
    try{
      final response=await widget.api.lesson(widget.guideId,widget.lessonId);
      return response;
    }catch(error){
      if(error is VopApiException&&error.status>=400&&error.status<500)rethrow;
      final cached=await OfflineStudy.instance.lesson(
        widget.guideId,widget.lessonId,widget.language);
      if(cached!=null)return cached;
      rethrow;
    }
  }
  Future<void> _save(int index)async{
    setState(()=>page=index);
    try{
      await widget.api.saveResume(
        widget.guideId,widget.lessonId,widget.language,index);
    }catch(error){
      if(error is VopApiException&&(error.status>=400&&error.status<500)){
        if(mounted)setState(()=>notice='Resume could not be saved.');
        return;
      }
      try{
        await OfflineStudy.instance.queue('resume',widget.guideId,
          widget.lessonId,widget.language,pageIndex:index);
        if(mounted)setState(()=>notice='Reading position saved for sync.');
      }catch(_){
        if(mounted)setState(()=>notice='Could not save this reading position.');
      }
    }
  }
  Future<void> _complete()async{
    if(busy)return;
    setState((){busy=true;notice=null;});
    try{
      await widget.api.completeLesson(
        widget.guideId,widget.lessonId,widget.language);
      if(!mounted)return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content:Text('Lesson completion saved to VOP.')));
      Navigator.pop(context,true);
    }catch(error){
      if(error is VopApiException&&(error.status>=400&&error.status<500)){
        if(mounted)setState(()=>notice='Completion was not accepted by VOP.');
      }else{
        try{
          await OfflineStudy.instance.queue('completion',widget.guideId,
            widget.lessonId,widget.language);
          if(mounted)setState(()=>notice='Completion saved for verification when online.');
        }catch(_){
          if(mounted)setState(()=>notice='Unable to save completion for sync.');
        }
      }
    }finally{
      if(mounted)setState(()=>busy=false);
    }
  }
  @override Widget build(BuildContext context)=>Scaffold(
    appBar:AppBar(title:Text(widget.title),actions:[
      IconButton(tooltip:'Save lesson offline',icon:const Icon(Icons.download_outlined),
        onPressed:()async{
          try{
            final data=await lesson;
            await OfflineStudy.instance.saveLesson(widget.guideId,
              widget.lessonId,widget.language,data);
            if(mounted)ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(content:Text('Lesson saved offline.')));
          }catch(error){
            if(mounted)ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(content:Text('$error')));
          }
        }),
    ]),
    body:FutureBuilder<Map<String,dynamic>>(
      future:lesson,
      builder:(context,s){
        if(s.connectionState!=ConnectionState.done){
          return const Center(child:CircularProgressIndicator());
        }
        if(s.hasError)return Center(child:Padding(
          padding:const EdgeInsets.all(22),
          child:Text('${s.error}',textAlign:TextAlign.center)));
        final data=s.data?['lesson'];
        final pages=data is Map && data['pages'] is List
          ?(data['pages'] as List).whereType<Map>()
              .map((v)=>Map<String,dynamic>.from(v)).toList()
          :<Map<String,dynamic>>[];
        if(pages.isEmpty)return const Center(child:Text(
          'This lesson has no published reading pages.'));
        final offline=s.data?['offline']==true;
        final index=page.clamp(0,pages.length-1).toInt();
        final last=index==pages.length-1;
        return Column(children:[
          LinearProgressIndicator(value:(index+1)/pages.length,minHeight:3),
          Expanded(child:ListView(
            key:ValueKey(index),
            padding:const EdgeInsets.symmetric(horizontal:20,vertical:22),
            children:[
              Text('Page ${index+1} of ${pages.length}' +(offline?' · Offline':''),
                style:Theme.of(context).textTheme.labelLarge),
              const SizedBox(height:18),
              PlatePageView(page:pages[index]),
              const SizedBox(height:25),
              if(notice!=null)Text(notice!,
                style:TextStyle(color:Theme.of(context).colorScheme.error)),
            ])),
          SafeArea(top:false,child:Padding(
            padding:const EdgeInsets.symmetric(horizontal:16,vertical:10),
            child:Row(children:[
              OutlinedButton.icon(
                onPressed:index==0||busy?null:()=>_save(index-1),
                icon:const Icon(Icons.chevron_left),
                label:const Text('Previous')),
              const Spacer(),
              FilledButton.icon(
                onPressed:busy?null:last?_complete:()=>_save(index+1),
                icon:busy?const SizedBox(width:16,height:16,
                  child:CircularProgressIndicator(strokeWidth:2))
                    :Icon(last?Icons.check_circle_outline:Icons.chevron_right),
                label:Text(last?'Complete lesson':'Next page')),
            ]))),
        ]);
      }),
  );
}
