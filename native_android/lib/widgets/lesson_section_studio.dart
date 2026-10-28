import 'package:flutter/material.dart';
import 'package:flutter/foundation.dart';
import 'classic_web_lesson_studio.dart';
import 'plate_document_editor.dart';
import 'plate_page.dart';

/// Native/Flutter-Web counterpart of the production Legacy Plate lesson editor.
/// Pages are canonical chapter.sections; all existing IDs, documents and lesson
/// publishing permissions are preserved by the calling RecordEditor API.
class LessonSectionStudio extends StatefulWidget{
  const LessonSectionStudio({
    required this.value,required this.onChanged,required this.onSave,
    required this.onQuiz,required this.onAdvanced,required this.saving,
    this.guideTitle='',this.dirty=false,super.key,
  });
  final Map<String,dynamic> value;
  final VoidCallback onChanged,onSave,onQuiz,onAdvanced;
  final bool saving,dirty;
  final String guideTitle;
  @override State<LessonSectionStudio> createState()=>_LessonSectionStudioState();
}

class _LessonSectionStudioState extends State<LessonSectionStudio>{
  static const navy=Color(0xFF173E71),blue=Color(0xFF2563EB);
  static const border=Color(0xFFD9E5F2),surface=Color(0xFFF6F9FE);
  String? chapterId,sectionId;
  String ribbon='Home';
  bool preview=false;
  bool pagesExpanded=true;
  bool metadataExpanded=false;
  int sequence=0;
  final Map<String,GlobalKey> sectionKeys={};
  final Map<String,GlobalKey<PlateDocumentEditorState>> editorKeys={};
  String id()=> 'studio-${DateTime.now().microsecondsSinceEpoch.toRadixString(36)}-${sequence++}';
  Map<String,dynamic> obj(dynamic value)=>value is Map?Map<String,dynamic>.from(value):<String,dynamic>{};
  List<Map<String,dynamic>> list(dynamic value)=>value is List
    ?value.whereType<Map>().map((row)=>Map<String,dynamic>.from(row)).toList()
    :<Map<String,dynamic>>[];
  List<Map<String,dynamic>> get chapters=>list(widget.value['chapters']);
  int get chapterIndex{
    final i=chapters.indexWhere((v)=>v['id']?.toString()==chapterId);
    return i>=0?i:0;
  }
  List<Map<String,dynamic>> get sections=>chapters.isEmpty?[]:list(chapters[chapterIndex]['sections']);
  String get activeSectionId=>sectionId??(sections.isNotEmpty?'${sections.first['id']}':'');
  int get sectionIndex{
    final i=sections.indexWhere((v)=>v['id']?.toString()==activeSectionId);
    return i>=0?i:0;
  }
  Map<String,dynamic>? get section=>sections.isEmpty?null:sections[sectionIndex];
  GlobalKey sectionKey(String sid)=>sectionKeys.putIfAbsent(sid,()=>GlobalKey());
  GlobalKey<PlateDocumentEditorState> editorKey(String sid)=>
    editorKeys.putIfAbsent(sid,()=>GlobalKey<PlateDocumentEditorState>());

