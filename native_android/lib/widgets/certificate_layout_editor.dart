import 'dart:convert';
import 'dart:math' as math;
import 'package:flutter/material.dart';
import '../core/config.dart';
import 'plate_page.dart';

class CertificateLayoutEditor extends StatefulWidget{
  const CertificateLayoutEditor({required this.value,required this.onChanged,this.background='',super.key});
  final Map<String,dynamic> value;
  final String background;
  final ValueChanged<Map<String,dynamic>> onChanged;
  @override State<CertificateLayoutEditor> createState()=>_CertificateLayoutState();
}
class _CertificateLayoutState extends State<CertificateLayoutEditor>{
  late Map<String,dynamic> value;
  int selected=-1;
  @override void initState(){super.initState();value=Map<String,dynamic>.from(jsonDecode(jsonEncode(widget.value)) as Map);}
  List<Map<String,dynamic>> get elements=>(value['elements'] as List? ?? []).map((v)=>v is Map<String,dynamic>?v:Map<String,dynamic>.from(v as Map)).toList();
  num number(dynamic v,num fallback)=>v is num?v:num.tryParse('$v')??fallback;
  void change(){setState((){});widget.onChanged(value);}
  Widget editNumber(Map<String,dynamic> map,String key,String label)=>TextFormField(key:ValueKey('$selected.$key'),initialValue:map[key]?.toString()??'',keyboardType:const TextInputType.numberWithOptions(decimal:true,signed:true),
    decoration:InputDecoration(labelText:label),validator:(v)=>(v??'').isNotEmpty&&num.tryParse(v!)==null?'Enter a number':null,onChanged:(v){final n=num.tryParse(v);if(n!=null){map[key]=n;change();}});
  Future<void> add()async{
    final type=await showModalBottomSheet<String>(context:context,builder:(ctx)=>SafeArea(child:ListView(shrinkWrap:true,children:[
      for(final entry in {'text':'Text','candidateName':'Learner name','courseName':'Course name','courseCode':'Course code','certificateNumber':'Certificate number','date':'Issue date','image':'Image','line':'Line'}.entries)
        ListTile(title:Text(entry.value),onTap:()=>Navigator.pop(ctx,entry.key))])));
    if(type==null)return;final rows=elements;rows.add({'id':DateTime.now().microsecondsSinceEpoch.toRadixString(36),'type':type,'x':10,'y':10,'width':35,'height':8,'visible':true});value['elements']=rows;selected=rows.length-1;change();
  }
  @override Widget build(BuildContext context){
    final rows=elements;value['elements']=rows;
    final width=number(value['width'],0).toDouble(),height=number(value['height'],0).toDouble();
    final background='${value['backgroundUrl']??widget.background}';
    final asset=Uri.tryParse(background);final url=asset==null?null:Uri.parse(VopConfig.apiUrl).resolveUri(asset);
    final current=selected>=0&&selected<rows.length?rows[selected]:null;
    return Column(crossAxisAlignment:CrossAxisAlignment.stretch,children:[
      Text('Certificate canvas',style:Theme.of(context).textTheme.titleMedium),
      Row(children:[Expanded(child:editNumber(value,'width','Canvas width')),const SizedBox(width:12),Expanded(child:editNumber(value,'height','Canvas height'))]),
      const SizedBox(height:12),
      if(width>0&&height>0)LayoutBuilder(builder:(context,c){final w=c.maxWidth;final h=w*height/width;
        return SizedBox(width:w,height:h,child:ColoredBox(color:Colors.white,child:Stack(clipBehavior:Clip.hardEdge,children:[
          if(url?.scheme=='https'&&background.isNotEmpty)Positioned.fill(child:Image.network('$url',fit:BoxFit.fill,errorBuilder:(_,__,___)=>const Center(child:Text('Background unavailable',style:TextStyle(color:Colors.black))))),
          for(final entry in rows.asMap().entries)if(entry.value['visible']!=false)
            Positioned(left:number(entry.value['x'],0)/100*w,top:number(entry.value['y'],0)/100*h,width:math.max(1.0,number(entry.value['width'],20)/100*w),height:math.max(1.0,number(entry.value['height'],5)/100*h),
              child:GestureDetector(onTap:()=>setState(()=>selected=entry.key),onPanUpdate:(delta){
                entry.value['x']=(number(entry.value['x'],0)+delta.delta.dx/w*100).clamp(0,100);entry.value['y']=(number(entry.value['y'],0)+delta.delta.dy/h*100).clamp(0,100);change();
              },child:DecoratedBox(decoration:BoxDecoration(border:Border.all(color:selected==entry.key?Theme.of(context).colorScheme.primary:Colors.transparent)),child:_element(entry.value,w/width)))),
        ])));}),
      if(width<=0||height<=0)const Padding(padding:EdgeInsets.all(12),child:Text('Enter the canvas dimensions to edit the layout.')),
      OutlinedButton.icon(onPressed:add,icon:const Icon(Icons.add),label:const Text('Add element')),
      if(current!=null)...[
        const Divider(),Text('Selected element: ${current['type']}'),
        if(current['type']=='text')TextFormField(key:ValueKey('$selected.text'),initialValue:'${current['text']??''}',maxLines:3,decoration:const InputDecoration(labelText:'Text'),onChanged:(v){current['text']=v;change();}),
        if(current['type']=='image')TextFormField(key:ValueKey('$selected.src'),initialValue:'${current['src']??''}',decoration:const InputDecoration(labelText:'Image URL'),onChanged:(v){current['src']=v;change();}),
        Wrap(spacing:12,runSpacing:8,children:[for(final entry in {'x':'Left (%)','y':'Top (%)','width':'Width (%)','height':'Height (%)','fontSize':'Font size','fontWeight':'Font weight','rotate':'Rotation','opacity':'Opacity'}.entries)
          SizedBox(width:150,child:editNumber(current,entry.key,entry.value))]),
        TextFormField(key:ValueKey('$selected.color'),initialValue:'${current['color']??''}',decoration:const InputDecoration(labelText:'Colour',hintText:'#RRGGBB'),validator:(v)=>(v??'').isNotEmpty&&plateColor(v)==null?'Use #RRGGBB':null,onChanged:(v){current['color']=v;change();}),
        DropdownButtonFormField<String>(key:ValueKey('$selected.align'),initialValue:'${current['textAlign']??'left'}',decoration:const InputDecoration(labelText:'Alignment'),items:const[DropdownMenuItem(value:'left',child:Text('Left')),DropdownMenuItem(value:'center',child:Text('Centre')),DropdownMenuItem(value:'right',child:Text('Right'))],onChanged:(v){current['textAlign']=v;change();}),
        TextButton.icon(onPressed:(){rows.removeAt(selected);value['elements']=rows;selected=-1;change();},icon:const Icon(Icons.delete_outline),label:const Text('Remove element')),
      ],
    ]);
  }
  Widget _element(Map<String,dynamic> element,double scale){
    final type='${element['type']}';final color=plateColor(element['color'])??Colors.black;
    Widget child;
    if(type=='line'){child=ColoredBox(color:color);}
    else if(type=='image'){
      final url=Uri.tryParse('${element['src']??''}');child=url?.scheme=='https'?Image.network('$url',fit:BoxFit.contain,errorBuilder:(_,__,___)=>const Icon(Icons.broken_image)):const Icon(Icons.image_outlined,color:Colors.black);
    }else{child=Text(type=='text'?'${element['text']??''}':{'candidateName':'Learner name','courseName':'Course name','courseCode':'Course code','date':'Issue date','certificateNumber':'Certificate number'}[type]??type,
      textAlign:element['textAlign']=='center'?TextAlign.center:element['textAlign']=='right'?TextAlign.right:TextAlign.left,
      style:TextStyle(color:color,fontSize:number(element['fontSize'],16).toDouble()*scale,fontWeight:number(element['fontWeight'],400)>=700?FontWeight.bold:FontWeight.normal));}
    return Opacity(opacity:number(element['opacity'],1).toDouble().clamp(0,1).toDouble(),child:Transform.rotate(angle:number(element['rotate'],0)*math.pi/180,child:child));
  }
}
