import 'package:flutter/material.dart';
import '../core/vop_api.dart';
import '../widgets/vop_ui.dart';
import '../widgets/vop_section_study_card.dart';
import 'lesson_flashcards_screen.dart';
import 'quiz_screen.dart';
import 'workspace_records_screen.dart';

class CurriculumLessonEditorScreen extends StatefulWidget{
  const CurriculumLessonEditorScreen({required this.api,required this.guide,required this.workspace,
    this.initialLessonId='',this.createOnOpen=false,super.key});
  final VopApi api;
  final Map<String,dynamic> guide,workspace;
  final String initialLessonId;
  final bool createOnOpen;
  @override State<CurriculumLessonEditorScreen> createState()=>_CurriculumLessonEditorState();
}
class _CurriculumLessonEditorState extends State<CurriculumLessonEditorScreen>{
  late Future<Map<String,dynamic>> future;
  @override void initState(){
    super.initState();
    reload();
    if(widget.createOnOpen || widget.initialLessonId.isNotEmpty){
      future.then((result){
        if(!mounted)return;
        final items=recordRows(result['items']);
        final target=items.where((item)=>item['id'].toString()==widget.initialLessonId).toList();
        final permissions=recordMap(widget.workspace['permissions']);
        final actions=permissions['lessons'] as List? ?? [];
        final mayEdit=target.isNotEmpty &&
          actions.contains('update') && target.first['canEdit']==true;
        final mayCreate=actions.contains('create') && widget.guide['canEdit']!=false;
        if((widget.createOnOpen && mayCreate) ||
            (!widget.createOnOpen && mayEdit)){
          WidgetsBinding.instance.addPostFrameCallback((_){
            if(mounted)edit(widget.createOnOpen?null:target.first);
          });
        }
      },onError:(Object _){});
    }
  }
  Map<String,dynamic> get payload=>{'guideId':widget.guide['id'],if('${widget.guide['organizationId']??''}'.isNotEmpty)'organizationId':widget.guide['organizationId']};
  void reload(){future=widget.api.adminContent('curriculum',action:'listGuideLessons',payload:payload);}
  // Classic Web uses the actual Legacy Plate editor on the unified domain.
  // Android and standalone Flutter development retain the native editor.
  List<Map<String,dynamic>> legacyDocument(dynamic blocks)=>recordRows(blocks).map((block){
    final type={'heading':'h2','quote':'blockquote','image':'img','video':'video','audio':'audio'}[block['type']]??'p';
    return <String,dynamic>{'id':block['id']??newRecordId(),'type':type,if(['img','video','audio'].contains(type))'url':block['src'],'children':[{'text':['img','video','audio'].contains(type)?'':'${block['text']??''}'}]};
  }).toList();
  Future<void> edit(Map<String,dynamic>? lesson)async{
    final actions=recordMap(widget.workspace['permissions'])['lessons'] as List? ?? [];
    if(lesson==null && !(actions.contains('create') && widget.guide['canEdit']!=false))return;
    if(lesson!=null && !(actions.contains('update') && lesson['canEdit']==true))return;
    if(lesson?['type']=='Test'){
      await Navigator.push(context,MaterialPageRoute<void>(builder:(_)=>WorkspaceRecordsScreen(api:widget.api,collection:'quizzes',organizationId:widget.guide['organizationId']?.toString())));return;
    }
    final initial={...?lesson,'guideId':widget.guide['id'],'language':widget.guide['language'],'type':'Lesson'};
    if(initial['chapters'] is List){
      initial['chapters']=recordRows(initial['chapters']).map((chapter)=>{...chapter,'sections':recordRows(chapter['sections']).map((section)=>{
        ...section,if(section['document']==null&&section['blocks'] is List)'document':legacyDocument(section['blocks']),
      }).toList()}).toList();
    }
    // Open pre-chapter Legacy lessons with the same page content rather than
    // replacing it with an empty chapter when Flutter authors the first edit.
    if(initial['chapters']==null){
      final contentPages=recordRows(initial['contentPages']).isNotEmpty
        ?recordRows(initial['contentPages']):recordRows(initial['pages']);
      final fallback=(initial['content']??'').toString();
      if(contentPages.isNotEmpty||fallback.trim().isNotEmpty){
        final pages=contentPages.isNotEmpty?contentPages:<Map<String,dynamic>>[
          {'title':initial['title']??'Lesson content','content':fallback}];
        final usedSectionIds=<String>{};
        String sectionIdForPage(Map<String,dynamic> page){
          final original=(page['sectionId']??'').toString();
          return original.isNotEmpty&&usedSectionIds.add(original)
            ?original:newRecordId();
        }
        initial['chapters']=[{
          'id':newRecordId(),'title':'Lesson content',
          'sections':pages.map((page){
            final blocks=recordRows(page['blocks']);
            return <String,dynamic>{
              // Ensure every imported section has one stable canonical ID.
              'id':sectionIdForPage(page),
              'title':(page['sectionTitle']??page['title']??'Study section').toString(),
              // Preserve existing reader-specific section metadata on import.
              if(page['scriptureQuote'] is Map)'scriptureQuote':page['scriptureQuote'],
              if(page['keyTakeaway']!=null)'keyTakeaway':page['keyTakeaway'],
              if(page['imageUrl']!=null)'imageUrl':page['imageUrl'],
              if(page['audioUrl']!=null)'audioUrl':page['audioUrl'],
              if(page['videoUrl']!=null)'videoUrl':page['videoUrl'],
              'document':page['document'] is List?recordRows(page['document']):
                blocks.isNotEmpty?legacyDocument(blocks):<Map<String,dynamic>>[{
                  'id':newRecordId(),'type':'p',
                  'children':[{'text':(page['content']??'').toString()}],
                }],
            };
          }).toList(),
        }];
      }
    }
    // The Legacy editor starts every new lesson with a usable chapter and
    // section. Flutter must create the same valid hierarchy on first open.
    if(initial['chapters'] is! List || recordRows(initial['chapters']).isEmpty){
      initial['chapters']=[{
        'id':newRecordId(),'title':'New chapter',
        'sections':[{
          'id':newRecordId(),'title':'New section',
          'document':[{'id':newRecordId(),'type':'p',
            'children':[{'text':''}]}],
        }],
      }];
    }
    final references=initial['bibleReferences'];
    initial['bibleReferences']=references is List?references:
      references is String?references.split('\n').where((v)=>v.trim().isNotEmpty).toList():<String>[];
    final tags=initial['tags'];
    initial['tags']=tags is List?tags:
      tags is String?tags.split(',').where((v)=>v.trim().isNotEmpty).toList():<String>[];
    final media=recordMap(initial['media']);
    for(final key in ['imageUrl','audioUrl','videoUrl']){
      if((media[key]??'').toString().isEmpty&&initial[key]!=null)media[key]=initial[key];
    }
    initial['media']=media;
    final pageFields=<Map<String,dynamic>>[
      {'key':'title','label':'Page title'},{'key':'content','label':'Legacy page text','type':'multiline'},
      {'key':'document','label':'Rich text','type':'plate'},{'key':'imageUrl','label':'Image URL'},
      {'key':'audioUrl','label':'Audio URL'},{'key':'videoUrl','label':'Video URL'},
    ];
    final fields=<Map<String,dynamic>>[
      {'key':'title','label':'Lesson title','required':true},{'key':'description','label':'Description','type':'multiline'},
      {'key':'lessonNumber','label':'Lesson number','required':true},{'key':'estimatedMinutes','label':'Estimated minutes','type':'number'},
      {'key':'teacherNotes','label':'Private instructor notes','type':'multiline'},
      {'key':'bibleReferences','label':'Bible references','type':'strings'},
      {'key':'tags','label':'Tags','type':'strings'},
      {'key':'sharingScope','label':'Sharing','type':'choice',
        'choices':['private','organization','shared']},
      if(actions.contains('publish')){'key':'published','label':'Published','type':'boolean'},
      {'key':'media','label':'Featured media','type':'object','fields':[
        {'key':'imageUrl','label':'Image URL'},
        {'key':'audioUrl','label':'Audio URL'},
        {'key':'videoUrl','label':'Video URL'},
      ]},
      if(initial['chapters']==null&&initial['contentPages'] is List){'key':'contentPages','label':'Existing lesson pages','type':'list','fields':pageFields},
      if(initial['chapters']==null&&initial['pages'] is List){'key':'pages','label':'Existing block pages','type':'list','fields':[
        ...pageFields,{'key':'blocks','label':'Blocks','type':'list','fields':[
          {'key':'type','label':'Block type','type':'choice','choices':['paragraph','heading','quote','image','video','audio']},
          {'key':'text','label':'Text','type':'multiline'},{'key':'src','label':'Media URL'},
        ]},
      ]},
      if(initial['content'] is String){'key':'content','label':'Existing lesson content','type':'multiline'},
      {'key':'chapters','label':'Chapters','type':'list','fields':[
        {'key':'id','label':'Chapter reference','required':true},{'key':'title','label':'Chapter title','required':true},
        {'key':'sections','label':'Sections','type':'list','fields':[
          {'key':'id','label':'Section reference','required':true},{'key':'title','label':'Section title','required':true},
          {'key':'document','label':'Rich lesson content','type':'plate'},
          {'key':'scriptureQuote','label':'Scripture focus','type':'object','fields':[
            {'key':'reference','label':'Bible reference'},
            {'key':'text','label':'Passage text','type':'multiline'},
          ]},
          {'key':'keyTakeaway','label':'Key takeaway','type':'multiline'},
          {'key':'imageUrl','label':'Section image URL'},
          {'key':'audioUrl','label':'Section audio URL'},
          {'key':'videoUrl','label':'Section video URL'},
        ]},
      ]},
    ];
    // Keep the record identity for the entire editor session, including
    // retries after a partial network failure.
    final stableLessonId=(lesson?['id']??newRecordId()).toString();
    await Navigator.push(context,MaterialPageRoute<void>(builder:(_)=>RecordEditor(api:widget.api,
      title:lesson==null?'New lesson':'Edit ${recordTitle(lesson)}',fields:fields,options:recordMap(widget.workspace['options']),initial:initial,
      lessonMode:true,
      guideTitle:recordTitle(widget.guide),
      onSave:(data)async{
        await widget.api.adminContent('curriculum',action:'upsertLesson',payload:{
          ...payload,'id':stableLessonId,
          'data':{
            ...data,'lessonId':stableLessonId,
            if(lesson!=null)'expectedExisting':true,
            if(lesson!=null)'originalGuideId':widget.guide['id'],
            'guideId':widget.guide['id'],'language':widget.guide['language'],
            'type':'Lesson',
            'published':actions.contains('publish')?data['published']==true:lesson?['published']==true,
          },
        });
      })));
    if(mounted)setState(reload);
  }
  Future<void> publish(Map<String,dynamic> lesson)async{
    try{await widget.api.adminContent('curriculum',action:lesson['published']==true?'unpublishLesson':'publishLesson',payload:{...payload,'id':lesson['id'],'data':{'guideId':widget.guide['id'],'language':widget.guide['language'],'lessonId':lesson['id']}});if(mounted)setState(reload);}
    catch(e){if(mounted)ScaffoldMessenger.of(context).showSnackBar(SnackBar(content:Text('$e')));}
  }
  Future<void> remove(Map<String,dynamic> lesson)async{
    final confirmed=await showDialog<bool>(context:context,builder:(ctx)=>AlertDialog(title:Text('Delete ${recordTitle(lesson)}?'),actions:[TextButton(onPressed:()=>Navigator.pop(ctx,false),child:const Text('Cancel')),FilledButton(onPressed:()=>Navigator.pop(ctx,true),child:const Text('Delete'))]));
    if(confirmed!=true)return;
    try{await widget.api.adminContent('curriculum',action:'deleteLesson',payload:{...payload,'id':lesson['id'],'data':{'guideId':widget.guide['id'],'lessonId':lesson['id']}});if(mounted)setState(reload);}
    catch(e){if(mounted)ScaffoldMessenger.of(context).showSnackBar(SnackBar(content:Text('$e')));}
  }
  @override Widget build(BuildContext context){
    final permission=recordMap(widget.workspace['permissions']);final actions=(permission['lessons'] as List? ?? []);
    final canCreate=actions.contains('create')&&widget.guide['canEdit']!=false;
    return Scaffold(appBar:AppBar(title:Text('${recordTitle(widget.guide)} · Lessons'),actions:[IconButton(tooltip:'Refresh',onPressed:()=>setState(reload),icon:const Icon(Icons.refresh))]),
      floatingActionButton:canCreate?FloatingActionButton.extended(onPressed:()=>edit(null),icon:const Icon(Icons.add),label:const Text('Add lesson')):null,
      body:FutureBuilder<Map<String,dynamic>>(future:future,builder:(context,s){
        if(s.connectionState!=ConnectionState.done)return const VopSkeleton();if(s.hasError)return VopEmpty(icon:Icons.error_outline,message:'${s.error}',onRetry:()=>setState(reload));
        final items=recordRows(s.data?['items']);if(items.isEmpty)return const VopEmpty(icon:Icons.menu_book_outlined,message:'No lessons have been added.');
        return ListView.separated(padding:const EdgeInsets.fromLTRB(16,8,16,96),itemCount:items.length,separatorBuilder:(_,__)=>const Divider(),itemBuilder:(_,i){final item=items[i];
          final editable=actions.contains('update')&&item['canEdit']==true;
          if(item['type']!='Test'){
            final guideId=(widget.guide['id']??'').toString();
            final quizPerm=recordMap(widget.workspace['permissions'])['quizzes'] as List? ?? [];
            final pages=item['contentPages'] is List?item['contentPages'] as List:<dynamic>[];
            final chapters=item['chapters'] is List?item['chapters'] as List:<dynamic>[];
            final attachedTests=items.where((entry)=>
              entry['type']=='Test'&&entry['published']==true&&
              entry['assessmentKind']!='final_exam'&&
              entry['attachmentType']!='guide'&&
              (entry['attachedLessonId']==item['id']||
                entry['lessonId']==item['id']||
                entry['id']=='quiz_${item['id']}'||
                entry['id']=='quiz-${item['id']}'||
                entry['id']==item['quizLessonId']||
                entry['id']==item['attachedQuizId'])).toList();
            final attachedTest=attachedTests.isEmpty?null:attachedTests.first;
            final pageCount=pages.isNotEmpty?pages.length:chapters.fold<int>(0,
              (sum,chapter)=>sum+((chapter is Map&&chapter['sections'] is List)
                ?(chapter['sections'] as List).length:0));
            return Column(crossAxisAlignment:CrossAxisAlignment.stretch,children:[
              VopSectionStudyCard(
              title:recordTitle(item),
              description:(item['description']??'').toString(),
              number:(item['lessonNumber']??i+1).toString(),
              pageCount:pageCount,
              readMinutes:(num.tryParse('${item['estimatedMinutes']??15}')??15)
                .round().clamp(1,240).toInt(),
              completed:false,locked:false,
              onOpen:editable?()=>edit(item):null,
              onTakeTest:attachedTest==null?null:()=>
                Navigator.push(context,MaterialPageRoute<void>(
                  builder:(_)=>QuizScreen(api:widget.api,
                    guideId:guideId,lessonId:'${attachedTest['id']}',
                    language:(widget.guide['language']??'en').toString(),
                    title:recordTitle(attachedTest)))),
              onFlashcards:item['published']==true&&pageCount>0?()=>
                Navigator.push(context,MaterialPageRoute<void>(
                  builder:(_)=>LessonFlashcardsScreen(api:widget.api,
                    guideId:guideId,lessonId:'${item['id']}',
                    title:recordTitle(item)))):null,
              onEditQuestions:editable&&quizPerm.contains('update')?()=>
                Navigator.push(context,MaterialPageRoute<void>(
                  builder:(_)=>WorkspaceRecordsScreen(api:widget.api,
                    collection:'quizzes',
                    organizationId:widget.guide['organizationId']?.toString()))):null,
              ),
              Padding(padding:const EdgeInsets.fromLTRB(12,0,12,12),child:Wrap(
                spacing:9,runSpacing:6,crossAxisAlignment:WrapCrossAlignment.center,
                children:[
                  Chip(label:Text(item['published']==true?'Published':'Draft'),
                    avatar:Icon(item['published']==true?Icons.public:Icons.edit_note,size:17)),
                  if(editable)OutlinedButton.icon(
                    icon:const Icon(Icons.edit_outlined,size:17),
                    label:const Text('Edit chapters & sections'),
                    onPressed:()=>edit(item)),
                  if(item['canEdit']==true&&actions.contains('publish'))
                    OutlinedButton.icon(
                      icon:Icon(item['published']==true?Icons.unpublished_outlined:Icons.publish,size:17),
                      label:Text(item['published']==true?'Unpublish':'Publish'),
                      onPressed:()=>publish(item)),
                  if(item['canEdit']==true&&actions.contains('delete'))
                    IconButton(tooltip:'Delete lesson',
                      icon:const Icon(Icons.delete_outline),onPressed:()=>remove(item)),
                ])),
            ]);
          }
          return ListTile(
          title:Text(recordTitle(item)),subtitle:Text('${item['type']??'Lesson'} · ${item['published']==true?'Published':'Draft'}'),
          onTap:item['canEdit']==true?()=>edit(item):null,trailing:item['canEdit']==true?Wrap(children:[
            if(actions.contains('update'))IconButton(tooltip:'Edit',onPressed:()=>edit(item),icon:const Icon(Icons.edit_outlined)),
            if(actions.contains('publish'))IconButton(tooltip:item['published']==true?'Unpublish':'Publish',onPressed:()=>publish(item),icon:Icon(item['published']==true?Icons.unpublished_outlined:Icons.publish)),
            if(actions.contains('delete'))IconButton(tooltip:'Delete lesson',onPressed:()=>remove(item),icon:const Icon(Icons.delete_outline)),
          ]):const Icon(Icons.lock_outline));});
      }));
  }
}
