import 'dart:convert';
import 'package:flutter/material.dart';
import 'plate_page.dart';

/// Flutter text controller that displays each canonical Plate text run with
/// its own marks. Editing uses rebaseLeaves, so adjacent styled runs survive.
class PlateMarkedTextController extends TextEditingController {
  PlateMarkedTextController(List<Map<String,dynamic>> leaves)
      : marks=leaves, super(text:leaves.map((v)=>(v['text']??'').toString()).join());
  List<Map<String,dynamic>> marks;
  void syncRuns(List<Map<String,dynamic>> updated) {
    final next=updated.map((v)=>(v['text']??'').toString()).join();
    marks=updated;
    if(text!=next){
      value=TextEditingValue(text:next,
        selection:TextSelection.collapsed(offset:next.length));
    }else{
      notifyListeners();
    }
  }
  @override TextSpan buildTextSpan({
    required BuildContext context, TextStyle? style, required bool withComposing,
  }) {
    return TextSpan(style:style,children:[
      for(final leaf in marks) TextSpan(
        text:(leaf['text']??'').toString(),
        style:TextStyle(
          fontWeight:leaf['bold']==true?FontWeight.bold:FontWeight.normal,
          fontStyle:leaf['italic']==true?FontStyle.italic:FontStyle.normal,
          decoration:TextDecoration.combine([
            if(leaf['underline']==true)TextDecoration.underline,
            if(leaf['strikethrough']==true)TextDecoration.lineThrough,
          ]),
          color:plateColor(leaf['color']),
          fontFamily:leaf['fontFamily'] is String?leaf['fontFamily'] as String:null,
          fontSize:double.tryParse((leaf['fontSize']??'').toString().replaceAll('px','')),
        ),
      ),
    ]);
  }
}

