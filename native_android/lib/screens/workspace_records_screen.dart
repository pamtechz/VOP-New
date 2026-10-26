import 'dart:convert';
import 'package:flutter/material.dart';
import '../core/vop_api.dart';
import '../widgets/vop_ui.dart';
import '../widgets/vop_desktop_layout.dart';
import '../widgets/plate_document_editor.dart';
import '../widgets/plate_page.dart';
import '../widgets/certificate_layout_editor.dart';
import 'curriculum_lesson_editor_screen.dart';

Map<String,dynamic> recordMap(dynamic value)=>value is Map?Map<String,dynamic>.from(value):{};
List<Map<String,dynamic>> recordRows(dynamic value)=>value is List?value.whereType<Map>().map((v)=>Map<String,dynamic>.from(v)).toList():[];
String recordTitle(Map<String,dynamic> value)=>(value['title']??value['name']??value['displayName']??value['id']??'Record').toString();
int _recordIdSequence=0;
String newRecordId()=>DateTime.now().microsecondsSinceEpoch.toRadixString(36)+'-'+(++_recordIdSequence).toRadixString(36);

class WorkspaceRecordsScreen extends StatefulWidget {
  const WorkspaceRecordsScreen({required this.api,required this.collection,this.organizationId,super.key});
  final VopApi api;
  final String collection;
  final String? organizationId;
  @override State<WorkspaceRecordsScreen> createState()=>_WorkspaceRecordsState();
}
class _WorkspaceRecordsState extends State<WorkspaceRecordsScreen>{
  late Future<List<Map<String,dynamic>>> future;
  String search='';
  bool? tableOverride;
  Map<String,dynamic> get scope=>{if(widget.organizationId?.isNotEmpty==true)'organizationId':widget.organizationId};
  @override void initState(){super.initState();reload();}
  void reload(){future=Future.wait([widget.api.workspace(),widget.api.recordList(widget.collection,payload:scope)]);}
  Future<void> edit(Map<String,dynamic> schema,Map<String,dynamic> workspace,Map<String,dynamic>? record) async {
    final fields=recordRows(schema['fields']);
    final original=record??<String,dynamic>{};
    // Preserve one identity across repeated Save attempts in the same editor.
    final draftId=newRecordId();
    await Navigator.of(context).push(MaterialPageRoute<void>(builder:(_)=>RecordEditor(
      api:widget.api,title:record==null?'New ${schema['title']}':'Edit ${recordTitle(original)}',
      fields:fields,options:recordMap(workspace['options']),initial:original,
      onSave:(value)async{
        final id=(original['id']??(widget.collection=='languages'?value['code']:null)??
          (schema['singleton']==true?widget.collection:draftId)).toString();
        await widget.api.saveRecord(widget.collection,id,{
          ...value,
          if(record!=null && ['programs','guides'].contains(widget.collection))
            'expectedExisting':true,
        },payload:scope);
      })));
    if(mounted)setState(reload);
  }
  Future<void> remove(Map<String,dynamic> item)async{
    final confirmed=await showDialog<bool>(context:context,builder:(ctx)=>AlertDialog(
      title:Text('Delete ${recordTitle(item)}?'),content:const Text('This action removes this record. Review any linked content before continuing.'),
      actions:[TextButton(onPressed:()=>Navigator.pop(ctx,false),child:const Text('Cancel')),
        FilledButton(onPressed:()=>Navigator.pop(ctx,true),child:const Text('Delete'))]));
    if(confirmed!=true)return;
    try{await widget.api.deleteRecord(widget.collection,'${item['id']}',payload:scope);if(mounted)setState(reload);}
    catch(e){if(mounted)ScaffoldMessenger.of(context).showSnackBar(SnackBar(content:Text('$e')));}
  }
  @override Widget build(BuildContext context)=>FutureBuilder<List<Map<String,dynamic>>>(future:future,builder:(context,s){
    final workspace=s.data?.first??<String,dynamic>{};
    final schema=recordMap(recordMap(workspace['schemas'])[widget.collection]);
    final actions=(schema['actions'] as List? ?? []).map((v)=>v.toString()).toSet();
    final title=(schema['title']??'Workspace').toString();
    final records=recordRows(s.data?.last['items']);
    final filtered=records.where((v)=>search.isEmpty||recordTitle(v).toLowerCase().contains(search)).toList();
    final useTable=tableOverride ?? VopDesktopWorkspaceFrame.isDesktop(context);
    return Scaffold(appBar:AppBar(title:Text(title),actions:[
      IconButton(tooltip:useTable?'Show cards':'Show table',onPressed:()=>setState(()=>tableOverride=!useTable),icon:Icon(useTable?Icons.view_agenda_outlined:Icons.table_rows_outlined)),
      IconButton(tooltip:'Refresh',onPressed:()=>setState(reload),icon:const Icon(Icons.refresh))]),
      floatingActionButton:schema.isNotEmpty&&(actions.contains('create')||(schema['singleton']==true&&actions.contains('update')))
        ?FloatingActionButton.extended(onPressed:()=>edit(schema,workspace,schema['singleton']==true&&records.isNotEmpty?records.first:null),
          icon:Icon(schema['singleton']==true?Icons.edit:Icons.add),label:Text(schema['singleton']==true?'Edit settings':'Add')):null,
      body:VopDesktopWorkspaceFrame(api:widget.api,child:s.connectionState!=ConnectionState.done?const VopSkeleton():s.hasError?
        VopEmpty(icon:Icons.error_outline,message:'${s.error}',onRetry:()=>setState(reload)):
        schema.isEmpty?const VopEmpty(icon:Icons.lock_outline,message:'This workspace is not available to your account.'):
        Column(children:[Padding(padding:const EdgeInsets.all(16),child:TextField(
          decoration:const InputDecoration(labelText:'Search',prefixIcon:Icon(Icons.search)),onChanged:(v)=>setState(()=>search=v.trim().toLowerCase()))),
          Expanded(child:filtered.isEmpty?const VopEmpty(icon:Icons.inbox_outlined,message:'No records found.'):
            useTable?SingleChildScrollView(scrollDirection:Axis.horizontal,child:SingleChildScrollView(child:DataTable(columns:const[
              DataColumn(label:Text('Name')),DataColumn(label:Text('Status')),DataColumn(label:Text('Actions'))],
              rows:filtered.map((item)=>DataRow(cells:[DataCell(SizedBox(width:260,child:Text(recordTitle(item))),onTap:()=>_details(item,schema,workspace,actions)),
                DataCell(Text(item['published']==true?'Published':item['published']==false?'Draft':'${item['status']??''}')),
                DataCell(_actions(item,schema,workspace,actions))])).toList()))):
            ListView.separated(padding:const EdgeInsets.fromLTRB(16,0,16,96),itemCount:filtered.length,
              separatorBuilder:(_,__)=>const Divider(),itemBuilder:(_,i){final item=filtered[i];return ListTile(
                title:Text(recordTitle(item)),subtitle:Text('${item['description']??item['subtitle']??item['language']??''}',maxLines:2,overflow:TextOverflow.ellipsis),
                trailing:_actions(item,schema,workspace,actions),onTap:()=>_details(item,schema,workspace,actions));}))])));
  });
  Widget _actions(Map<String,dynamic> item,Map<String,dynamic> schema,Map<String,dynamic> workspace,Set<String> actions)=>Wrap(children:[
    if(widget.collection=='guides')IconButton(tooltip:'Manage lessons',icon:const Icon(Icons.menu_book_outlined),onPressed:()=>Navigator.push(context,MaterialPageRoute<void>(builder:(_)=>CurriculumLessonEditorScreen(api:widget.api,guide:item,workspace:workspace)))),
    if(actions.contains('update')&&item['canEdit']!=false)IconButton(tooltip:'Edit',onPressed:()=>edit(schema,workspace,item),icon:const Icon(Icons.edit_outlined)),
    if(schema['singleton']!=true&&actions.contains('delete')&&item['canEdit']!=false)IconButton(tooltip:'Delete',onPressed:()=>remove(item),icon:const Icon(Icons.delete_outline))]);
  void _details(Map<String,dynamic> item,Map<String,dynamic> schema,Map<String,dynamic> workspace,Set<String> actions){
    showModalBottomSheet<void>(context:context,isScrollControlled:true,builder:(ctx)=>SafeArea(child:ConstrainedBox(
      constraints:BoxConstraints(maxHeight:MediaQuery.sizeOf(ctx).height*.85),child:ListView(padding:const EdgeInsets.all(24),children:[
        Text(recordTitle(item),style:Theme.of(ctx).textTheme.headlineSmall),const SizedBox(height:16),
        ...item.entries.where((e)=>e.value is String||e.value is num||e.value is bool).map((e)=>ListTile(title:Text(humanLabel(e.key)),subtitle:Text('${e.value}'))),
      ]))));
  }
}

