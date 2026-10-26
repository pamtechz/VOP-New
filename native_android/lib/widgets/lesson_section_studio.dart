import 'package:flutter/material.dart';
import 'plate_page.dart';

/// The visual lesson studio edits the same canonical chapter/section/document
/// records consumed by the web editor. Quiz answer keys are never stored here.
class LessonSectionStudio extends StatefulWidget {
  const LessonSectionStudio({
    required this.value,
    required this.onChanged,
    required this.onSave,
    required this.onQuiz,
    required this.onAdvanced,
    required this.saving,
    super.key,
  });
  final Map<String,dynamic> value;
  final VoidCallback onChanged,onSave,onQuiz,onAdvanced;
  final bool saving;
  @override State<LessonSectionStudio> createState()=>_LessonSectionStudioState();
}

class _LessonSectionStudioState extends State<LessonSectionStudio> {
  static const base=Color(0xFF09182B),card=Color(0xFF102640);
  static const blue=Color(0xFF2979FF),outline=Color(0xFF284563);
  String? chapterId,sectionId;
  String inspector='content';
  bool preview=false;
  int serial=0;

  String newId()=> 'studio-${DateTime.now().microsecondsSinceEpoch.toRadixString(36)}-${serial++}';
  Map<String,dynamic> asMap(dynamic input)=>input is Map?Map<String,dynamic>.from(input):{};
  List<Map<String,dynamic>> rows(dynamic input)=>input is List?input.map(asMap).toList():[];

  List<Map<String,dynamic>> get chapters=>rows(widget.value['chapters']);
  int get currentChapterIndex {
    final index=chapters.indexWhere((row)=>row['id']==chapterId);
    return index>=0?index:0;
  }
  List<Map<String,dynamic>> get pages=>chapters.isEmpty?[]:rows(chapters[currentChapterIndex]['sections']);
  int get currentSectionIndex {
    final index=pages.indexWhere((row)=>row['id']==sectionId);
    return index>=0?index:0;
  }
  Map<String,dynamic>? get currentSection=>pages.isEmpty?null:pages[currentSectionIndex];

  void setChapter(int index){
    final source=chapters;
    if(index<0||index>=source.length)return;
    setState((){
      chapterId=source[index]['id']?.toString();
      final sections=rows(source[index]['sections']);
      sectionId=sections.isEmpty?null:sections.first['id']?.toString();
      preview=false;
    });
  }
  void focusSection(int index){
    final source=pages;
    if(index<0||index>=source.length)return;
    setState((){sectionId=source[index]['id']?.toString();preview=false;});
    // Only the chosen section is mounted; its page card becomes the focus,
    // never another section's old scroll offset.
    WidgetsBinding.instance.addPostFrameCallback((_){
      if(mounted&&_coverKey.currentContext!=null){
        Scrollable.ensureVisible(_coverKey.currentContext!,
          duration:const Duration(milliseconds:220),alignment:0.10);
      }
    });
  }
  final GlobalKey _coverKey=GlobalKey();