class PlateDocumentEditor extends StatefulWidget {
  const PlateDocumentEditor({required this.document,required this.onChanged,this.inlineMode=false,super.key});
  final List<Map<String,dynamic>> document;
  final ValueChanged<List<Map<String,dynamic>>> onChanged;
  final bool inlineMode;
  @override State<PlateDocumentEditor> createState()=>PlateDocumentEditorState();
}
class PlateDocumentEditorState extends State<PlateDocumentEditor>{
  int activeBlockIndex=0;
  final Map<String,PlateMarkedTextController> inlineControllers={};
  @override void dispose(){
    for(final controller in inlineControllers.values)controller.dispose();
    super.dispose();
  }
  PlateMarkedTextController controllerFor(Map<String,dynamic> node,int index,
      List<Map<String,dynamic>> children) {
    final key=(node['id']??index).toString();
    final controller=inlineControllers.putIfAbsent(key,
      ()=>PlateMarkedTextController(children));
    if(jsonEncode(controller.marks)!=jsonEncode(children)){
      WidgetsBinding.instance.addPostFrameCallback((_){
        if(mounted)controller.syncRuns(children);
      });
    }
    return controller;
  }
  late List<Map<String,dynamic>> nodes;
  bool preview=false;
  int revision=0;
  int sequence=0;
  static const historyLimit=40;
  final List<String> undoHistory=[];
  final List<String> redoHistory=[];
  late String committedDocument;
  List<Map<String,dynamic>> decodeDocument(String raw)=>
    (jsonDecode(raw) as List).map((v)=>Map<String,dynamic>.from(v as Map)).toList();
  @override void initState(){
    super.initState();
    nodes=decodeDocument(jsonEncode(widget.document));
    committedDocument=jsonEncode(nodes);
  }
  void deliver(){widget.onChanged(decodeDocument(committedDocument));}
  void emit(){
    final next=jsonEncode(nodes);
    if(next==committedDocument)return;
    undoHistory.add(committedDocument);
    if(undoHistory.length>historyLimit)undoHistory.removeAt(0);
    redoHistory.clear();
    committedDocument=next;
    if(mounted)setState((){});
    deliver();
  }
  void changed(){setState((){});emit();}
  void undo(){
    if(undoHistory.isEmpty)return;
    redoHistory.add(committedDocument);
    committedDocument=undoHistory.removeLast();
    setState((){
      nodes=decodeDocument(committedDocument);
      revision++;
      preview=false;
    });
    deliver();
  }
  void redo(){
    if(redoHistory.isEmpty)return;
    undoHistory.add(committedDocument);
    committedDocument=redoHistory.removeLast();
    setState((){
      nodes=decodeDocument(committedDocument);
      revision++;
      preview=false;
    });
    deliver();
  }
  String id()=>DateTime.now().microsecondsSinceEpoch.toRadixString(36)+'-'+(++sequence).toString();
  Map<String,dynamic> block(String type){
    // Links are inline children of a paragraph in the shared Plate schema.
    // A top-level "a" node is rejected by normalizeStudyPlateDocument.
    if(type=='link')return {'type':'p','id':id(),'children':[
      {'type':'a','url':'','children':[{'text':'Link text'}]},
    ]};
    if(type=='table')return {'type':'table','id':id(),'children':List.generate(2,(_)=>{'type':'tr','children':List.generate(2,(_)=>{'type':'td','children':[{'type':'p','children':[{'text':''}]}]})})};
    if(type=='ul'||type=='ol')return {'type':type,'id':id(),'children':[{'type':'li','children':[{'type':'lic','children':[{'text':''}]}]}]};
    return {'type':type,'id':id(),'children':[{'text':''}]};
  }
  void insertBlock(String type){
    if(nodes.length>=50)return;
    nodes.add(block(type));
    revision++;
    changed();
  }
  void styleActiveBlock(String type){
    if(nodes.isEmpty)return;
    final index=activeBlockIndex.clamp(0,nodes.length-1).toInt();
    final node=nodes[index];
    if(!['p','h1','h2','h3','blockquote'].contains(node['type']))return;
    node['type']=type;
    changed();
  }
  bool patchSelectedLeaves(void Function(Map<String,dynamic>) patch) {
    if(!widget.inlineMode||nodes.isEmpty)return false;
    final index=activeBlockIndex.clamp(0,nodes.length-1).toInt();
    final node=nodes[index];
    final leaves=plateRows(node['children']);
    if(leaves.isEmpty||leaves.any((leaf)=>leaf['text'] is! String))return false;
    final key=(node['id']??index).toString();
    final selection=inlineControllers[key]?.selection;
    if(selection==null||!selection.isValid||selection.isCollapsed)return false;
    final start=selection.start,end=selection.end;
    final total=leaves.map((leaf)=>(leaf['text'] as String).length)
      .fold<int>(0,(sum,length)=>sum+length);
    if(start<0||end>total)return false;
    final output=<Map<String,dynamic>>[];
    var offset=0;
    for(final leaf in leaves){
      final raw=leaf['text'] as String;
      final begin=offset,finish=offset+raw.length;
      final a=(start-begin).clamp(0,raw.length).toInt();
      final b=(end-begin).clamp(0,raw.length).toInt();
      if(a>=b){
        output.add({...leaf});
      }else{
        if(a>0)output.add({...leaf,'text':raw.substring(0,a)});
        final selected={...leaf,'text':raw.substring(a,b)};
        patch(selected);
        output.add(selected);
        if(b<raw.length)output.add({...leaf,'text':raw.substring(b)});
      }
      offset=finish;
    }
    node['children']=output;
    changed();
    return true;
  }
  void markActiveBlock(String mark){
    if(nodes.isEmpty)return;
    final index=activeBlockIndex.clamp(0,nodes.length-1).toInt();
    final node=nodes[index];
    if(!['p','h1','h2','h3','blockquote'].contains(node['type']))return;
    if(patchSelectedLeaves((leaf){
      if(leaf[mark]==true)leaf.remove(mark);else leaf[mark]=true;
    }))return;
    void toggle(dynamic item,bool state){
      if(item is! Map)return;
      if(item['text'] is String){
        if(state)item.remove(mark);else item[mark]=true;
      }
      if(item['children'] is List){
        for(final child in item['children'])toggle(child,state);
      }
    }
    bool marked(dynamic item){
      if(item is! Map)return false;
      if(item['text'] is String)return item[mark]==true;
      if(item['children'] is List){
        return (item['children'] as List).any(marked);
      }
      return false;
    }
    toggle(node,marked(node));
    changed();
  }