String humanLabel(String value)=>value.replaceAllMapped(RegExp(r'([a-z])([A-Z])'),(m)=>'${m[1]} ${m[2]}').replaceAll('_',' ');
Map<String,dynamic> writableRecord(Map<String,dynamic> source)=>Map<String,dynamic>.from(source)..removeWhere((key,_)=>
  ['id','canEdit','scope','inherited','createdAt','updatedAt','lessons','lessonCount','languages','questionCount','canManage'].contains(key));

class RecordEditor extends StatefulWidget{
  const RecordEditor({required this.api,required this.title,required this.fields,required this.options,required this.initial,required this.onSave,this.submitLabel='Save changes',this.lessonMode=false,super.key});
  final VopApi api;
  final String title;
  final String submitLabel;
  final bool lessonMode;
  final List<Map<String,dynamic>> fields;
  final Map<String,dynamic> options,initial;
  final Future<void> Function(Map<String,dynamic>) onSave;
  @override State<RecordEditor> createState()=>_RecordEditorState();
}
class _RecordEditorState extends State<RecordEditor>{
  final form=GlobalKey<FormState>();
  late Map<String,dynamic> value;
  late Map<String,dynamic> options;
  bool saving=false,dirty=false,saveInFlight=false;
  String lessonTab='details';
  String? error;
  @override void initState(){super.initState();value=recordMap(jsonDecode(jsonEncode(writableRecord(widget.initial))));options={...widget.options};loadOptions();}
  Future<void> loadOptions()async{
    final sources=<String>{};
    void visit(List<Map<String,dynamic>> fields){for(final f in fields){final source='${f['source']??''}';if(source.isNotEmpty&&!options.containsKey(source))sources.add(source);visit(recordRows(f['fields']));}}
    visit(widget.fields);
    try{await Future.wait(sources.map((source)async{final result=await widget.api.recordList(source);options[source]=recordRows(result['items']).map((item)=>{'value':item['id'],'label':recordTitle(item)}).toList();}));if(mounted)setState((){});}
    catch(e){if(mounted)setState(()=>error='Could not load choices: $e');}
  }
  Future<void> save()async{
    if(saveInFlight)return;
    if(widget.lessonMode&&(['title','lessonNumber'].any(
      (key)=>(value[key]??'').toString().trim().isEmpty))){
      setState((){lessonTab='details';error='Enter the lesson title and number.';});
      return;
    }
    if(widget.lessonMode){
      final problem=lessonStructureError();
      if(problem!=null){setState((){lessonTab='chapters';error=problem;});return;}
    }
    if(!form.currentState!.validate())return;
    saveInFlight=true;
    setState((){saving=true;error=null;});
    try{await widget.onSave(value);if(mounted){setState(()=>dirty=false);
      WidgetsBinding.instance.addPostFrameCallback((_){if(mounted)Navigator.pop(context);});}}
    catch(e){if(mounted)setState(()=>error='$e');}
    finally{saveInFlight=false;if(mounted)setState(()=>saving=false);}
  }
  String? lessonStructureError(){
    final chapters=recordRows(value['chapters']);
    if(chapters.isEmpty)return 'Add at least one chapter and section.';
    if(chapters.length>40)return 'A lesson supports at most 40 chapters.';
    for(final chapter in chapters){
      if((chapter['title']??'').toString().trim().isEmpty){
        return 'Give every chapter a title.';
      }
      final sections=recordRows(chapter['sections']);
      if(sections.isEmpty)return 'Each chapter needs at least one section.';
      if(sections.length>40)return 'Each chapter supports at most 40 sections.';
      for(final section in sections){
        if((section['title']??'').toString().trim().isEmpty){
          return 'Give every section a title.';
        }
        if(recordRows(section['document']).isEmpty &&
           recordRows(section['blocks']).isEmpty){
          return 'Add at least one content block to every section.';
        }
      }
    }
    return null;
  }
  bool showLessonField(Map<String,dynamic> field){
    final key=(field['key']??'').toString();
    switch(lessonTab){
      case 'chapters':return ['chapters','contentPages','pages','content'].contains(key);
      case 'media':return ['media','imageUrl','audioUrl','videoUrl'].contains(key);
      case 'references':return ['bibleReferences','teacherNotes'].contains(key);
      case 'settings':return ['sharingScope','tags','published'].contains(key);
      default:return ['title','description','lessonNumber','estimatedMinutes'].contains(key);
    }
  }
  Widget lessonPreview(){
    final chapters=recordRows(value['chapters']);
    final pages=recordRows(value['contentPages']);
    return Column(crossAxisAlignment:CrossAxisAlignment.stretch,children:[
      if(chapters.isEmpty&&pages.isEmpty)
        const Text('Add chapter content to preview the learner experience.'),
      for(final chapter in chapters)...[
        Padding(padding:const EdgeInsets.symmetric(vertical:12),
          child:Text(recordTitle(chapter),style:Theme.of(context).textTheme.titleLarge)),
        for(final section in recordRows(chapter['sections']))
          Card(child:Padding(padding:const EdgeInsets.all(16),
            child:PlatePageView(page:section))),
      ],
      if(chapters.isEmpty)for(final page in pages)
        Card(child:Padding(padding:const EdgeInsets.all(16),
          child:PlatePageView(page:page))),
    ]);
  }
  @override Widget build(BuildContext context)=>PopScope(canPop:!saving&&!dirty,
    onPopInvokedWithResult:(didPop,result)async{
      if(didPop||saving)return;
      final discard=await showDialog<bool>(context:context,builder:(ctx)=>AlertDialog(title:const Text('Discard changes?'),
        actions:[TextButton(onPressed:()=>Navigator.pop(ctx,false),child:const Text('Keep editing')),FilledButton(onPressed:()=>Navigator.pop(ctx,true),child:const Text('Discard'))]));
      if(discard==true&&mounted){setState(()=>dirty=false);WidgetsBinding.instance.addPostFrameCallback((_){if(mounted)Navigator.pop(context);});}
    },child:Scaffold(appBar:AppBar(title:Text(widget.title),actions:[
      TextButton(onPressed:saving?null:save,child:Text(saving?'Saving…':widget.submitLabel))]),
      body:Form(key:form,child:LayoutBuilder(builder:(context,constraints){
        final wide=constraints.maxWidth>=960;
        return Column(children:[
          if(widget.lessonMode)SingleChildScrollView(scrollDirection:Axis.horizontal,
            child:Padding(padding:const EdgeInsets.symmetric(horizontal:12,vertical:8),
              child:Row(children:[
                for(final item in const [
                  ('details','Details',Icons.info_outline),
                  ('chapters','Chapters & sections',Icons.account_tree_outlined),
                  ('preview','Learner preview',Icons.visibility_outlined),
                  ('media','Media',Icons.perm_media_outlined),
                  ('references','Bible & notes',Icons.menu_book_outlined),
                  ('settings','Settings',Icons.settings_outlined),
                ])Padding(padding:const EdgeInsets.only(right:6),child:ChoiceChip(
                  selected:lessonTab==item.$1,avatar:Icon(item.$3,size:16),
                  label:Text(item.$2),onSelected:(_)=>setState(()=>lessonTab=item.$1))),
              ]))),
          if(saving)const LinearProgressIndicator(),
          Expanded(child:Center(child:ConstrainedBox(
            constraints:BoxConstraints(maxWidth:wide?1160:820),
            child:ListView(
              keyboardDismissBehavior:ScrollViewKeyboardDismissBehavior.onDrag,
              padding:const EdgeInsets.fromLTRB(20,12,20,50),children:[
                if(error!=null)Padding(padding:const EdgeInsets.only(bottom:16),
                  child:Text(error!,style:TextStyle(color:Theme.of(context).colorScheme.error))),
                if(widget.lessonMode&&lessonTab=='preview')lessonPreview()
                else if(widget.lessonMode&&wide&&lessonTab=='chapters')
                  Row(crossAxisAlignment:CrossAxisAlignment.start,children:[
                    Expanded(flex:3,child:SchemaFields(
                      fields:widget.fields.where(showLessonField).toList(),
                      value:value,options:options,
                      onChanged:()=>setState(()=>dirty=true))),
                    const SizedBox(width:18),
                    Expanded(flex:2,child:Card(
                      clipBehavior:Clip.antiAlias,
                      child:Padding(padding:const EdgeInsets.all(16),
                        child:Column(crossAxisAlignment:CrossAxisAlignment.stretch,children:[
                          Row(children:[
                            Icon(Icons.visibility_outlined,size:18,
                              color:Theme.of(context).colorScheme.primary),
                            const SizedBox(width:8),
                            Expanded(child:Text('Live learner preview',
                              style:Theme.of(context).textTheme.titleMedium)),
                          ]),
                          const Divider(),
                          lessonPreview(),
                        ])))),
                  ])
                else SchemaFields(fields:widget.lessonMode
                  ?widget.fields.where(showLessonField).toList():widget.fields,
                  value:value,options:options,onChanged:()=>setState(()=>dirty=true)),
                if(wide)const SizedBox(height:32),
              ])))),
          if(!wide)SafeArea(top:false,child:Padding(
            padding:const EdgeInsets.fromLTRB(16,8,16,12),
            child:SizedBox(width:double.infinity,child:FilledButton.icon(
              onPressed:saving?null:save,
              icon:const Icon(Icons.save_outlined),
              label:Text(saving?'Saving…':widget.submitLabel))))),
        ]);
      }))));
}

