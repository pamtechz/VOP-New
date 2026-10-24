import 'package:flutter/material.dart';
import '../core/vop_api.dart';
import '../theme/vop_theme.dart';
import '../widgets/vop_ui.dart';
import '../widgets/vop_desktop_layout.dart';

class OfflineStudiesScreen extends StatefulWidget {
  const OfflineStudiesScreen({required this.api,super.key});
  final VopApi api;
  @override State<OfflineStudiesScreen> createState()=>_OfflineStudiesScreenState();
}
class _OfflineStudiesScreenState extends State<OfflineStudiesScreen>{
  late Future<List<Map<String,dynamic>>> content,pending;
  bool syncing=false;
  String? notice;
  @override void initState(){super.initState();_refresh();}
  void _refresh(){
    content=widget.api.downloadedStudies();
    pending=widget.api.pendingOfflineChanges();
  }
  Future<void> _sync()async{
    if (syncing) return;
    setState(()=>syncing=true);
    try{
      final result=await widget.api.syncPending();
      if (mounted) {
        setState((){
          notice='${result['synced']??0} changes synced';
          _refresh();
        });
      }
    }catch(e){if(mounted)setState(()=>notice=e.toString());}
    finally{if(mounted)setState(()=>syncing=false);}
  }
  Future<void> _delete(Map<String,dynamic> item)async{
    await widget.api.removeOfflineStudy(
      (item['kind']??'').toString(),(item['id']??'').toString());
    if (mounted) setState(_refresh);
  }
  @override Widget build(BuildContext context)=>Scaffold(
    appBar:AppBar(title:const Text('Offline study')),
    body:VopDesktopContent(maxWidth:1120,child:RefreshIndicator(
      onRefresh:()async{setState(_refresh);await Future.wait([content,pending]);},
      child:ListView(padding:const EdgeInsets.all(17),children:[
        const VopHeroCard(
          title:'Study anywhere.',
          description:'Downloaded reading and your saved assessment drafts are available without a connection.',
          kicker:'MY DOWNLOADS',icon:Icons.download_done_rounded),
        const SizedBox(height:17),
        if(notice!=null)Text(notice!,style:TextStyle(
          color:Theme.of(context).colorScheme.primary)),
        VopSectionTitle('Sync activity',subtitle:'Online verification'),
        Card(child:Padding(padding:const EdgeInsets.all(13),
          child:Column(crossAxisAlignment:CrossAxisAlignment.stretch,children:[
            FutureBuilder<List<Map<String,dynamic>>>(
              future:pending,builder:(context,s){
                if(!s.hasData)return const LinearProgressIndicator();
                return ListTile(contentPadding:EdgeInsets.zero,
                  leading:const Icon(Icons.sync_outlined),
                  title:Text('${s.data?.length??0} pending changes'),
                  subtitle:const Text('Sync answers and progress with VOP.'));
              }),
            FilledButton.icon(onPressed:syncing?null:_sync,
              icon:const Icon(Icons.sync),
              label:Text(syncing?'Synchronising…':'Sync now')),
          ]))),
        const SizedBox(height:17),
        VopSectionTitle('Saved for offline',subtitle:'Stored securely on this device'),
        FutureBuilder<List<Map<String,dynamic>>>(
          future:content,builder:(context,s){
            if (s.connectionState != ConnectionState.done) {
              return const SizedBox(height:85,child:LinearProgressIndicator());
            }
            if (s.hasError) {
              return VopEmpty(icon:Icons.error_outline,
                message:s.error.toString());
            }
            final items=s.data??[];
            if (items.isEmpty) {
              return const SizedBox(height:150,
                child:VopEmpty(icon:Icons.download_outlined,
                  message:'Open a course and download its lessons to study offline.'));
            }
            return Column(children:items.map((item)=>Card(
              margin:const EdgeInsets.only(bottom:8),
              child:ListTile(
                leading:Icon(item['kind']=='quiz'
                  ?Icons.fact_check_outlined:Icons.auto_stories_outlined,
                  color:VopColors.gold),
                title:Text((item['title']??item['id']??'Saved study').toString(),
                  maxLines:2,overflow:TextOverflow.ellipsis),
                subtitle:Text((item['kind']??'').toString().toUpperCase()),
                trailing:IconButton(
                  tooltip:'Remove download',
                  icon:const Icon(Icons.delete_outline),
                  onPressed:()=>_delete(item)),
              ),
            )).toList());
          }),
        const SizedBox(height:25),
      ]),
    )),
  );
}