  /// Ribbon commands target the focused paragraph. Mark commands preserve the
  /// existing Plate leaf structure rather than flattening it into plain text.
  void forActiveLeaf(void Function(Map<String,dynamic>) patch) {
    if(nodes.isEmpty)return;
    if(patchSelectedLeaves(patch))return;
    final node=nodes[activeBlockIndex.clamp(0,nodes.length-1).toInt()];
    void visit(dynamic value){
      if(value is! Map)return;
      if(value['text'] is String)patch(value.cast<String,dynamic>());
      if(value['children'] is List)for(final child in value['children']){visit(child);}
    }
    visit(node);
    changed();
  }
  void setActiveFontSize(double size)=>forActiveLeaf((leaf)=>
    leaf['fontSize']=size.toInt().toString()+'px');
  void setActiveFontFamily(String family)=>forActiveLeaf((leaf)=>
    leaf['fontFamily']=family);
  void setActiveColor(String color)=>forActiveLeaf((leaf)=>leaf['color']=color);
  void setActiveAlignment(String align){
    if(!['left','right','center','justify'].contains(align)||nodes.isEmpty)return;
    nodes[activeBlockIndex.clamp(0,nodes.length-1).toInt()]['align']=align;
    changed();
  }
  void setActiveIndent(int direction){
    if(nodes.isEmpty)return;
    final node=nodes[activeBlockIndex.clamp(0,nodes.length-1).toInt()];
    final old=(node['indent'] is num?(node['indent'] as num).toInt():0);
    node['indent']=(old+direction).clamp(0,8);
    changed();
  }
  void duplicateActiveBlock(){
    if(nodes.length>=50||nodes.isEmpty)return;
    final i=activeBlockIndex.clamp(0,nodes.length-1).toInt();
    final copy=jsonDecode(jsonEncode(nodes[i])) as Map<String,dynamic>;
    copy['id']=id();
    nodes.insert(i+1,copy);
    activeBlockIndex=i+1;
    revision++;
    changed();
  }
  void removeActiveBlock(){
    if(nodes.length<2)return;
    nodes.removeAt(activeBlockIndex.clamp(0,nodes.length-1).toInt());
    activeBlockIndex=activeBlockIndex.clamp(0,nodes.length-1).toInt();
    revision++;
    changed();
  }

  // Preserve unedited text runs and their bold/italic/underline/scripture
  // metadata while applying an insertion, deletion, or replacement.
  List<Map<String,dynamic>> rebaseLeaves(List<Map<String,dynamic>> original,String next){
    final old=original.map((item)=>(item['text']??'').toString()).join();
    if(old==next)return original;
    var prefix=0;
    while(prefix<old.length&&prefix<next.length&&old[prefix]==next[prefix]){prefix++;}
    var suffix=0;
    while(suffix<old.length-prefix&&suffix<next.length-prefix&&
      old[old.length-1-suffix]==next[next.length-1-suffix]){suffix++;}
    final left=<Map<String,dynamic>>[],right=<Map<String,dynamic>>[];
    var cursor=0;
    for(final leaf in original){
      final text=(leaf['text']??'').toString();
      final start=cursor,end=start+text.length;
      final keptLeft=(prefix-start).clamp(0,text.length).toInt();
      final suffixStart=old.length-suffix;
      final keptRight=(end-suffixStart).clamp(0,text.length).toInt();
      if(keptLeft>0)left.add({...leaf,'text':text.substring(0,keptLeft)});
      if(keptRight>0)right.add({...leaf,'text':text.substring(text.length-keptRight)});
      cursor=end;
    }
    final added=next.substring(prefix,next.length-suffix);
    final fallback=left.isNotEmpty?left.last:(right.isNotEmpty?right.first:
      (original.isNotEmpty?original.first:<String,dynamic>{'text':''}));
    final attributes={...fallback}..remove('text');
    final output=<Map<String,dynamic>>[...left,
      if(added.isNotEmpty){...attributes,'text':added},...right];
    return output.isEmpty?<Map<String,dynamic>>[{'text':''}]:output;
  }