class SchemaFields extends StatelessWidget{
  const SchemaFields({required this.fields,required this.value,required this.options,required this.onChanged,this.path='',super.key});
  final List<Map<String,dynamic>> fields;
  final Map<String,dynamic> value,options;
  final VoidCallback onChanged;
  final String path;
  void update(String key,dynamic next){value[key]=next;onChanged();}
  @override Widget build(BuildContext context)=>Column(crossAxisAlignment:CrossAxisAlignment.stretch,
    children:fields.where((field)=>field['key']!='id'&&field['hidden']!=true).map((field)=>Padding(padding:const EdgeInsets.only(bottom:16),child:buildField(context,field))).toList());
  Widget buildField(BuildContext context,Map<String,dynamic> field){
    final key='${field['key']}';final label='${field['label']??humanLabel(key)}';final type='${field['type']??'text'}';final current=value[key];
    final children=recordRows(field['fields']);
    if(type=='recordDetails'){
      final output=<Widget>[];
      void visit(dynamic entry,[String prefix='']){
        if(entry is Map){for(final e in entry.entries){visit(e.value,'$prefix${humanLabel('${e.key}')} · ');}}
        else if(entry is List){for(var i=0;i<entry.length;i++){visit(entry[i],'$prefix${i+1} · ');}}
        else if(entry!=null)output.add(ListTile(title:Text(prefix),subtitle:SelectableText('$entry')));
      }
      visit(field['data']);
      return ExpansionTile(title:Text(label),initiallyExpanded:true,children:output);
    }
    if(type=='paymentQuote'){
      final quote=recordMap(recordMap(field['quotes'])[value['paymentMethod']]);
      return ListTile(title:const Text('Amount payable'),subtitle:Text(quote.isEmpty?'${field['currency']} ${field['amountDecimal']}':'${quote['currency']} ${quote['amountDecimal']}'),
        trailing:quote.isNotEmpty&&quote['currency']!=quote['baseCurrency']?Text('Rate: ${quote['exchangeRate']}'):null);
    }
    if(type=='boolean')return SwitchListTile.adaptive(contentPadding:EdgeInsets.zero,title:Text(label),value:current==true,onChanged:(v)=>update(key,v));
    if(type=='plate')return PlateDocumentEditor(key:ValueKey('plate.'+path+'.'+key),document:recordRows(current),onChanged:(v)=>update(key,v));
    if(type=='certificateLayout')return CertificateLayoutEditor(value:recordMap(current),background:'${value['backgroundUrl']??''}',onChanged:(v)=>update(key,v));
    if(type=='object'){
      final nested=recordMap(current);
      return ExpansionTile(title:Text(label),initiallyExpanded:current!=null,children:[SchemaFields(fields:children,value:nested,options:options,path:'$path.$key',onChanged:()=>update(key,nested))]);
    }
    if(type=='strings'||type=='references'){
      final values=(current as List? ?? []).map((v)=>v.toString()).toList();
      final choices=recordRows(options[field['source']]);
      return Column(crossAxisAlignment:CrossAxisAlignment.start,children:[Text(label,style:Theme.of(context).textTheme.titleSmall),
        if(type=='references')...choices.map((option)=>CheckboxListTile(contentPadding:EdgeInsets.zero,title:Text('${option['label']}'),value:values.contains('${option['value']}'),
          onChanged:(selected){selected==true?values.add('${option['value']}'):values.remove('${option['value']}');update(key,values);})),
        if(type=='strings')...values.asMap().entries.map((entry)=>Row(children:[Expanded(child:TextFormField(key:ValueKey('$path.$key.${values.length}.${entry.key}'),initialValue:entry.value,decoration:InputDecoration(labelText:'$label ${entry.key+1}'),
          onChanged:(v){values[entry.key]=v;value[key]=values;onChanged();})),IconButton(tooltip:'Remove',onPressed:(){values.removeAt(entry.key);update(key,values);},icon:const Icon(Icons.remove_circle_outline))])),
        if(type=='strings')TextButton.icon(onPressed:()=>update(key,[...values,'']),icon:const Icon(Icons.add),label:Text('Add $label'))]);
    }
    if(type=='list'){
      final rows=recordRows(current);
      final isStructure=key=='chapters'||key=='sections';
      return Column(crossAxisAlignment:CrossAxisAlignment.stretch,children:[
        Text(label,style:Theme.of(context).textTheme.titleMedium),
        const SizedBox(height:8),
        for(final entry in rows.asMap().entries)
          Card(child:ExpansionTile(
            key:PageStorageKey('node.'+path+'.'+key+'.'+(entry.value['id']??entry.key).toString()),
            initiallyExpanded:entry.key==0,
            title:Text((entry.value['title']??'').toString().trim().isNotEmpty
              ?(entry.value['title']).toString():label+' '+(entry.key+1).toString(),
              maxLines:2,overflow:TextOverflow.ellipsis),
            trailing:PopupMenuButton<String>(tooltip:label+' actions',
              onSelected:(action){
                if(action=='up'&&entry.key>0){
                  final node=rows.removeAt(entry.key);rows.insert(entry.key-1,node);
                }else if(action=='down'&&entry.key<rows.length-1){
                  final node=rows.removeAt(entry.key);rows.insert(entry.key+1,node);
                }else if(action=='remove'&&(!isStructure||rows.length>1)){
                  rows.removeAt(entry.key);
                }else{return;}
                update(key,rows);
              },
              itemBuilder:(_)=>[
                if(entry.key>0)const PopupMenuItem(value:'up',child:Text('Move up')),
                if(entry.key<rows.length-1)
                  const PopupMenuItem(value:'down',child:Text('Move down')),
                if(!isStructure||rows.length>1)
                  const PopupMenuItem(value:'remove',child:Text('Remove')),
              ]),
            children:[Padding(padding:const EdgeInsets.fromLTRB(14,0,14,16),
              child:SchemaFields(fields:children,value:entry.value,options:options,
                path:path+'.'+key+'.'+(entry.value['id']??entry.key).toString(),
                onChanged:()=>update(key,rows)))],
          )),
        const SizedBox(height:8),
        OutlinedButton.icon(
          onPressed:(){
            final nextId=newRecordId();
            final blankContent={'id':newRecordId(),'type':'p',
              'children':[{'text':''}]};
            final blankSection={'id':newRecordId(),'title':'New section',
              'document':[blankContent]};
            final newItem=key=='chapters'
              ?<String,dynamic>{'id':nextId,'title':'New chapter',
                  'sections':[blankSection]}
              :key=='sections'
                ?<String,dynamic>{'id':nextId,'title':'New section',
                    'document':[blankContent]}
                :children.any((f)=>f['key']=='id')
                  ?<String,dynamic>{'id':nextId}
                  :<String,dynamic>{};
            update(key,[...rows,newItem]);
          },
          icon:const Icon(Icons.add),label:Text('Add '+label)),
      ]);
    }
    if(type=='choice'){
      final choices=field['source']!=null?recordRows(options[field['source']]):(field['choices'] as List? ?? []).map((v)=>{'value':v.toString(),'label':humanLabel(v.toString())}).toList();
      final selected=current?.toString();
      if(selected?.isNotEmpty==true&&!choices.any((v)=>'${v['value']}'==selected))choices.add({'value':selected,'label':selected});
      return DropdownButtonFormField<String>(key:ValueKey('$path.$key.$selected'),initialValue:selected?.isNotEmpty==true?selected:null,isExpanded:true,decoration:InputDecoration(labelText:label),
        items:choices.map((v)=>DropdownMenuItem(value:'${v['value']}',child:Text('${v['label']}',overflow:TextOverflow.ellipsis))).toList(),
        validator:(v)=>field['required']==true&&(v==null||v.isEmpty)?'Choose $label':null,onChanged:(v)=>update(key,v??''));
    }
    return TextFormField(key:ValueKey('$path.$key'),initialValue:current?.toString()??'',
      obscureText:type=='password',maxLines:type=='multiline'?5:1,keyboardType:type=='number'?const TextInputType.numberWithOptions(decimal:true,signed:true):type=='multiline'?TextInputType.multiline:TextInputType.text,
      decoration:InputDecoration(labelText:label,hintText:type=='datetime'?'YYYY-MM-DDTHH:mm:ss':null),
      validator:(v){if(field['required']==true&&(v??'').trim().isEmpty)return 'Enter $label';if(type=='number'&&(v??'').isNotEmpty&&num.tryParse(v!)==null)return 'Enter a valid number';if(type=='datetime'&&(v??'').isNotEmpty&&DateTime.tryParse(v!)==null)return 'Enter a valid date and time';return null;},
      onChanged:(v){value[key]=type=='number'?(v.isEmpty?null:num.tryParse(v)):v;onChanged();});
  }
}