  void selectChapter(int index){
    final source=chapters;
    if(index<0||index>=source.length)return;
    setState((){
      chapterId=source[index]['id']?.toString();
      final pages=list(source[index]['sections']);
      sectionId=pages.isEmpty?null:pages.first['id']?.toString();
    });
    if(sectionId!=null)focusSection(sectionId!);
  }
  void focusSection(String id){
    if(!sections.any((row)=>row['id']?.toString()==id))return;
    setState(()=>sectionId=id);
    WidgetsBinding.instance.addPostFrameCallback((_){
      if(!mounted)return;
      final target=sectionKey(id).currentContext;
      if(target!=null)Scrollable.ensureVisible(target,
        duration:const Duration(milliseconds:240),
        curve:Curves.easeInOut,alignment:.08);
    });
  }
  void changeMetadata(String key,dynamic next){
    widget.value[key]=next;
    widget.onChanged();
  }
  void changeSection(String id,Map<String,dynamic> patch){
    final source=chapters;
    if(source.isEmpty)return;
    final index=chapterIndex;
    final pages=list(source[index]['sections']);
    final row=pages.indexWhere((p)=>p['id']?.toString()==id);
    if(row<0)return;
    pages[row]={...pages[row],...patch};
    source[index]['sections']=pages;
    widget.value['chapters']=source;
    widget.onChanged();
  }
  void setDocument(String sid,List<Map<String,dynamic>> doc)=>
    changeSection(sid,{'document':doc});
  void addChapter(){
    final source=chapters;
    if(source.length>=40)return;
    final sid=id();
    final created={
      'id':id(),'title':'New chapter',
      'sections':[{
        'id':sid,'title':'New section',
        'document':[{'id':id(),'type':'p','children':[{'text':''}]}]
      }]
    };
    source.add(created);
    widget.value['chapters']=source;
    widget.onChanged();
    selectChapter(source.length-1);
  }
  void addSection(){
    final source=chapters;
    if(source.isEmpty){addChapter();return;}
    final ci=chapterIndex,pages=list(source[ci]['sections']);
    if(pages.length>=40)return;
    final sid=id();
    pages.insert(pages.isEmpty?0:sectionIndex+1,{
      'id':sid,'title':'New section',
      'document':[{'id':id(),'type':'p','children':[{'text':''}]}]
    });
    source[ci]['sections']=pages;
    widget.value['chapters']=source;
    widget.onChanged();
    focusSection(sid);
  }
  void selectRibbon(String tab)=>setState(()=>ribbon=tab);
  void act(void Function(PlateDocumentEditorState) command){
    final state=editorKey(activeSectionId).currentState;
    if(state!=null)command(state);
  }
  Widget bordered(Widget child,{EdgeInsets padding=const EdgeInsets.all(10)})=>
    Container(padding:padding,decoration:BoxDecoration(
      color:Colors.white,border:Border.all(color:border),
      borderRadius:BorderRadius.circular(11)),child:child);
  Widget field(String label,String key,{double width=190,bool readOnly=false,String? display}){
    final value=display??(widget.value[key]??'').toString();
    return SizedBox(width:width,child:Column(
      crossAxisAlignment:CrossAxisAlignment.start,children:[
        Text(label,style:const TextStyle(color:Color(0xFF526D8B),
          fontWeight:FontWeight.w700,fontSize:11)),
        const SizedBox(height:4),
        TextFormField(
          key:ValueKey('lesson-meta-$key'),
          initialValue:value,readOnly:readOnly,
          decoration:InputDecoration(isDense:true,filled:true,
            fillColor:readOnly?const Color(0xFFF3F7FD):Colors.white,
            contentPadding:const EdgeInsets.symmetric(horizontal:11,vertical:13),
            border:OutlineInputBorder(borderRadius:BorderRadius.circular(8))),
          style:const TextStyle(fontSize:13,color:navy,fontWeight:FontWeight.w600),
          onChanged:readOnly?null:(text)=>changeMetadata(key,text),
        ),
      ]));
  }
  Widget topHeader(bool narrow){
    final guide=widget.guideTitle.isNotEmpty?widget.guideTitle:
      (widget.value['guideId']??'Guide').toString();
    return bordered(Column(crossAxisAlignment:CrossAxisAlignment.stretch,children:[
      if(narrow)...[
        Row(children:[
          const Icon(Icons.menu_book_outlined,color:navy,size:23),
          const SizedBox(width:8),
          Expanded(child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
            Text((widget.value['title']??'New lesson').toString(),
              maxLines:1,overflow:TextOverflow.ellipsis,
              style:const TextStyle(fontSize:16,fontWeight:FontWeight.w800,color:navy)),
            Text('$guide · ${widget.value['language']??''}',
              maxLines:1,overflow:TextOverflow.ellipsis,
              style:const TextStyle(color:Color(0xFF7691AE),fontSize:12)),
          ])),
          IconButton(tooltip:'Edit lesson details',
            onPressed:()=>setState(()=>metadataExpanded=!metadataExpanded),
            icon:Icon(metadataExpanded?Icons.expand_less:Icons.edit_outlined,color:navy)),
        ]),
        if(metadataExpanded)Padding(padding:const EdgeInsets.only(top:12),
          child:Wrap(crossAxisAlignment:WrapCrossAlignment.end,
            spacing:8,runSpacing:8,children:[
              field('Lesson Title *','title',width:235),
              field('Lesson # *','lessonNumber',width:120),
              field('Guide *','guideId',display:guide,readOnly:true,width:165),
              field('Language','language',readOnly:true,width:120),
            ])),
        const SizedBox(height:6),
      ] else Wrap(crossAxisAlignment:WrapCrossAlignment.end,spacing:10,runSpacing:10,children:[
        field('Lesson Title *','title',width:narrow?235:270),
        field('Lesson # *','lessonNumber',width:100),
        field('Guide *','guideId',display:guide,readOnly:true,width:170),
        field('Season / Quarter','season',display:(widget.value['season']??'Not assigned').toString(),
          readOnly:true,width:145),
        field('Language','language',readOnly:true,width:145),
        if(chapters.isNotEmpty)SizedBox(width:200,child:DropdownButtonFormField<String>(
          key:ValueKey('chapter-$chapterIndex'),
          initialValue:chapters[chapterIndex]['id']?.toString(),
          isExpanded:true,
          decoration:const InputDecoration(labelText:'Chapter',
            isDense:true,border:OutlineInputBorder()),
          items:[for(var i=0;i<chapters.length;i++)DropdownMenuItem(
            value:chapters[i]['id']?.toString(),
            child:Text('${i+1}. ${chapters[i]['title']??'Chapter'}',
              overflow:TextOverflow.ellipsis))],
          onChanged:(value){final i=chapters.indexWhere((ch)=>ch['id']==value);
            if(i>=0)selectChapter(i);},
        )),
      ]),
      const SizedBox(height:10),
      Wrap(spacing:7,runSpacing:7,crossAxisAlignment:WrapCrossAlignment.center,children:[
        Chip(avatar:Icon(widget.saving?Icons.sync:widget.dirty
          ?Icons.edit_note:Icons.check_circle_outline,
          color:widget.dirty?const Color(0xFF9A6700):const Color(0xFF147D48),size:17),
          label:Text(widget.saving?'Saving…':widget.dirty?'Unsaved changes':'No unsaved changes'),
          backgroundColor:widget.dirty?const Color(0xFFFFF6DE):const Color(0xFFEDFBF3),
          side:BorderSide.none,visualDensity:VisualDensity.compact),
        OutlinedButton.icon(onPressed:()=>setState(()=>preview=!preview),
          icon:Icon(preview?Icons.edit_outlined:Icons.visibility_outlined,size:18),
          label:Text(preview?'Edit':'Preview')),
        OutlinedButton.icon(onPressed:widget.saving?null:widget.onSave,
          icon:const Icon(Icons.save_outlined,size:18),
          label:Text(widget.value['published']==true?'Save changes':'Save draft')),
        FilledButton.icon(onPressed:widget.saving?null:widget.onSave,
          icon:const Icon(Icons.send_outlined,size:17),label:const Text('Update')),
        PopupMenuButton<String>(tooltip:'More editor options',
          onSelected:(action){
            if(action=='chapter')addChapter();
            if(action=='advanced')widget.onAdvanced();
            if(action=='quiz')widget.onQuiz();
          },itemBuilder:(_)=>const [
            PopupMenuItem(value:'chapter',child:Text('Add chapter')),
            PopupMenuItem(value:'advanced',child:Text('Advanced structure editor')),
            PopupMenuItem(value:'quiz',child:Text('Quiz library')),
          ]),
      ]),
    ]),padding:const EdgeInsets.fromLTRB(12,10,12,10));
  }
  Widget tool(IconData icon,String label,VoidCallback onTap)=>
    OutlinedButton.icon(onPressed:onTap,
      style:OutlinedButton.styleFrom(foregroundColor:navy,
        padding:const EdgeInsets.symmetric(horizontal:9,vertical:9),
        side:const BorderSide(color:border)),
      icon:Icon(icon,size:16),label:Text(label,style:const TextStyle(fontSize:12)));
  Widget ribbonBar(){
    return bordered(Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
      SingleChildScrollView(scrollDirection:Axis.horizontal,child:Row(children:[
        for(final tab in ['Home','Insert','Scripture & Layout'])
          Padding(padding:const EdgeInsets.only(right:6),child:TextButton(
            onPressed:()=>selectRibbon(tab),
            style:TextButton.styleFrom(backgroundColor:ribbon==tab
              ?const Color(0xFFEAF3FF):Colors.transparent),
            child:Text(tab,style:TextStyle(fontWeight:FontWeight.w700,
              color:ribbon==tab?blue:navy)))),
      ])),
      const Divider(height:5),
      SingleChildScrollView(scrollDirection:Axis.horizontal,
        child:Row(children:[
          if(ribbon=='Home')...[
            tool(Icons.undo,'Undo',()=>act((e)=>e.undo())),
            const SizedBox(width:6),
            tool(Icons.redo,'Redo',()=>act((e)=>e.redo())),
            const SizedBox(width:9),
            tool(Icons.notes,'Paragraph',()=>act((e)=>e.styleActiveBlock('p'))),
            const SizedBox(width:6),
            tool(Icons.title,'Heading',()=>act((e)=>e.styleActiveBlock('h2'))),
            const SizedBox(width:6),
            tool(Icons.format_quote,'Quote',()=>act((e)=>e.styleActiveBlock('blockquote'))),
            const SizedBox(width:9),
            tool(Icons.format_bold,'Bold',()=>act((e)=>e.markActiveBlock('bold'))),
            const SizedBox(width:6),
            tool(Icons.format_italic,'Italic',()=>act((e)=>e.markActiveBlock('italic'))),
            const SizedBox(width:6),
            tool(Icons.format_underlined,'Underline',
              ()=>act((e)=>e.markActiveBlock('underline'))),
          ]else if(ribbon=='Insert')...[
            for(final item in <(String,IconData,String)>[
              ('p',Icons.subject,'Paragraph'),
              ('img',Icons.image_outlined,'Image'),
              ('video',Icons.ondemand_video_outlined,'Video'),
              ('audio',Icons.audiotrack_outlined,'Audio'),
              ('table',Icons.table_chart_outlined,'Table'),
              ('ul',Icons.format_list_bulleted,'List'),
              ('link',Icons.link,'Link'),
            ])Padding(padding:const EdgeInsets.only(right:6),
              child:tool(item.$2,item.$3,()=>act((e)=>e.insertBlock(item.$1)))),
          ]else ...[
            tool(Icons.menu_book_outlined,'Scripture focus',()=>_scriptureDialog()),
            const SizedBox(width:7),
            tool(Icons.note_add_outlined,'Start section',addSection),
            const SizedBox(width:7),
            tool(Icons.library_books_outlined,'Quiz library',widget.onQuiz),
          ],
        ])),
    ]),padding:const EdgeInsets.fromLTRB(10,4,10,9));
  }
  Future<void> _scriptureDialog()async{
    final current=section;if(current==null)return;
    final sid=current['id'].toString();
    final previous=obj(current['scriptureQuote']);
    final reference=TextEditingController(text:(previous['reference']??'').toString());
    final passage=TextEditingController(text:(previous['text']??'').toString());
    final result=await showDialog<bool>(context:context,builder:(ctx)=>AlertDialog(
      title:const Text('Scripture focus'),
      content:SizedBox(width:440,child:SingleChildScrollView(child:Column(
        mainAxisSize:MainAxisSize.min,children:[
          TextField(controller:reference,decoration:const InputDecoration(labelText:'Reference')),
          const SizedBox(height:8),
          TextField(controller:passage,maxLines:5,
            decoration:const InputDecoration(labelText:'Passage text')),
        ]))),
      actions:[TextButton(onPressed:()=>Navigator.pop(ctx,false),
        child:const Text('Cancel')),FilledButton(onPressed:()=>Navigator.pop(ctx,true),
          child:const Text('Save'))],
    ));
    if(result==true&&mounted){
      changeSection(sid,{'scriptureQuote':{
        'reference':reference.text.trim(),'text':passage.text.trim(),
      }});
    }
    reference.dispose();passage.dispose();
  }
  Widget pageButton(Map<String,dynamic> page,int index,{bool compact=false}){
    final sid=page['id']?.toString()??'';
    final active=sid==activeSectionId;
    final blocks=list(page['document']);
    return InkWell(
      key:ValueKey('page-button-$sid'),onTap:()=>focusSection(sid),
      child:Container(
        constraints:BoxConstraints(minWidth:compact?150:0,maxWidth:compact?205:double.infinity),
        decoration:BoxDecoration(color:active?const Color(0xFFEEF5FF):Colors.white,
          border:Border.all(color:active?blue:border,width:active?1.5:1),
          borderRadius:BorderRadius.circular(9)),
        padding:const EdgeInsets.symmetric(horizontal:9,vertical:11),
        child:Row(children:[
          Icon(Icons.drag_indicator,size:15,color:Colors.blueGrey.shade300),
          const SizedBox(width:6),
          Container(width:27,height:27,alignment:Alignment.center,
            decoration:BoxDecoration(color:const Color(0xFF213E8B),
              borderRadius:BorderRadius.circular(6)),
            child:Text('${index+1}',style:const TextStyle(color:Colors.white,fontWeight:FontWeight.bold))),
          const SizedBox(width:8),
          Expanded(child:Column(mainAxisSize:MainAxisSize.min,crossAxisAlignment:CrossAxisAlignment.start,children:[
            Text(page['title']?.toString()??'Section',
              maxLines:1,overflow:TextOverflow.ellipsis,
              style:const TextStyle(fontWeight:FontWeight.bold,fontSize:12,color:navy)),
            Text('${blocks.length} content blocks',
              style:const TextStyle(fontSize:11,color:Color(0xFF7990A9))),
          ])),
          if(!compact)PopupMenuButton<String>(tooltip:'Section actions',
            onSelected:(action){
              if(action=='rename')_renameSection(sid);
              if(action=='delete')_deleteSection(sid);
            },itemBuilder:(_)=>[
              const PopupMenuItem(value:'rename',child:Text('Rename section')),
              if(sections.length>1)
                const PopupMenuItem(value:'delete',child:Text('Remove section')),
            ]),
        ])),
    );
  }
  Future<void> _renameSection(String sid)async{
    final row=sections.where((s)=>s['id']?.toString()==sid).toList();
    if(row.isEmpty)return;
    final title=TextEditingController(text:(row.first['title']??'').toString());
    final accepted=await showDialog<bool>(context:context,builder:(ctx)=>AlertDialog(
      title:const Text('Rename section'),
      content:TextField(controller:title,maxLength:240,autofocus:true),
      actions:[TextButton(onPressed:()=>Navigator.pop(ctx,false),
        child:const Text('Cancel')),FilledButton(onPressed:()=>Navigator.pop(ctx,true),
        child:const Text('Save'))]));
    if(accepted==true&&title.text.trim().isNotEmpty)changeSection(sid,{'title':title.text.trim()});
    title.dispose();
  }
  void _deleteSection(String sid){
    final src=chapters;
    if(src.isEmpty||sections.length<2)return;
    final ci=chapterIndex,pages=list(src[ci]['sections']);
    pages.removeWhere((p)=>p['id']?.toString()==sid);
    src[ci]['sections']=pages;
    widget.value['chapters']=src;
    widget.onChanged();
    focusSection(pages.first['id']!.toString());
  }
  Widget pagesSidebar(){
    return bordered(Column(crossAxisAlignment:CrossAxisAlignment.stretch,children:[
      const Text('LEARNER PAGES',style:TextStyle(fontSize:12,fontWeight:FontWeight.bold,color:Color(0xFF627D9B))),
      Text('${sections.length} sections',style:const TextStyle(color:navy,fontWeight:FontWeight.bold)),
      const SizedBox(height:9),
      OutlinedButton.icon(onPressed:addSection,
        icon:const Icon(Icons.add,size:17),label:const Text('Add section')),
      const SizedBox(height:8),
      Expanded(child:ListView.separated(
        itemCount:sections.length,
        separatorBuilder:(_,__)=>const SizedBox(height:6),
        itemBuilder:(_,index)=>pageButton(sections[index],index),
      )),
    ]));
  }
  Widget mobilePages(){
    return bordered(Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
      InkWell(onTap:()=>setState(()=>pagesExpanded=!pagesExpanded),
        child:Row(children:[
          const Icon(Icons.menu_book_outlined,size:18,color:navy),
          const SizedBox(width:8),
          Expanded(child:Wrap(spacing:4,children:[
            const Text('Lesson Pages',style:TextStyle(fontWeight:FontWeight.bold,color:navy)),
            Text('(${sections.length} sections)',
              style:const TextStyle(color:Color(0xFF6982A1))),
          ])),
          Icon(pagesExpanded?Icons.expand_less:Icons.expand_more),
        ])),
      if(pagesExpanded)...[
        const SizedBox(height:8),
        SingleChildScrollView(scrollDirection:Axis.horizontal,
          child:Row(children:[
            for(var index=0;index<sections.length;index++)...[
              if(index>0)const SizedBox(width:7),
              pageButton(sections[index],index,compact:true),
            ],
          ])),
      ],
    ]),padding:const EdgeInsets.all(10));
  }
  Widget contentPage(Map<String,dynamic> row,int index){
    final sid=(row['id']??'').toString();
    final active=sid==activeSectionId;
    final doc=list(row['document']);
    return Container(key:sectionKey(sid),
      margin:const EdgeInsets.only(bottom:16),
      decoration:BoxDecoration(color:Colors.white,
        border:Border.all(color:active?const Color(0xFF9DC5FF):border,
          width:active?1.5:1),
        borderRadius:BorderRadius.circular(11)),
      child:Column(crossAxisAlignment:CrossAxisAlignment.stretch,children:[
        Container(padding:const EdgeInsets.all(12),
          decoration:const BoxDecoration(color:Color(0xFFF0F6FF),
            borderRadius:BorderRadius.vertical(top:Radius.circular(10))),
          child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
            Text('▱  SECTION / LEARNER PAGE  ${index+1}',
              style:const TextStyle(fontSize:12,fontWeight:FontWeight.w700,color:blue)),
            const SizedBox(height:7),
            TextFormField(key:ValueKey('page-title-$sid'),
              initialValue:(row['title']??'').toString(),maxLength:240,
              decoration:const InputDecoration(
                hintText:'Section title',isDense:true,border:OutlineInputBorder()),
              onTap:()=>setState(()=>sectionId=sid),
              onChanged:(text)=>changeSection(sid,{'title':text}),
            ),
          ])),
        if(row['scriptureQuote'] is Map && !preview)
          Padding(padding:const EdgeInsets.fromLTRB(12,10,12,0),
            child:Text('Scripture focus: ${obj(row['scriptureQuote'])['reference']??''}',
              style:const TextStyle(color:Color(0xFF486D97),fontSize:12))),
        Padding(padding:const EdgeInsets.all(12),
          child:preview?PlatePageView(page:row):PlateDocumentEditor(
            key:editorKey(sid),document:doc,
            onChanged:(next)=>setDocument(sid,next))),
      ]),
    );
  }
  Widget canvas(){
    return Container(decoration:BoxDecoration(color:Colors.white,border:Border.all(color:border),
      borderRadius:BorderRadius.circular(11)),
      child:SingleChildScrollView(
        padding:const EdgeInsets.all(12),
        child:Column(crossAxisAlignment:CrossAxisAlignment.stretch,children:[
          if(sections.isEmpty)OutlinedButton.icon(onPressed:addSection,
            icon:const Icon(Icons.add),label:const Text('Add section')),
          for(var i=0;i<sections.length;i++)contentPage(sections[i],i),
          if(!preview)OutlinedButton.icon(onPressed:addSection,
            icon:const Icon(Icons.add),label:const Text('Start another section')),
        ])),
    );
  }
  @override Widget build(BuildContext context){
    if(kIsWeb) {
      return ClassicWebLessonStudio(
        value:widget.value, onChanged:widget.onChanged,
        onSave:widget.onSave, onQuiz:widget.onQuiz,
        onAdvanced:widget.onAdvanced, saving:widget.saving,
        dirty:widget.dirty, guideTitle:widget.guideTitle,
      );
    }
    final currentChapters=chapters;
    return Theme(data:ThemeData.light(useMaterial3:true).copyWith(
      colorScheme:ColorScheme.fromSeed(seedColor:blue),
      scaffoldBackgroundColor:surface),
      child:LayoutBuilder(builder:(context,box){
        final mobile=box.maxWidth<770;
        return Container(color:surface,padding:EdgeInsets.all(mobile?8:12),
          child:Column(crossAxisAlignment:CrossAxisAlignment.stretch,children:[
            topHeader(mobile),
            const SizedBox(height:8),
            if(mobile)mobilePages(),
            if(mobile)const SizedBox(height:7),
            if(currentChapters.isNotEmpty)ribbonBar(),
            if(currentChapters.isNotEmpty)const SizedBox(height:8),
            if(currentChapters.isEmpty)
              Expanded(child:Center(child:FilledButton.icon(
                onPressed:addChapter,icon:const Icon(Icons.add),
                label:const Text('Add first chapter'))))
            else Expanded(child:mobile?canvas():Row(
              crossAxisAlignment:CrossAxisAlignment.stretch,children:[
                SizedBox(width:box.maxWidth<950?195:240,child:pagesSidebar()),
                const SizedBox(width:10),
                Expanded(child:canvas()),
              ])),
            if(mobile&&currentChapters.isNotEmpty&&!preview)SafeArea(top:false,
              child:Padding(padding:const EdgeInsets.only(top:7),
                child:SingleChildScrollView(scrollDirection:Axis.horizontal,
                  child:Row(children:[
                    tool(Icons.add,'Add block',
                      ()=>act((e)=>e.insertBlock('p'))),
                    const SizedBox(width:7),
                    tool(Icons.format_bold,'Format',
                      ()=>selectRibbon('Home')),
                    const SizedBox(width:7),
                    tool(Icons.image_outlined,'Media',
                      ()=>selectRibbon('Insert')),
                    const SizedBox(width:7),
                    tool(Icons.visibility_outlined,'Preview',
                      ()=>setState(()=>preview=true)),
                    const SizedBox(width:7),
                    FilledButton.icon(onPressed:widget.saving?null:widget.onSave,
                      icon:const Icon(Icons.send_outlined,size:17),
                      label:const Text('Update')),
                  ])))),
          ]),
        );
      }),
    );
  }
}