  Widget inlineDocument()=>Column(crossAxisAlignment:CrossAxisAlignment.stretch,children:[
    for(final entry in nodes.asMap().entries)
      _inlineNode(entry.key,entry.value),
  ]);
  Widget _inlineNode(int index,Map<String,dynamic> node){
    final type=(node['type']??'p').toString();
    final children=plateRows(node['children']);
    final pureText=children.every((item)=>item['text'] is String);
    if(!['p','h1','h2','h3','blockquote'].contains(type)||!pureText){
      return Container(margin:const EdgeInsets.symmetric(vertical:7),
        decoration:BoxDecoration(border:Border.all(color:const Color(0xFFDDE7F2)),
          borderRadius:BorderRadius.circular(8)),
        child:Column(crossAxisAlignment:CrossAxisAlignment.stretch,children:[
          PlatePageView(page:{'document':[node]}),
          Align(alignment:Alignment.centerRight,child:TextButton.icon(
            onPressed:()=>_editComplexBlock(index),
            icon:const Icon(Icons.edit_outlined,size:16),
            label:const Text('Edit '+ 'block'))),
        ]));
    }
    final primary=children.isEmpty?<String,dynamic>{'text':''}:children.first;
    final controller=controllerFor(node,index,children);
    final typeSize=type=='h1'?26.0:type=='h2'?22.0:type=='h3'?19.0:16.0;
    final fontSize=double.tryParse((primary['fontSize']??'').toString().replaceAll('px',''))??typeSize;
    final color=plateColor(primary['color'])??const Color(0xFF183B65);
    final align=switch(node['align']){
      'center'=>TextAlign.center,'right'=>TextAlign.right,
      'justify'=>TextAlign.justify,_=>TextAlign.left
    };
    return Padding(padding:EdgeInsets.only(left:((node['indent'] is num)?(node['indent'] as num).toDouble():0)*20,
      bottom:type=='p'?12:18),child:TextFormField(
        key:ValueKey('inline.'+(node['id']??index).toString()+'.'+revision.toString()),
        controller:controller,
        minLines:1,maxLines:null,
        style:TextStyle(color:color,fontSize:fontSize,
          fontWeight:primary['bold']==true||type.startsWith('h')?FontWeight.bold:null,
          fontStyle:primary['italic']==true||type=='blockquote'?FontStyle.italic:null,
          decoration:primary['underline']==true?TextDecoration.underline:null,
          height:1.55),
        textAlign:align,
        decoration:const InputDecoration(isDense:true,filled:false,
          hintText:'Type lesson content…',border:InputBorder.none,
          focusedBorder:InputBorder.none,
          contentPadding:EdgeInsets.symmetric(horizontal:0,vertical:2)),
        onTap:()=>activeBlockIndex=index,
        onChanged:(next){
          activeBlockIndex=index;
          final updated=rebaseLeaves(plateRows(node['children']),next);
          node['children']=updated;
          controller.syncRuns(updated);
          emit();
        },
      ));
  }
  Future<void> _editComplexBlock(int index)async{
    if(index<0||index>=nodes.length)return;
    activeBlockIndex=index;
    await showDialog<void>(context:context,builder:(ctx)=>AlertDialog(
      title:Text('Edit '+_label((nodes[index]['type']??'').toString())),
      content:SizedBox(width:650,height:420,child:SingleChildScrollView(
        child:_node(nodes[index],'inline-complex-'+index.toString()))),
      actions:[TextButton(onPressed:()=>Navigator.pop(ctx),child:const Text('Done'))],
    ));
  }

