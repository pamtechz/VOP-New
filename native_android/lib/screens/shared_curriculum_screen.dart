import 'package:flutter/material.dart';
import 'package:firebase_auth/firebase_auth.dart';
import '../core/vop_api.dart';
import '../widgets/vop_ui.dart';
import 'workspace_records_screen.dart' show recordMap, recordRows, recordTitle;

/// Shared curriculum visibility and owner review. All writes go through the
/// same authenticated, tenant-aware API as the legacy web curriculum studio.
class SharedCurriculumScreen extends StatefulWidget {
  const SharedCurriculumScreen({
    required this.api, this.platformMode=false, super.key});
  final VopApi api;
  final bool platformMode;
  @override State<SharedCurriculumScreen> createState()=>_SharedCurriculumState();
}

class _SharedCurriculumState extends State<SharedCurriculumScreen> {
  bool loading=false;
  int _guideRequest=0;
  String? nextCursor;
  String? error,notice;
  String selectedGuide='';
  List<Map<String,dynamic>> programs=[],guides=[],lessons=[],suggestions=[];
  Map<String,dynamic> preferences={};

  @override void initState(){super.initState();reload();}
  Future<Map<String,dynamic>> call(String action,[Map<String,dynamic> payload=const {}])=>
    widget.api.adminContent('curriculum',action:action,payload:payload);

  Future<void> reload()async{
    if(loading)return;
    setState((){loading=true;error=null;});
    try{
      final results=await Future.wait([
        if(!widget.platformMode)call('getSharedVisibility'),
        call('listSuggestedEdits'),
        if(!widget.platformMode)widget.api.recordList('programs'),
        if(!widget.platformMode)widget.api.adminContent('guides',action:'listGuides'),
      ]);
      if(!mounted)return;
      final offset=widget.platformMode?0:1;
      setState((){
        preferences=widget.platformMode?{}:recordMap(results[0]['settings']);
        suggestions=recordRows(results[offset]['items']);
        nextCursor=results[offset]['nextCursor'] is String
          ?results[offset]['nextCursor'].toString():null;
        if(!widget.platformMode){
          programs=recordRows(results[2]['items']).where(shared).toList();
          guides=recordRows(results[3]['items']).where(shared).toList();
        }
      });
    }catch(e){if(mounted)setState(()=>error=e.toString());}
    finally{if(mounted)setState(()=>loading=false);}
  }

  bool shared(Map<String,dynamic> item)=>
    item['sharingScope']=='shared'&&item['published']==true&&item['canEdit']==false;

  Future<void> pickGuide(String value)async{
    final request=++_guideRequest;
    setState((){selectedGuide=value;lessons=[];error=null;});
    if(value.isEmpty)return;
    setState(()=>loading=true);
    try{
      final result=await call('listGuideLessons',{'guideId':value});
      if(mounted&&request==_guideRequest)
        setState(()=>lessons=recordRows(result['items']));
    }catch(e){
      if(mounted&&request==_guideRequest)setState(()=>error=e.toString());
    }finally{
      if(mounted&&request==_guideRequest)setState(()=>loading=false);
    }
  }

  Future<void> loadMore()async{
    final cursor=nextCursor;
    if(cursor==null||loading)return;
    setState(()=>loading=true);
    try{
      final result=await call('listSuggestedEdits',{'cursor':cursor});
      if(!mounted)return;
      setState((){
        final entries={for(final item in suggestions)
          item['id'].toString():item};
        for(final item in recordRows(result['items'])){
          entries[item['id'].toString()]=item;
        }
        suggestions=entries.values.toList();
        nextCursor=result['nextCursor'] is String
          ?result['nextCursor'].toString():null;
      });
    }catch(e){if(mounted)setState(()=>error=e.toString());}
    finally{if(mounted)setState(()=>loading=false);}
  }

  Future<void> action(String name,Map<String,dynamic> payload,String message)async{
    if(loading)return;
    setState((){loading=true;error=null;notice=null;});
    try{
      await call(name,payload);
      if(!mounted)return;
      setState(()=>notice=message);
    }catch(e){if(mounted)setState(()=>error=e.toString());}
    finally{
      if(mounted){
        setState(()=>loading=false);
        // Follow-up reads must occur after the mutation state was released.
        await reload();
      }
    }
  }

