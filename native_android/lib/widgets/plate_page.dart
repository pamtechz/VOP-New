import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

typedef JsonObject = Map<String,dynamic>;
JsonObject plateMap(dynamic value) =>
    value is Map?Map<String,dynamic>.from(value):{};
List<JsonObject> plateRows(dynamic value) =>
    value is List?value.map(plateMap).toList():[];

Color? plateColor(dynamic value) {
  final text=value is String?value:'';
  if(!RegExp(r'^#[0-9a-fA-F]{6}$').hasMatch(text))return null;
  return Color(int.parse('FF'+text.substring(1),radix:16));
}
String plainNode(JsonObject node) {
  if(node['text'] is String)return node['text'] as String;
  return plateRows(node['children']).map(plainNode).join(' ');
}

class PlatePageView extends StatelessWidget {
  const PlatePageView({required this.page,super.key});
  final JsonObject page;

  @override Widget build(BuildContext context) {
    final doc=plateRows(page['document']);
    final legacy=plateRows(page['blocks']);
    return Column(crossAxisAlignment:CrossAxisAlignment.stretch,children:[
      if('${page['title']??''}'.isNotEmpty)
        Padding(padding:const EdgeInsets.only(bottom:14),
          child:Text('${page['title']}',
            style:Theme.of(context).textTheme.titleLarge?.copyWith(
              fontWeight:FontWeight.w800))),
      if(doc.isNotEmpty)...doc.map((node)=>Padding(
        padding:const EdgeInsets.only(bottom:11),child:_block(context,node)))
      else if(legacy.isNotEmpty)...legacy.map((node)=>Padding(
        padding:const EdgeInsets.only(bottom:11),child:_legacy(context,node)))
      else Text('${page['content']??''}',
        style:const TextStyle(fontSize:16,height:1.65)),
      if('${page['imageUrl']??''}'.startsWith('https://'))
        Padding(padding:const EdgeInsets.symmetric(vertical:12),
          child:ClipRRect(borderRadius:BorderRadius.circular(9),
            child:Image.network('${page['imageUrl']}',fit:BoxFit.contain,
              errorBuilder:(context,error,stack)=>const SizedBox.shrink()))),
    ]);
  }

  Widget _legacy(BuildContext context,JsonObject data){
    final type='${data['type']??'paragraph'}';
    if(type=='image')return _remoteImage('${data['src']??''}');
    if(type=='video'||type=='audio')return _mediaLink('${data['src']??''}',type);
    return Text('${data['text']??''}',style:TextStyle(
      fontSize:type=='heading'?22:16,
      fontWeight:type=='heading'?FontWeight.bold:null,
      fontStyle:type=='quote'?FontStyle.italic:null,
      height:1.6));
  }
  Widget _block(BuildContext context,JsonObject data){
    final type='${data['type']??'p'}';
    if(type=='table')return _PlateTable(node:data);
    if(type=='img')return _remoteImage('${data['url']??''}');
    if(type=='audio'||type=='video')return _mediaLink('${data['url']??''}',type);
    final style=TextStyle(
      color:plateColor(data['color']),
      fontSize:type=='h1'?26:type=='h2'?22:type=='h3'?19:16,
      fontWeight:['h1','h2','h3'].contains(type)?FontWeight.w800:null,
      fontStyle:type=='blockquote'?FontStyle.italic:null,
      height:1.65,
    );
    final text=Text.rich(TextSpan(
      children:_spans(plateRows(data['children']),style),
      style:style),textAlign:switch(data['align']){
        'center'=>TextAlign.center,'right'=>TextAlign.right,
        'justify'=>TextAlign.justify,_=>TextAlign.left,
      });
    if(type=='callout'||type=='blockquote')return Container(
      padding:const EdgeInsets.all(14),
      decoration:BoxDecoration(
        color:plateColor(data['backgroundColor'])
          ??Theme.of(context).colorScheme.primaryContainer.withValues(alpha:.40),
        border:Border(left:BorderSide(color:plateColor(data['borderColor'])
          ??Theme.of(context).colorScheme.primary,width:4)),
        borderRadius:BorderRadius.circular(5)),
      child:text);
    if(type=='ul'||type=='ol')return Column(
      crossAxisAlignment:CrossAxisAlignment.start,
      children:plateRows(data['children']).asMap().entries.map((entry)=>
        Padding(padding:const EdgeInsets.symmetric(vertical:3),
          child:Row(crossAxisAlignment:CrossAxisAlignment.start,children:[
            Text(type=='ul'?'•  ':'${entry.key+1}.  '),
            Expanded(child:_block(context,entry.value)),
          ]))).toList());
    if(type=='li'||type=='lic')return text;
    if(type=='a')return TextButton(
      onPressed:()=>_open('${data['url']??''}'),
      child:text);
    return text;
  }
  List<InlineSpan> _spans(List<JsonObject> nodes,TextStyle base)=>
    nodes.map<InlineSpan>((node){
      if(node['text'] is String){
        return TextSpan(text:node['text'],style:base.copyWith(
          color:plateColor(node['color']),
          backgroundColor:plateColor(node['backgroundColor']),
          fontWeight:node['bold']==true?FontWeight.bold:base.fontWeight,
          fontStyle:node['italic']==true?FontStyle.italic:base.fontStyle,
          decoration:node['underline']==true?TextDecoration.underline:
            node['strikethrough']==true?TextDecoration.lineThrough:null,
        ));
      }
      return TextSpan(children:_spans(plateRows(node['children']),base));
    }).toList();
  Widget _remoteImage(String value){
    if(!value.startsWith('https://'))return const SizedBox.shrink();
    return ClipRRect(borderRadius:BorderRadius.circular(8),
      child:Image.network(value,fit:BoxFit.contain,
        errorBuilder:(_,error,stack)=>const Text('Image unavailable.')));
  }
  Widget _mediaLink(String url,String type) => OutlinedButton.icon(
    onPressed:url.startsWith('https://')?()=>_open(url):null,
    icon:Icon(type=='audio'?Icons.headphones:Icons.play_circle_outline),
    label:Text(type=='audio'?'Play audio':'Open video'));
  Future<void> _open(String raw)async{
    final url=Uri.tryParse(raw);
    if(url==null||url.scheme!='https')return;
    await launchUrl(url,mode:LaunchMode.externalApplication);
  }
}

