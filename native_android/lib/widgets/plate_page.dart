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
  return Color(int.parse('FF${text.substring(1)}',radix:16));
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
    final scripture = page['scriptureQuote'] is Map ? plateMap(page['scriptureQuote']) : null;
    final takeaway = '${page['keyTakeaway'] ?? ''}'.trim();
    final scriptureText = '${scripture?['text'] ?? ''}'.trim();
    final scriptureRef = '${scripture?['reference'] ?? ''}'.trim();
    final pageVideoUrl = '${page['videoUrl'] ?? ''}'.trim();
    final pageAudioUrl = '${page['audioUrl'] ?? ''}'.trim();

    return Column(crossAxisAlignment:CrossAxisAlignment.stretch,children:[
      if('${page['title']??''}'.isNotEmpty)
        Padding(padding:const EdgeInsets.only(bottom:16),
          child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
            Container(
              padding:const EdgeInsets.symmetric(horizontal:10,vertical:4),
              margin:const EdgeInsets.only(bottom:8),
              decoration:BoxDecoration(
                color:Theme.of(context).colorScheme.primary.withValues(alpha: 0.1),
                borderRadius:BorderRadius.circular(6)),
              child:Text('STUDY SECTION',style:TextStyle(
                fontSize:10.5,fontWeight:FontWeight.w800,letterSpacing:0.5,
                color:Theme.of(context).colorScheme.primary))),
            Text('${page['title']}',
              style:Theme.of(context).textTheme.headlineSmall?.copyWith(
                fontWeight:FontWeight.w800,letterSpacing:-0.3)),
            const SizedBox(height:6),
            Divider(color:Theme.of(context).colorScheme.outlineVariant.withValues(alpha: 0.5)),
          ])),
      if(pageVideoUrl.startsWith('https://'))
        Padding(padding:const EdgeInsets.only(bottom:12),
          child:_mediaLink(context, pageVideoUrl, 'video')),
      if(pageAudioUrl.startsWith('https://'))
        Padding(padding:const EdgeInsets.only(bottom:12),
          child:_mediaLink(context, pageAudioUrl, 'audio')),
      if(scriptureText.isNotEmpty)
        Padding(
          padding: const EdgeInsets.only(bottom: 14),
          child: Container(
            decoration: BoxDecoration(
              color: Theme.of(context).brightness == Brightness.dark
                ? const Color(0xFF261C0E)
                : const Color(0xFFFEFCE8),
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: const Color(0xFFD97706).withValues(alpha: 0.35)),
              boxShadow: [
                BoxShadow(
                  color: const Color(0xFFD97706).withValues(alpha: 0.08),
                  blurRadius: 12,
                  offset: const Offset(0, 3),
                ),
              ],
            ),
            padding: const EdgeInsets.all(18),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: const Color(0xFFD97706).withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: const Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.auto_stories_rounded, size: 13, color: Color(0xFFD97706)),
                      SizedBox(width: 5),
                      Text(
                        'HOLY SCRIPTURE',
                        style: TextStyle(
                          fontSize: 10.5,
                          fontWeight: FontWeight.w900,
                          letterSpacing: 0.6,
                          color: Color(0xFFB45309),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 12),
                Text(
                  '“$scriptureText”',
                  style: const TextStyle(
                    fontSize: 16.5,
                    fontStyle: FontStyle.italic,
                    height: 1.6,
                    fontWeight: FontWeight.w500,
                    fontFamily: 'serif',
                  ),
                ),
                const SizedBox(height: 14),
                Row(
                  children: [
                    InkWell(
                      borderRadius: BorderRadius.circular(8),
                      onTap: () => _showScriptureModal(context, scriptureText, scriptureRef),
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                        decoration: BoxDecoration(
                          color: const Color(0xFFD97706).withValues(alpha: 0.12),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: const Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(Icons.menu_book_rounded, size: 14, color: Color(0xFFB45309)),
                            SizedBox(width: 5),
                            Text(
                              'Explore Passage Details',
                              style: TextStyle(
                                fontSize: 11.5,
                                fontWeight: FontWeight.w800,
                                color: Color(0xFF92400E),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                    const Spacer(),
                    if (scriptureRef.isNotEmpty)
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                        decoration: BoxDecoration(
                          color: const Color(0xFFD97706).withValues(alpha: 0.12),
                          borderRadius: BorderRadius.circular(20),
                        ),
                        child: Text(
                          '— $scriptureRef',
                          style: const TextStyle(
                            fontSize: 12.5,
                            fontWeight: FontWeight.w800,
                            color: Color(0xFF92400E),
                          ),
                        ),
                      ),
                  ],
                ),
              ],
            ),
          ),
        ),
      if(doc.isNotEmpty)...doc.map((node)=>Padding(
        padding:const EdgeInsets.only(bottom:12),child:_block(context,node)))
      else if(legacy.isNotEmpty)...legacy.map((node)=>Padding(
        padding:const EdgeInsets.only(bottom:12),child:_legacy(context,node)))
      else Text('${page['content']??''}',
        style:const TextStyle(fontSize:16,height:1.7)),
      if(takeaway.isNotEmpty)
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 10),
          child: Container(
            decoration: BoxDecoration(
              color: Theme.of(context).brightness == Brightness.dark
                ? const Color(0xFF1E293B)
                : const Color(0xFFEFF6FF),
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: const Color(0xFF3B82F6).withValues(alpha: 0.3)),
            ),
            padding: const EdgeInsets.all(16),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  padding: const EdgeInsets.all(6),
                  decoration: BoxDecoration(
                    color: const Color(0xFF3B82F6).withValues(alpha: 0.15),
                    shape: BoxShape.circle,
                  ),
                  child: const Icon(Icons.lightbulb_outline_rounded, size: 18, color: Color(0xFF2563EB)),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'KEY TAKEAWAY',
                        style: TextStyle(
                          fontSize: 10.5,
                          fontWeight: FontWeight.w900,
                          letterSpacing: 0.6,
                          color: Color(0xFF2563EB),
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        takeaway,
                        style: const TextStyle(
                          fontSize: 14.5,
                          fontWeight: FontWeight.w600,
                          height: 1.45,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      if('${page['imageUrl']??''}'.startsWith('https://'))
        Padding(padding:const EdgeInsets.symmetric(vertical:12),
          child:Container(
            decoration:BoxDecoration(
              borderRadius:BorderRadius.circular(14),
              boxShadow:[BoxShadow(color:Colors.black.withValues(alpha: 0.08),blurRadius:12,offset:const Offset(0,4))]),
            child:ClipRRect(borderRadius:BorderRadius.circular(14),
              child:Image.network('${page['imageUrl']}',fit:BoxFit.contain,
                errorBuilder:(context,error,stack)=>const SizedBox.shrink())))),
    ]);
  }

  Widget _legacy(BuildContext context,JsonObject data){
    final type='${data['type']??'paragraph'}';
    if(type=='image')return _remoteImage('${data['src']??''}');
    if(type=='video'||type=='audio')return _mediaLink(context,'${data['src']??''}',type);
    return Text('${data['text']??''}',style:TextStyle(
      fontSize:type=='heading'?22:16,
      fontWeight:type=='heading'?FontWeight.bold:null,
      fontStyle:type=='quote'?FontStyle.italic:null,
      height:1.65));
  }
  Widget _block(BuildContext context,JsonObject data){
    final type='${data['type']??'p'}';
    if(type=='table')return _PlateTable(node:data);
    if(type=='img')return _remoteImage('${data['url']??''}');
    if(type=='audio'||type=='video')return _mediaLink(context,'${data['url']??''}',type);
    final style=TextStyle(
      color:plateColor(data['color']),
      fontSize:type=='h1'?25:type=='h2'?21:type=='h3'?18:16,
      fontWeight:['h1','h2','h3'].contains(type)?FontWeight.w800:null,
      fontStyle:type=='blockquote'?FontStyle.italic:null,
      height:1.68,
    );
    final text=Text.rich(TextSpan(
      children:_spans(plateRows(data['children']),style),
      style:style),textAlign:switch(data['align']){
        'center'=>TextAlign.center,'right'=>TextAlign.right,
        'justify'=>TextAlign.justify,_=>TextAlign.left,
      });
    if (type == 'callout' || type == 'blockquote') {
      final isQuote = type == 'blockquote';
      final isDark = Theme.of(context).brightness == Brightness.dark;
      return Container(
        margin:const EdgeInsets.symmetric(vertical:8),
        padding:const EdgeInsets.all(16),
        decoration:BoxDecoration(
          color:plateColor(data['backgroundColor'])
            ?? (isQuote
              ? (isDark ? const Color(0xFF261C0E) : const Color(0xFFFEFCE8))
              : Theme.of(context).colorScheme.primaryContainer.withValues(alpha: 0.35)),
          border:Border(left:BorderSide(
            color:plateColor(data['borderColor'])
              ?? (isQuote ? const Color(0xFFD97706) : Theme.of(context).colorScheme.primary),
            width:4.5)),
          borderRadius:const BorderRadius.only(
            topRight:Radius.circular(12),bottomRight:Radius.circular(12))),
        child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
          if(isQuote)
            Padding(padding:const EdgeInsets.only(bottom:6),
              child:Row(children:const [
                Icon(Icons.format_quote_rounded,size:18,color:Color(0xFFD97706)),
                SizedBox(width:4),
                Text('HOLY SCRIPTURE',style:TextStyle(
                  fontSize:10.5,fontWeight:FontWeight.w800,color:Color(0xFF92400E),letterSpacing:0.5)),
              ])),
          text,
        ]));
    }
    if (type == 'ul' || type == 'ol') {
      return Column(
        crossAxisAlignment:CrossAxisAlignment.start,
        children:plateRows(data['children']).asMap().entries.map((entry)=>
          Padding(padding:const EdgeInsets.symmetric(vertical:3),
            child:Row(crossAxisAlignment:CrossAxisAlignment.start,children:[
              Text(type=='ul'?'•  ':'${entry.key+1}.  '),
              Expanded(child:_block(context,entry.value)),
            ]))).toList());
    }
    if (type == 'li' || type == 'lic') {
      return text;
    }
    if (type == 'a') {
      return TextButton(
        onPressed:()=>_open('${data['url']??''}'),
        child:text);
    }
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
  Widget _mediaLink(BuildContext context, String url, String type) {
    final isAudio = type == 'audio';
    final isValid = url.startsWith('https://');
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final color = isAudio ? const Color(0xFF2563EB) : const Color(0xFFDC2626);
    final bg = isAudio
      ? (isDark ? const Color(0xFF1E293B) : const Color(0xFFEFF6FF))
      : (isDark ? const Color(0xFF3B1818) : const Color(0xFFFEF2F2));

    return Container(
      margin: const EdgeInsets.symmetric(vertical: 8),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: color.withValues(alpha: 0.3)),
        boxShadow: [
          BoxShadow(
            color: color.withValues(alpha: 0.06),
            blurRadius: 10,
            offset: const Offset(0, 3),
          ),
        ],
      ),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          borderRadius: BorderRadius.circular(16),
          onTap: isValid ? () => _open(url) : null,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
            child: Row(
              children: [
                Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(
                    color: color.withValues(alpha: 0.15),
                    shape: BoxShape.circle,
                  ),
                  child: Icon(
                    isAudio ? Icons.headphones_rounded : Icons.play_arrow_rounded,
                    color: color,
                    size: 24,
                  ),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                        decoration: BoxDecoration(
                          color: color.withValues(alpha: 0.15),
                          borderRadius: BorderRadius.circular(5),
                        ),
                        child: Text(
                          isAudio ? 'LESSON AUDIO' : 'LESSON VIDEO',
                          style: TextStyle(
                            fontSize: 10,
                            fontWeight: FontWeight.w900,
                            letterSpacing: 0.5,
                            color: color,
                          ),
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        isAudio ? 'Tap to listen to lesson audio' : 'Tap to watch video lesson',
                        style: const TextStyle(
                          fontSize: 13.5,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ],
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                  decoration: BoxDecoration(
                    color: color,
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        isAudio ? 'Listen' : 'Watch',
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 12,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                      const SizedBox(width: 4),
                      const Icon(Icons.open_in_new_rounded, size: 13, color: Colors.white),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  void _showScriptureModal(BuildContext context, String text, String reference) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (sheetContext) {
        final isDark = Theme.of(sheetContext).brightness == Brightness.dark;
        return Container(
          decoration: BoxDecoration(
            color: isDark ? const Color(0xFF1E293B) : Colors.white,
            borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.25),
                blurRadius: 20,
                offset: const Offset(0, -4),
              ),
            ],
          ),
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 28),
          child: SafeArea(
            top: false,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Center(
                  child: Container(
                    width: 40,
                    height: 4,
                    decoration: BoxDecoration(
                      color: Colors.grey.withValues(alpha: 0.4),
                      borderRadius: BorderRadius.circular(2),
                    ),
                  ),
                ),
                const SizedBox(height: 16),
                Row(
                  children: [
                    Container(
                      width: 40,
                      height: 40,
                      decoration: BoxDecoration(
                        color: const Color(0xFFD97706).withValues(alpha: 0.15),
                        shape: BoxShape.circle,
                      ),
                      child: const Icon(Icons.auto_stories_rounded, color: Color(0xFFD97706), size: 22),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text(
                            'HOLY SCRIPTURE FOCUS',
                            style: TextStyle(
                              fontSize: 10.5,
                              fontWeight: FontWeight.w900,
                              letterSpacing: 0.6,
                              color: Color(0xFFB45309),
                            ),
                          ),
                          Text(
                            reference.isNotEmpty ? reference : 'Scripture Passage',
                            style: const TextStyle(
                              fontSize: 17,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                        ],
                      ),
                    ),
                    IconButton(
                      icon: const Icon(Icons.close_rounded),
                      onPressed: () => Navigator.of(sheetContext).pop(),
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                Container(
                  padding: const EdgeInsets.all(18),
                  decoration: BoxDecoration(
                    color: isDark ? const Color(0xFF261C0E) : const Color(0xFFFEFCE8),
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(color: const Color(0xFFD97706).withValues(alpha: 0.35)),
                  ),
                  child: Text(
                    '“$text”',
                    style: const TextStyle(
                      fontSize: 17.5,
                      fontStyle: FontStyle.italic,
                      height: 1.65,
                      fontWeight: FontWeight.w500,
                      fontFamily: 'serif',
                    ),
                  ),
                ),
                const SizedBox(height: 20),
                FilledButton.icon(
                  style: FilledButton.styleFrom(
                    backgroundColor: const Color(0xFF002D72),
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                  ),
                  onPressed: () => Navigator.of(sheetContext).pop(),
                  icon: const Icon(Icons.check_rounded, size: 18),
                  label: const Text('Back to Study', style: TextStyle(fontWeight: FontWeight.w700)),
                ),
              ],
            ),
          ),
        );
      },
    );
  }
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
      return (value is num?value.toDouble():140.0).clamp(64.0,640.0).toDouble();
    });
    final heights=List<double>.generate(rows.length,(row){
      final value=rows[row]['rowHeight'];
      return (value is num?value.toDouble():72.0).clamp(48.0,480.0).toDouble();
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
        final spanX=((cell['colSpan'] as num?)?.toInt()??1).clamp(1,columns-c).toInt();
        final spanY=((cell['rowSpan'] as num?)?.toInt()??1).clamp(1,rows.length-r).toInt();
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