  Future<void> propose(String kind,Map<String,dynamic> item,{String guideId=''})async{
    final title=TextEditingController(text:(item['title']??'').toString());
    final description=TextEditingController();
    final reason=TextEditingController();
    final original=(item['title']??'').toString();
    final submitted=await showDialog<Map<String,String>>(context:context,
      builder:(ctx)=>AlertDialog(
        title:Text('Suggest edit · ${item['title']??item['id']}'),
        content:SizedBox(width:560,child:SingleChildScrollView(child:Column(
          mainAxisSize:MainAxisSize.min,
          children:[
            const Text('The original remains unchanged until its owner approves.'),
            const SizedBox(height:12),
            TextField(controller:title,decoration:const InputDecoration(
              labelText:'Suggested title')),
            const SizedBox(height:12),
            TextField(controller:description,maxLines:4,decoration:const InputDecoration(
              labelText:'Suggested description (optional)')),
            const SizedBox(height:12),
            TextField(controller:reason,maxLines:3,decoration:const InputDecoration(
              labelText:'Reason for the correction *')),
          ]))),
        actions:[
          TextButton(onPressed:()=>Navigator.pop(ctx),child:const Text('Cancel')),
          FilledButton(onPressed:()=>Navigator.pop(ctx,{
            'title':title.text.trim(),'description':description.text.trim(),
            'reason':reason.text.trim()}),child:const Text('Send to owner')),
        ],
      ));
    // Do not dispose controllers immediately while the dialog is animating
    // its exit; the route owns its text field lifecycle.
    if(submitted==null||!mounted)return;
    final proposed=<String,dynamic>{};
    if(submitted['title']!.isNotEmpty&&submitted['title']!=original)
      proposed['title']=submitted['title'];
    if(submitted['description']!.isNotEmpty)
      proposed['description']=submitted['description'];
    if(proposed.isEmpty||submitted['reason']!.isEmpty){
      setState(()=>error='Enter a changed title or description and explain why.');
      return;
    }
    await action('proposeEdit',{
      'kind':kind,'id':item['id'],
      if(guideId.isNotEmpty)'guideId':guideId,
      'proposed':proposed,'reason':submitted['reason'],
    },'Suggestion sent for owner review.');
  }

  Future<void> setHidden(String kind,String id,bool hidden,{String guideId=''})=>
    action('setSharedVisibility',{
      'kind':kind,'id':id,'hidden':hidden,
      if(guideId.isNotEmpty)'guideId':guideId,
    },hidden?'Shared study hidden for your organisation.':
      'Shared study restored for your organisation.');