  void updateSection(Map<String,dynamic> next){
    final source=chapters;
    if(source.isEmpty||pages.isEmpty)return;
    final ch=currentChapterIndex,at=currentSectionIndex;
    final sections=rows(source[ch]['sections']);
    sections[at]=next;
    source[ch]['sections']=sections;
    widget.value['chapters']=source;
    widget.onChanged();
  }
  void updateField(String key,dynamic val) {
    final section=currentSection;
    if(section==null)return;
    updateSection({...section,key:val});
  }
  void updateDocument(List<Map<String,dynamic>> nodes) {
    final section=currentSection;
    if(section==null)return;
    updateSection({...section,'document':nodes});
  }
  void addSection(){
    final source=chapters;
    if(source.isEmpty)return;
    final ch=currentChapterIndex,sections=rows(source[ch]['sections']);
    if(sections.length>=40)return;
    final section={'id':newId(),'title':'New section',
      'document':[{'id':newId(),'type':'p','children':[{'text':''}]}]};
    sections.insert(currentSection==null?sections.length:currentSectionIndex+1,section);
    source[ch]['sections']=sections;
    widget.value['chapters']=source;
    sectionId=section['id']?.toString();
    widget.onChanged();setState(()=>preview=false);
  }
  void addChapter(){
    final source=chapters;
    if(source.length>=40)return;
    final entry={'id':newId(),'title':'New chapter','sections':[
      {'id':newId(),'title':'New section','document':[
        {'id':newId(),'type':'p','children':[{'text':''}]}
      ]}
    ]};
    source.add(entry);widget.value['chapters']=source;
    widget.onChanged();
    setChapter(source.length-1);
  }
  List<Map<String,dynamic>> get document {
    final section=currentSection;
    if(section==null)return [];
    if(section['document'] is List)return rows(section['document']);
    // Legacy sections are rendered and remain editable using the advanced
    // editor; never discard them while introducing the visual studio.
    return [];
  }
  void addBlock(String type){
    final nodes=document;
    if(currentSection==null)return;
    if(nodes.length>=50)return;
    nodes.add(type=='image'
      ?{'id':newId(),'type':'img','url':'','children':[{'text':''}]}
      :{'id':newId(),'type':type=='quote'?'blockquote':'p','children':[{'text':''}]});
    updateDocument(nodes);setState(()=>preview=false);
  }
  void updateBlock(int index,Map<String,dynamic> block){
    final nodes=document;
    if(index<0||index>=nodes.length)return;
    nodes[index]=block;updateDocument(nodes);
  }
  void reorderBlock(int oldIndex,int step){
    final nodes=document,target=oldIndex+step;
    if(oldIndex<0||target<0||target>=nodes.length)return;
    final moved=nodes.removeAt(oldIndex);
    nodes.insert(target,moved);updateDocument(nodes);
  }
  void removeBlock(int index){
    final nodes=document;
    if(nodes.length<=1)return;
    nodes.removeAt(index);updateDocument(nodes);
  }
  Widget navItem(Map<String,dynamic> page,int index,{bool compact=false}){
    final active=index==currentSectionIndex;
    final media=(page['imageUrl']??'').toString();
    return InkWell(
      onTap:()=>focusSection(index),
      borderRadius:BorderRadius.circular(12),
      child:Container(
        constraints:BoxConstraints(minWidth:compact?150:0,maxWidth:compact?230:double.infinity),
        padding:const EdgeInsets.all(8),
        decoration:BoxDecoration(
          color:active?const Color(0xFF173E74):card,
          border:Border.all(color:active?blue:outline,width:active?1.5:1),
          borderRadius:BorderRadius.circular(11)),
        child:Row(children:[
          if(media.startsWith('https://'))
            ClipRRect(borderRadius:BorderRadius.circular(7),
              child:Image.network(media,width:45,height:45,fit:BoxFit.cover,
                errorBuilder:(_,__,___)=>const SizedBox(width:45,height:45,child:Icon(Icons.image_outlined))))
          else Container(width:45,height:45,alignment:Alignment.center,
            decoration:BoxDecoration(color:const Color(0xFF203F63),borderRadius:BorderRadius.circular(7)),
            child:Text('${index+1}',style:const TextStyle(fontWeight:FontWeight.bold))),
          const SizedBox(width:9),
          Expanded(child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
            Text('${index+1}. ${page['title']??'Section'}',
              maxLines:2,overflow:TextOverflow.ellipsis,
              style:const TextStyle(fontSize:12.5,fontWeight:FontWeight.bold)),
            const SizedBox(height:3),
            Text('${rows(page['document']).length} blocks',
              style:const TextStyle(fontSize:11,color:Color(0xFFA3BFDB))),
          ])),
        ]),
      ),
    );
  }

  Widget cover(Map<String,dynamic> page){
    final url=(page['imageUrl']??'').toString();
    return Container(key:_coverKey,clipBehavior:Clip.antiAlias,
      constraints:const BoxConstraints(minHeight:160),
      decoration:BoxDecoration(
        border:Border.all(color:outline),
        borderRadius:BorderRadius.circular(13),
        gradient:const LinearGradient(colors:[Color(0xFF0C2849),Color(0xFF225383)])),
      child:Stack(children:[
        if(url.startsWith('https://'))Positioned.fill(child:Image.network(url,
          fit:BoxFit.cover,errorBuilder:(_,__,___)=>const SizedBox.shrink())),
        Positioned.fill(child:DecoratedBox(decoration:BoxDecoration(
          gradient:LinearGradient(begin:Alignment.centerLeft,end:Alignment.centerRight,
            colors:[base.withValues(alpha:.94),base.withValues(alpha:.35)])))),
        Padding(padding:const EdgeInsets.all(19),child:Column(
          crossAxisAlignment:CrossAxisAlignment.start,children:[
            Text('SECTION ${currentSectionIndex+1}',style:const TextStyle(
              fontSize:11,letterSpacing:1.0,fontWeight:FontWeight.bold,color:Color(0xFFCDE4FF))),
            const SizedBox(height:10),
            Text((page['title']??'Section').toString(),
              style:const TextStyle(fontSize:26,fontWeight:FontWeight.w800,height:1.12)),
            const SizedBox(height:8),
            Text((page['keyTakeaway']??'').toString().isEmpty
              ?'Study content and reflection'
              :(page['keyTakeaway']??'').toString(),
              style:const TextStyle(color:Color(0xFFD0DFF1),height:1.35)),
          ])),
      ]),
    );
  }

  Widget blockCard(Map<String,dynamic> block,int index){
    final type=(block['type']??'p').toString();
    final leaves=rows(block['children']);
    final simple=leaves.length==1&&leaves.single['text'] is String;
    final photo=type=='img'||type=='image';
    final quote=type=='blockquote';
    final title=photo?'Image':quote?'Scripture / Quotation':
      type=='h1'||type=='h2'?'Heading':'Paragraph';
    final text=simple?leaves.single['text'].toString():'';
    return Container(
      key:ValueKey('block-${block['id']??index}'),
      margin:const EdgeInsets.only(bottom:10),
      padding:const EdgeInsets.all(13),
      decoration:BoxDecoration(
        color:quote?const Color(0xFF133358):card,
        border:Border.all(color:quote?const Color(0xFF2D6AA5):outline),
        borderRadius:BorderRadius.circular(13)),
      child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
        Row(children:[
          const Icon(Icons.drag_indicator,size:18,color:Color(0xFF819AB7)),
          const SizedBox(width:8),
          Icon(photo?Icons.image_outlined:quote?Icons.menu_book_outlined:Icons.text_fields,
            size:19,color:quote?const Color(0xFF6CB5FF):const Color(0xFFA0CDFF)),
          const SizedBox(width:9),
          Expanded(child:Text(title,style:const TextStyle(fontSize:13,fontWeight:FontWeight.bold))),
          PopupMenuButton<String>(tooltip:'Block actions',
            onSelected:(action){
              if(action=='up')reorderBlock(index,-1);
              if(action=='down')reorderBlock(index,1);
              if(action=='remove')removeBlock(index);
            },
            itemBuilder:(_)=>[
              if(index>0)const PopupMenuItem(value:'up',child:Text('Move up')),
              if(index<document.length-1)const PopupMenuItem(value:'down',child:Text('Move down')),
              if(document.length>1)const PopupMenuItem(value:'remove',child:Text('Remove block')),
            ]),
        ]),
        if(photo)Padding(padding:const EdgeInsets.only(top:9),child:TextFormField(
          key:ValueKey('image-${block['id']}'),
          initialValue:(block['url']??block['src']??'').toString(),
          decoration:const InputDecoration(labelText:'Image HTTPS URL',isDense:true),
          keyboardType:TextInputType.url,
          onChanged:(value)=>updateBlock(index,{...block,'url':value}),
        ))
        else if(simple)Padding(padding:const EdgeInsets.only(top:8),child:TextFormField(
          key:ValueKey('text-${block['id']}'),
          initialValue:text,maxLines:null,minLines:quote?2:3,
          style:TextStyle(fontSize:15,height:1.65,fontStyle:quote?FontStyle.italic:null),
          decoration:const InputDecoration(border:InputBorder.none,
            hintText:'Write your lesson content…',isDense:true),
          onChanged:(value)=>updateBlock(index,{...block,'children':[{'text':value}]}),
        ))
        else Padding(padding:const EdgeInsets.only(top:10),child:Column(
          crossAxisAlignment:CrossAxisAlignment.start,children:[
            const Text('Rich formatted content is preserved.',style:TextStyle(color:Color(0xFFAFCAE7))),
            const SizedBox(height:5),
            OutlinedButton.icon(onPressed:widget.onAdvanced,icon:const Icon(Icons.edit_note),
              label:const Text('Open advanced editor')),
          ])),
      ]),
    );
  }

  Widget settingField(String title,String key,{int lines=1}){
    final section=currentSection!;
    final initial=(section[key]??'').toString();
    return Padding(padding:const EdgeInsets.only(bottom:11),
      child:TextFormField(key:ValueKey('${section['id']}-$key'),
        initialValue:initial,maxLines:lines,
        decoration:InputDecoration(labelText:title,isDense:true,
          border:const OutlineInputBorder()),onChanged:(value)=>updateField(key,value)));
  }
  Widget inspectorPanel(){
    final section=currentSection;
    if(section==null)return const SizedBox.shrink();
    final scripture=asMap(section['scriptureQuote']);
    return Container(
      padding:const EdgeInsets.all(13),
      decoration:BoxDecoration(color:base,border:Border.all(color:outline),
        borderRadius:BorderRadius.circular(13)),
      child:Column(crossAxisAlignment:CrossAxisAlignment.stretch,children:[
        const Text('Page / Section Settings',style:TextStyle(fontWeight:FontWeight.w800)),
        const SizedBox(height:12),
        SegmentedButton<String>(
          showSelectedIcon:false,
          segments:const [
            ButtonSegment(value:'content',label:Text('Content')),
            ButtonSegment(value:'media',label:Text('Media')),
            ButtonSegment(value:'quiz',label:Text('Quiz')),
          ],
          selected:{inspector},onSelectionChanged:(set)=>setState(()=>inspector=set.first)),
        const SizedBox(height:15),
        if(inspector=='content')...[
          settingField('Page title','title'),
          settingField('Description / takeaway','keyTakeaway',lines:3),
          TextFormField(key:ValueKey('ref-${section['id']}'),
            initialValue:(scripture['reference']??'').toString(),
            decoration:const InputDecoration(labelText:'Scripture reference'),
            onChanged:(value)=>updateField('scriptureQuote',{
              ...asMap(currentSection?['scriptureQuote']),'reference':value,
            })),
          const SizedBox(height:10),
          TextFormField(key:ValueKey('verse-${section['id']}'),
            initialValue:(scripture['text']??'').toString(),maxLines:3,
            decoration:const InputDecoration(labelText:'Scripture passage'),
            onChanged:(value)=>updateField('scriptureQuote',{
              ...asMap(currentSection?['scriptureQuote']),'text':value,
            })),
        ],
        if(inspector=='media')...[
          settingField('Cover image HTTPS URL','imageUrl'),
          settingField('Audio HTTPS URL','audioUrl'),
          settingField('Video HTTPS URL','videoUrl'),
        ],
        if(inspector=='quiz')...[
          const Text('Quiz questions are stored in the private assessment library.',
            style:TextStyle(color:Color(0xFFACC5E2))),
          const SizedBox(height:12),
          FilledButton.icon(onPressed:widget.onQuiz,
            icon:const Icon(Icons.quiz_outlined),label:const Text('Manage quizzes')),
        ],
        const SizedBox(height:12),
        OutlinedButton.icon(onPressed:widget.onAdvanced,
          icon:const Icon(Icons.account_tree_outlined),
          label:const Text('Advanced structure editor')),
      ]),
    );
  }

  @override Widget build(BuildContext context){
    final source=chapters;
    if(source.isEmpty)return Column(children:[
      const Text('Add a chapter to start authoring this lesson.'),
      FilledButton.icon(onPressed:addChapter,icon:const Icon(Icons.add),
        label:const Text('Add chapter')),
    ]);
    final selected=currentSection,wide=MediaQuery.sizeOf(context).width>=1050;
    return Theme(data:ThemeData.dark(useMaterial3:true).copyWith(
      colorScheme:const ColorScheme.dark(primary:Color(0xFF64A7FF),surface:base)),
      child:Container(
        padding:const EdgeInsets.all(8),color:base,
        child:Column(crossAxisAlignment:CrossAxisAlignment.stretch,children:[
          Row(children:[
            Expanded(child:DropdownButtonFormField<String>(
              key:ValueKey('chapter-${source[currentChapterIndex]['id']}'),
              initialValue:source[currentChapterIndex]['id']?.toString(),
              decoration:const InputDecoration(labelText:'Chapter',isDense:true),
              isExpanded:true,items:[
                for(var i=0;i<source.length;i++)DropdownMenuItem(
                  value:source[i]['id']?.toString(),
                  child:Text('${i+1}. ${source[i]['title']??'Chapter'}',
                    overflow:TextOverflow.ellipsis))
              ],onChanged:(value){
                final index=source.indexWhere((item)=>item['id']==value);
                if(index>=0)setChapter(index);
              })),
            IconButton(tooltip:'Add chapter',onPressed:addChapter,icon:const Icon(Icons.add_circle_outline)),
          ]),
          const SizedBox(height:12),
          if(wide)Row(crossAxisAlignment:CrossAxisAlignment.start,children:[
            SizedBox(width:215,child:Column(crossAxisAlignment:CrossAxisAlignment.stretch,children:[
              const Text('Lesson Pages',style:TextStyle(fontSize:16,fontWeight:FontWeight.w800)),
              Text('${pages.length} sections',style:const TextStyle(color:Color(0xFFA6BBD7))),
              const SizedBox(height:8),
              FilledButton.icon(onPressed:addSection,icon:const Icon(Icons.add),
                label:const Text('Add page')),
              const SizedBox(height:10),
              for(var i=0;i<pages.length;i++)Padding(
                padding:const EdgeInsets.only(bottom:8),child:navItem(pages[i],i)),
            ])),
            const SizedBox(width:13),
            Expanded(flex:4,child:contentPane(selected)),
            const SizedBox(width:13),
            SizedBox(width:270,child:inspectorPanel()),
          ])else ...[
            contentPane(selected),
            const SizedBox(height:9),
            SizedBox(height:75,child:ListView(scrollDirection:Axis.horizontal,children:[
              for(var i=0;i<pages.length;i++)Padding(
                padding:const EdgeInsets.only(right:8),child:navItem(pages[i],i,compact:true)),
            ])),
            const SizedBox(height:10),
            ExpansionTile(title:const Text('Page / Section Settings'),
              leading:const Icon(Icons.settings_outlined),
              children:[inspectorPanel()]),
          ],
          const SizedBox(height:9),
          SafeArea(top:false,child:Wrap(alignment:WrapAlignment.spaceBetween,
            spacing:7,runSpacing:8,children:[
              OutlinedButton.icon(onPressed:()=>addBlock('p'),
                icon:const Icon(Icons.add),label:const Text('Add Block')),
              OutlinedButton.icon(onPressed:()=>addBlock('blockquote'),
                icon:const Icon(Icons.format_quote),label:const Text('Scripture')),
              OutlinedButton.icon(onPressed:()=>addBlock('image'),
                icon:const Icon(Icons.image_outlined),label:const Text('Media')),
              OutlinedButton.icon(onPressed:()=>setState(()=>preview=!preview),
                icon:Icon(preview?Icons.edit_outlined:Icons.visibility_outlined),
                label:Text(preview?'Edit':'Preview')),
              FilledButton.icon(onPressed:widget.saving?null:widget.onSave,
                icon:const Icon(Icons.send_outlined),
                label:Text(widget.saving?'Saving…':'Update')),
            ])),
        ]),
      ),
    );
  }
  Widget contentPane(Map<String,dynamic>? selected){
    if(selected==null)return const Card(child:Padding(
      padding:EdgeInsets.all(24),child:Text('Select or add a section.')));
    return Column(crossAxisAlignment:CrossAxisAlignment.stretch,children:[
      cover(selected),const SizedBox(height:11),
      if(preview)Card(child:Padding(padding:const EdgeInsets.all(12),
        child:PlatePageView(page:selected)))
      else ...[
        if(document.isEmpty)Padding(padding:const EdgeInsets.all(12),
          child:OutlinedButton.icon(onPressed:widget.onAdvanced,
            icon:const Icon(Icons.edit_note),
            label:const Text('Open legacy or rich formatted content'))),
        for(var i=0;i<document.length;i++)blockCard(document[i],i),
      ],
    ]);
  }
}
