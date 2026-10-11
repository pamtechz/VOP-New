import 'package:flutter/material.dart';
import '../core/vop_api.dart';
import '../core/offline_study.dart';
import '../widgets/vop_ui.dart';
import 'lesson_screen.dart';
import 'quiz_screen.dart';

class OfflineDownloadsScreen extends StatefulWidget {
  const OfflineDownloadsScreen({required this.api,super.key});
  final VopApi api;
  @override State<OfflineDownloadsScreen> createState()=>_OfflineDownloadsScreenState();
}
class _OfflineDownloadsScreenState extends State<OfflineDownloadsScreen> {
  late Future<List<Map<String,dynamic>>> downloads;
  int pending=0;
  bool syncing=false;
  @override void initState(){super.initState();refresh();}
  void refresh(){
    downloads=OfflineStudy.instance.downloaded();
    OfflineStudy.instance.pendingCount().then((count){
      if(mounted)setState(()=>pending=count);
    }).catchError((Object _) {});
  }
  Future<void> _sync()async{
    if(syncing)return;
    setState(()=>syncing=true);
    try{
      await OfflineStudy.instance.sync(widget.api);
      refresh();
    }catch(error){
      if(mounted)ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content:Text('$error')));
    }finally{if(mounted)setState(()=>syncing=false);}
  }
  Future<void> _clear()async{
    final accepted=await showDialog<bool>(context:context,
      builder:(ctx)=>AlertDialog(title:const Text('Remove downloads?'),
        content:const Text('Downloaded lessons and offline quiz sessions will be removed.'),
        actions:[
          TextButton(onPressed:()=>Navigator.pop(ctx,false),child:const Text('Cancel')),
          FilledButton(onPressed:()=>Navigator.pop(ctx,true),child:const Text('Remove')),
        ]));
    if(accepted!=true)return;
    await OfflineStudy.instance.clearDownloads();
    if(mounted)setState(refresh);
  }
  Future<void> _clearPending()async{
    final accepted=await showDialog<bool>(context:context,
      builder:(ctx)=>AlertDialog(title:const Text('Discard unsent changes?'),
        content:const Text('Unsent reading progress and assessment answers will be lost.'),
        actions:[
          TextButton(onPressed:()=>Navigator.pop(ctx,false),
            child:const Text('Keep changes')),
          FilledButton(onPressed:()=>Navigator.pop(ctx,true),
            child:const Text('Discard')),
        ]));
    if(accepted!=true)return;
    await OfflineStudy.instance.clearPending();
    if(mounted)setState(refresh);
  }
  void _open(Map<String,dynamic> entry){
    final id=(entry['lessonId']??'').toString(),
      guideId=(entry['guideId']??'').toString(),
      language=(entry['language']??'en').toString(),
      title=(entry['title']??'Study').toString();
    final quiz=entry['kind']=='quiz';
    Navigator.push(context,MaterialPageRoute<void>(
      builder:(_)=>quiz?QuizScreen(api:widget.api,guideId:guideId,
        lessonId:id,language:language,title:title):
        LessonScreen(api:widget.api,guideId:guideId,
          lessonId:id,language:language,title:title)));
  }
  @override Widget build(BuildContext context)=>Scaffold(
    appBar:AppBar(title:const Text('Offline study'),actions:[
      IconButton(onPressed:_clear,tooltip:'Remove downloaded lessons',
        icon:const Icon(Icons.delete_outline))]),
    body:FutureBuilder<List<Map<String,dynamic>>>(
      future:downloads,builder:(context,s){
        if(s.connectionState!=ConnectionState.done)return const VopSkeleton(rows:3);
        if(s.hasError)return VopEmpty(icon:Icons.lock_outline,
          message:'${s.error}',onRetry:()=>setState(refresh));
        final items=s.data??[];
        return RefreshIndicator(onRefresh:()async{setState(refresh);await downloads;},
          child:ListView(padding:const EdgeInsets.all(17),children:[
            Card(child:Padding(padding:const EdgeInsets.all(15),
              child:Row(children:[
                const Icon(Icons.cloud_sync_outlined,size:26),
                const SizedBox(width:12),
                Expanded(child:Text(pending==0?'All changes synced':
                  '$pending changes waiting to sync')),
                FilledButton.tonal(
                  onPressed:syncing?null:_sync,
                  child:Text(syncing?'Syncing…':'Sync')),
              ]))),
            if(pending>0)Align(alignment:Alignment.centerRight,
              child:TextButton.icon(
                onPressed:_clearPending,
                icon:const Icon(Icons.delete_sweep_outlined,size:18),
                label:const Text('Discard unsent changes'))),
            const SizedBox(height:17),
            VopSectionTitle('Downloaded lessons and quizzes',
              subtitle:'${items.length} available on this device'),
            if(items.isEmpty)const SizedBox(height:230,
              child:VopEmpty(icon:Icons.download_for_offline_outlined,
                message:'Your downloads will appear here.')),
            ...items.map((item){
              final isQuiz=item['kind']=='quiz';
              final expiry=isQuiz?DateTime.tryParse((item['expiresAt']??'').toString()):null;
              final expired=expiry!=null&&!expiry.isAfter(DateTime.now().toUtc());
              return Card(margin:const EdgeInsets.only(bottom:10),
                child:ListTile(
                  leading:Icon(isQuiz?Icons.fact_check_outlined:Icons.menu_book_outlined),
                  title:Text((item['title']??'Study').toString()),
                  subtitle:Text(expired?'Session expired':
                    '${(item['language']??'').toString().toUpperCase()} · ${isQuiz?'Assessment':'Lesson'}'),
                  trailing:Icon(expired?Icons.lock_clock:Icons.chevron_right),
                  enabled:!expired,onTap:expired?null:()=>_open(item),
                ));
            }),
          ]));
      }),
  );
}