  Widget collection(String kind,String title,List<Map<String,dynamic>> records,
      String key,{String guideId=''}) {
    final hidden=preferences[key] is List
      ? (preferences[key] as List).map((v)=>v.toString()).toSet()
      :<String>{};
    final availableIds=<String>{
      for(final item in records)
        guideId.isNotEmpty?guideId+'/'+item['id'].toString():item['id'].toString(),
    };
    return Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
      Text(title,style:Theme.of(context).textTheme.titleLarge),
      const SizedBox(height:10),
      if(records.isEmpty&&hidden.isEmpty)
        const Padding(padding:EdgeInsets.symmetric(vertical:12),
          child:Text('No shared studies are currently available.')),
      LayoutBuilder(builder:(context,size){
        final columns=size.maxWidth>=960?3:size.maxWidth>=620?2:1;
        final gap=12.0;
        final width=(size.maxWidth-gap*(columns-1))/columns;
        return Wrap(spacing:gap,runSpacing:gap,children:[
          for(final item in records)
            SizedBox(width:width,child:Card(child:Padding(
              padding:const EdgeInsets.all(14),
              child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
                Text(recordTitle(item),maxLines:2,overflow:TextOverflow.ellipsis,
                  style:Theme.of(context).textTheme.titleMedium),
                const SizedBox(height:10),
                Wrap(spacing:8,runSpacing:8,children:[
                  OutlinedButton.icon(
                    icon:Icon(hidden.contains(guideId.isNotEmpty
                      ?guideId+'/'+item['id'].toString():item['id'].toString())
                      ?Icons.visibility:Icons.visibility_off),
                    label:Text(hidden.contains(guideId.isNotEmpty
                      ?guideId+'/'+item['id'].toString():item['id'].toString())
                      ?'Show':'Hide'),
                    onPressed:loading?null:()=>setHidden(kind,item['id'].toString(),
                      !hidden.contains(guideId.isNotEmpty
                        ?guideId+'/'+item['id'].toString():item['id'].toString()),
                      guideId:guideId),
                  ),
                  TextButton.icon(icon:const Icon(Icons.edit_note),
                    label:const Text('Suggest edit'),
                    onPressed:loading?null:()=>propose(kind,item,guideId:guideId)),
                ]),
              ])))),
          for(final value in hidden.where((v)=>!availableIds.contains(v)))
            SizedBox(width:width,child:Card(child:Padding(
              padding:const EdgeInsets.all(14),child:Column(
                crossAxisAlignment:CrossAxisAlignment.start,children:[
                  Text('Hidden: '+value),
                  const SizedBox(height:9),
                  OutlinedButton.icon(
                    icon:const Icon(Icons.visibility),
                    label:const Text('Show again'),
                    onPressed:loading?null:()=>setHidden(kind,
                      kind=='lessons'?value.split('/').last:value,false,
                      guideId:kind=='lessons'?value.split('/').first:''),
                  ),
                ])))),
        ]);
      }),
    ]);
  }

  Widget approvals(){
    return Column(crossAxisAlignment:CrossAxisAlignment.stretch,children:[
      Text('Suggestions & owner approvals',
        style:Theme.of(context).textTheme.titleLarge),
      const SizedBox(height:9),
      if(suggestions.isEmpty)const Text('No suggested edits to review.'),
      for(final suggestion in suggestions)
        Card(child:Padding(padding:const EdgeInsets.all(16),
          child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
            Text('${suggestion['kind']??'Study'} · ${suggestion['recordId']??''}',
              style:Theme.of(context).textTheme.titleMedium),
            Text('Status: ${suggestion['status']??'pending'}'),
            const SizedBox(height:9),
            Text((suggestion['reason']??'').toString()),
            const SizedBox(height:8),
            Text('Proposed changes: ${recordMap(suggestion['proposed']).entries.map((e)=>
              e.key+': '+e.value.toString()).join(' · ')}'),
            if(suggestion['status']=='pending'&&
                suggestion['proposerUid']!=FirebaseAuth.instance.currentUser?.uid)
              Wrap(spacing:8,children:[
                FilledButton.icon(icon:const Icon(Icons.check),
                  label:const Text('Approve'),
                  onPressed:loading?null:()=>action('reviewSuggestedEdit',
                    {'id':suggestion['id'],'decision':'approve'},'Correction approved.')),
                OutlinedButton.icon(icon:const Icon(Icons.close),
                  label:const Text('Reject'),
                  onPressed:loading?null:()=>action('reviewSuggestedEdit',
                    {'id':suggestion['id'],'decision':'reject'},'Suggestion rejected.')),
              ]),
          ]))),
      if(nextCursor!=null)
        OutlinedButton.icon(
          icon:const Icon(Icons.expand_more),
          label:const Text('Load older suggestions'),
          onPressed:loading?null:loadMore),
    ]);
  }
  @override
  Widget build(BuildContext context)=>Scaffold(
    appBar:AppBar(title:const Text('Shared curriculum'),
      actions:[IconButton(tooltip:'Refresh',icon:const Icon(Icons.refresh),
        onPressed:loading?null:reload)]),
    body:SafeArea(child:Center(child:ConstrainedBox(
      constraints:const BoxConstraints(maxWidth:1460),
      child:ListView(padding:const EdgeInsets.all(18),children:[
        Text('Manage shared studies',style:Theme.of(context).textTheme.headlineSmall),
        const SizedBox(height:8),
        Text(widget.platformMode
          ?'Review suggested corrections from organisations. Original records change only after approval.'
          :'Select the shared courses learners should see and propose corrections without changing their owners\' original content.'),
        if(loading)const LinearProgressIndicator(),
        if(error!=null)Padding(padding:const EdgeInsets.symmetric(vertical:10),
          child:Text(error!,style:TextStyle(color:Theme.of(context).colorScheme.error))),
        if(notice!=null)Padding(padding:const EdgeInsets.symmetric(vertical:10),
          child:Text(notice!)),
        const SizedBox(height:20),
        if(!widget.platformMode)...[
          collection('programs','Shared programmes',programs,'hiddenProgramIds'),
          const SizedBox(height:24),
          collection('guides','Shared guides',guides,'hiddenGuideIds'),
          const SizedBox(height:22),
          DropdownButtonFormField<String>(
            value:selectedGuide.isEmpty?null:selectedGuide,
            isExpanded:true,
            decoration:const InputDecoration(
              labelText:'Guide for individual lesson visibility'),
            items:guides.map((g)=>DropdownMenuItem<String>(
              value:g['id'].toString(),child:Text(recordTitle(g),
                overflow:TextOverflow.ellipsis))).toList(),
            onChanged:loading?null:(v)=>pickGuide(v??''),
          ),
          if(selectedGuide.isNotEmpty)...[
            const SizedBox(height:12),
            collection('lessons','Shared lessons',lessons,'hiddenLessonKeys',
              guideId:selectedGuide),
          ],
          const SizedBox(height:26),
        ],
        approvals(),
        const SizedBox(height:75),
      ]),
    ))),
  );
}
