import 'dart:convert';
import 'package:flutter/material.dart';
import 'plate_page.dart';

class PlateDocumentEditor extends StatefulWidget {
  const PlateDocumentEditor({required this.document,required this.onChanged,super.key});
  final List<Map<String,dynamic>> document;
  final ValueChanged<List<Map<String,dynamic>>> onChanged;
  @override State<PlateDocumentEditor> createState()=>_PlateDocumentEditorState();
}
class _PlateDocumentEditorState extends State<PlateDocumentEditor>{
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
  Future<void> add()async{
    final type=await showModalBottomSheet<String>(context:context,builder:(ctx)=>SafeArea(child:ListView(shrinkWrap:true,children:[
      for(final entry in {'p':'Paragraph','h1':'Heading 1','h2':'Heading 2','h3':'Heading 3','blockquote':'Quotation','callout':'Callout','ul':'Bullet list','ol':'Numbered list','table':'Table','img':'Image','video':'Video','audio':'Audio','code_block':'Code block','link':'Link'}.entries)
        ListTile(title:Text(entry.value),onTap:()=>Navigator.pop(ctx,entry.key))])));
    if(type!=null){nodes.add(block(type));changed();}
  }
  @override Widget build(BuildContext context)=>Column(crossAxisAlignment:CrossAxisAlignment.stretch,children:[
    Row(children:[const Expanded(child:Text('Section content',style:TextStyle(fontWeight:FontWeight.w700))),
      IconButton(tooltip:'Undo',onPressed:undoHistory.isEmpty?null:undo,
        icon:const Icon(Icons.undo)),
      IconButton(tooltip:'Redo',onPressed:redoHistory.isEmpty?null:redo,
        icon:const Icon(Icons.redo)),
      IconButton(tooltip:preview?'Edit':'Preview',
        onPressed:()=>setState(()=>preview=!preview),
        icon:Icon(preview?Icons.edit_outlined:Icons.visibility_outlined))]),
    if(preview)PlatePageView(page:{'document':nodes})else ...nodes.asMap().entries.map((entry)=>Card(key:ValueKey('${entry.value['id']??entry.key}.$revision'),child:Padding(padding:const EdgeInsets.all(12),child:Column(children:[
      Row(children:[Expanded(child:Text(_label('${entry.value['type']}'))),
        IconButton(tooltip:'Move up',onPressed:entry.key==0?null:(){final value=nodes.removeAt(entry.key);nodes.insert(entry.key-1,value);revision++;changed();},icon:const Icon(Icons.arrow_upward)),
        IconButton(tooltip:'Move down',onPressed:entry.key==nodes.length-1?null:(){final value=nodes.removeAt(entry.key);nodes.insert(entry.key+1,value);revision++;changed();},icon:const Icon(Icons.arrow_downward)),
        IconButton(tooltip:'Remove block',onPressed:nodes.length<=1?null:(){nodes.removeAt(entry.key);revision++;changed();},icon:const Icon(Icons.delete_outline))]),
      _node(entry.value,'${entry.key}'),
    ])))),
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