class _PlateTable extends StatelessWidget {
  const _PlateTable({required this.node});
  final JsonObject node;
  @override Widget build(BuildContext context){
    final rows=plateRows(node['children']);
    if(rows.isEmpty)return const SizedBox.shrink();
    final columns=plateRows(rows.first['children']).length;
    if(columns==0)return const SizedBox.shrink();
    final rawWidths=node['colWidths'] as List?;
    final widths=List<double>.generate(columns,(col){
      final value=rawWidths!=null&&col<rawWidths.length?rawWidths[col]:140;
      return (value is num?value.toDouble():140).clamp(64.0,640.0);
    });
    final heights=List<double>.generate(rows.length,(row){
      final value=rows[row]['rowHeight'];
      return (value is num?value.toDouble():72).clamp(48.0,480.0);
    });
    final totalWidth=widths.reduce((a,b)=>a+b);
    final totalHeight=heights.reduce((a,b)=>a+b);
    double sum(List<double> values,int end)=>
      values.take(math.min(end,values.length)).fold(0.0,(a,b)=>a+b);
    final cells=<Widget>[];
    for(var r=0;r<rows.length;r++){
      final row=plateRows(rows[r]['children']);
      for(var c=0;c<row.length;c++){
        final cell=row[c];
        if(cell['covered']==true)continue;
        final spanX=((cell['colSpan'] as num?)?.toInt()??1).clamp(1,columns-c);
        final spanY=((cell['rowSpan'] as num?)?.toInt()??1).clamp(1,rows.length-r);
        final isHeader=cell['type']=='th';
        final bg=plateColor(cell['backgroundColor'])
            ??(isHeader?Theme.of(context).colorScheme.primaryContainer:
              (node['tableStyle']=='banded'&&r.isOdd
                ?Theme.of(context).colorScheme.surfaceContainerHighest
                :Theme.of(context).colorScheme.surface));
        cells.add(Positioned(
          left:sum(widths,c),top:sum(heights,r),
          width:sum(widths,c+spanX)-sum(widths,c),
          height:sum(heights,r+spanY)-sum(heights,r),
          child:Container(
            padding:const EdgeInsets.all(8),
            decoration:BoxDecoration(
              color:bg,
              border:Border.all(color:plateColor(cell['borderColor'])
                ??Theme.of(context).dividerColor)),
            child:SingleChildScrollView(
              child:Text(plateRows(cell['children']).map(plainNode).join('\n'),
                textAlign:switch(cell['align']){
                  'center'=>TextAlign.center,'right'=>TextAlign.right,
                  _=>TextAlign.left,
                },
                style:TextStyle(fontWeight:isHeader?FontWeight.w700:null)),
            ),
          ),
        ));
      }
    }
    return SingleChildScrollView(scrollDirection:Axis.horizontal,
      child:SizedBox(width:totalWidth,height:totalHeight,
        child:Stack(children:cells)));
  }
}