  Future<void> add()async{
    final type=await showModalBottomSheet<String>(context:context,builder:(ctx)=>SafeArea(child:ListView(shrinkWrap:true,children:[
      for(final entry in {'p':'Paragraph','h1':'Heading 1','h2':'Heading 2','h3':'Heading 3','blockquote':'Quotation','callout':'Callout','ul':'Bullet list','ol':'Numbered list','table':'Table','img':'Image','video':'Video','audio':'Audio','code_block':'Code block','link':'Link'}.entries)
        ListTile(title:Text(entry.value),onTap:()=>Navigator.pop(ctx,entry.key))])));
    if(type!=null)insertBlock(type);
  }
  @override Widget build(BuildContext context)=>widget.inlineMode?inlineDocument():Column(crossAxisAlignment:CrossAxisAlignment.stretch,children:[
    Row(children:[const Expanded(child:Text('Section content',style:TextStyle(fontWeight:FontWeight.w700))),
      IconButton(tooltip:'Undo',onPressed:undoHistory.isEmpty?null:undo,
        icon:const Icon(Icons.undo)),
      IconButton(tooltip:'Redo',onPressed:redoHistory.isEmpty?null:redo,
        icon:const Icon(Icons.redo)),
      IconButton(tooltip:preview?'Edit':'Preview',
        onPressed:()=>setState(()=>preview=!preview),
        icon:Icon(preview?Icons.edit_outlined:Icons.visibility_outlined))]),
    if(preview)PlatePageView(page:{'document':nodes})else ...nodes.asMap().entries.map((entry)=>GestureDetector(
      onTap:()=>setState(()=>activeBlockIndex=entry.key),
      child:Card(
      color:activeBlockIndex==entry.key?const Color(0xFFF0F6FF):null,
      key:ValueKey('${entry.value['id']??entry.key}.$revision'),child:Padding(padding:const EdgeInsets.all(12),child:Column(children:[
      Row(children:[Expanded(child:Text(_label('${entry.value['type']}'))),
        IconButton(tooltip:'Move up',onPressed:entry.key==0?null:(){final value=nodes.removeAt(entry.key);nodes.insert(entry.key-1,value);revision++;changed();},icon:const Icon(Icons.arrow_upward)),
        IconButton(tooltip:'Move down',onPressed:entry.key==nodes.length-1?null:(){final value=nodes.removeAt(entry.key);nodes.insert(entry.key+1,value);revision++;changed();},icon:const Icon(Icons.arrow_downward)),
        IconButton(tooltip:'Remove block',onPressed:nodes.length<=1?null:(){nodes.removeAt(entry.key);revision++;changed();},icon:const Icon(Icons.delete_outline))]),
      _node(entry.value,'${entry.key}'),
    ]))))),
    if(!preview)OutlinedButton.icon(onPressed:add,icon:const Icon(Icons.add),label:const Text('Add content block')),
  ]);
  String _label(String type)=>{'p':'Paragraph','h1':'Heading 1','h2':'Heading 2','h3':'Heading 3','blockquote':'Quotation','callout':'Callout','ul':'Bullet list','ol':'Numbered list','table':'Table','img':'Image','video':'Video','audio':'Audio','code_block':'Code block','a':'Link'}[type]??type;
  Widget _node(Map<String,dynamic> node,String path){
    if(node.containsKey('text'))return Column(crossAxisAlignment:CrossAxisAlignment.stretch,children:[
      Wrap(spacing:3,children:[
        for(final entry in {'bold':Icons.format_bold,'italic':Icons.format_italic,'underline':Icons.format_underlined,'strikethrough':Icons.format_strikethrough,'code':Icons.code,'superscript':Icons.superscript,'subscript':Icons.subscript}.entries)
          IconButton(tooltip:entry.key,isSelected:node[entry.key]==true,icon:Icon(entry.value),onPressed:(){node[entry.key]==true?node.remove(entry.key):node[entry.key]=true;changed();}),
      ]),
      TextFormField(key:ValueKey('leaf.$path.$revision'),initialValue:'${node['text']??''}',minLines:1,maxLines:8,
        style:TextStyle(fontWeight:node['bold']==true?FontWeight.bold:null,fontStyle:node['italic']==true?FontStyle.italic:null),
        decoration:const InputDecoration(labelText:'Text'),onChanged:(value){node['text']=value;emit();}),
      Row(children:[Expanded(child:TextFormField(key:ValueKey('color.$path.$revision'),initialValue:'${node['color']??''}',decoration:const InputDecoration(labelText:'Text colour',hintText:'#RRGGBB'),
        validator:(v)=>(v??'').isNotEmpty&&!RegExp(r'^#[0-9A-Fa-f]{6}$').hasMatch(v!)?'Use #RRGGBB':null,
        onChanged:(v){v.isEmpty?node.remove('color'):node['color']=v;emit();})),const SizedBox(width:12),
        Expanded(child:TextFormField(key:ValueKey('size.$path.$revision'),initialValue:'${node['fontSize']??''}',decoration:const InputDecoration(labelText:'Font size'),
          onChanged:(v){v.isEmpty?node.remove('fontSize'):node['fontSize']=v;emit();})),]),
    ]);
    final children=(node['children'] as List? ?? []).map((v)=>v is Map<String,dynamic>?v:Map<String,dynamic>.from(v as Map)).toList();
    node['children']=children;
    final type='${node['type']}';
    if(['img','video','audio','a'].contains(type))return Column(children:[
      TextFormField(key:ValueKey('url.$path.$revision'),initialValue:'${node['url']??''}',decoration:const InputDecoration(labelText:'Public HTTPS URL'),
        validator:(v)=>Uri.tryParse(v??'')?.scheme=='https'?null:'Enter a public HTTPS URL',onChanged:(v){node['url']=v;emit();}),
      if(type=='img')TextFormField(initialValue:'${node['alt']??''}',decoration:const InputDecoration(labelText:'Image description'),onChanged:(v){node['alt']=v;emit();}),
      if(type=='a')...children.asMap().entries.map((e)=>_node(e.value,'$path.${e.key}')),
    ]);
    if(type=='table')return Column(children:[
      SingleChildScrollView(scrollDirection:Axis.horizontal,child:Column(children:children.asMap().entries.map((row)=>Row(crossAxisAlignment:CrossAxisAlignment.start,children:
        ((row.value['children'] as List? ?? []).asMap().entries.map((cell)=>SizedBox(width:220,child:Padding(padding:const EdgeInsets.all(8),child:_node(cell.value is Map<String,dynamic>?cell.value:Map<String,dynamic>.from(cell.value as Map),'$path.${row.key}.${cell.key}'))))).toList())).toList())),
      Wrap(children:[TextButton.icon(onPressed:(){final width=children.isEmpty?2:((children.first['children'] as List?)?.length??2);children.add({'type':'tr','children':List.generate(width,(_)=>{'type':'td','children':[{'type':'p','children':[{'text':''}]}]})});revision++;changed();},icon:const Icon(Icons.add),label:const Text('Add row')),
        TextButton.icon(onPressed:(){for(final row in children){(row['children'] as List).add({'type':'td','children':[{'type':'p','children':[{'text':''}]}]});}revision++;changed();},icon:const Icon(Icons.add),label:const Text('Add column'))]),
    ]);
    return Column(crossAxisAlignment:CrossAxisAlignment.stretch,children:[
      if(['p','h1','h2','h3','blockquote','callout'].contains(type))DropdownButtonFormField<String>(initialValue:'${node['align']??'left'}',decoration:const InputDecoration(labelText:'Alignment'),items:const[
        DropdownMenuItem(value:'left',child:Text('Left')),DropdownMenuItem(value:'center',child:Text('Centre')),DropdownMenuItem(value:'right',child:Text('Right')),DropdownMenuItem(value:'justify',child:Text('Justify'))],onChanged:(v){node['align']=v;changed();}),
      ...children.asMap().entries.map((entry)=>Padding(padding:const EdgeInsets.only(top:8),child:_node(entry.value,'$path.${entry.key}'))),
      if(type=='ul'||type=='ol')TextButton.icon(onPressed:(){children.add({'type':'li','children':[{'type':'lic','children':[{'text':''}]}]});revision++;changed();},icon:const Icon(Icons.add),label:const Text('Add list item')),
      if(['p','h1','h2','h3','blockquote','lic','td','th'].contains(type))TextButton.icon(onPressed:(){children.add({'text':''});revision++;changed();},icon:const Icon(Icons.add),label:const Text('Add text run')),
    ]);
  }
}
