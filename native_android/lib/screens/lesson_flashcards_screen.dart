import 'package:flutter/material.dart';
import '../core/vop_api.dart';

/// Study cards are generated from authenticated lesson pages, not fixtures.
class LessonFlashcardsScreen extends StatefulWidget {
  const LessonFlashcardsScreen({
    required this.api,
    required this.guideId,
    required this.lessonId,
    required this.title,
    super.key,
  });
  final VopApi api;
  final String guideId,lessonId,title;
  @override State<LessonFlashcardsScreen> createState()=>_LessonFlashcardsScreenState();
}
class _LessonFlashcardsScreenState extends State<LessonFlashcardsScreen> {
  late final Future<Map<String,dynamic>> source;
  int index=0;
  bool flipped=false;
  @override void initState(){super.initState();
    source=widget.api.lesson(widget.guideId,widget.lessonId);
  }
  @override Widget build(BuildContext context)=>Scaffold(
    appBar:AppBar(title:const Text('Study flashcards')),
    body:FutureBuilder<Map<String,dynamic>>(future:source,builder:(context,s){
      if(s.connectionState!=ConnectionState.done){
        return const Center(child:CircularProgressIndicator());
      }
      if(s.hasError)return Center(child:Padding(
        padding:const EdgeInsets.all(24),
        child:Text('Unable to load these published study pages: ${s.error}',
          textAlign:TextAlign.center)));
      final result=s.data??{};
      final lesson=result['lesson'] is Map?result['lesson'] as Map:{};
      final pages=(lesson['pages'] as List? ?? []).whereType<Map>().map((page){
        final title=(page['title']??widget.title).toString();
        final quote=page['scriptureQuote'] is Map?page['scriptureQuote'] as Map:{};
        final raw=(page['keyTakeaway']??'').toString().trim();
        final quoted=(quote['text']??'').toString().trim();
        final content=(page['content']??'').toString().replaceAll(RegExp(r'<[^>]*>'),' ')
          .replaceAll(RegExp(r'\s+'),' ').trim();
        return (front:title,back:raw.isNotEmpty?raw:quoted.isNotEmpty?quoted:content);
      }).where((item)=>item.back.isNotEmpty).toList();
      if(pages.isEmpty)return const Center(child:Padding(
        padding:EdgeInsets.all(24),
        child:Text('No reading content is available for flashcards in this lesson.')));
      final current=pages[index.clamp(0,pages.length-1).toInt()];
      final theme=Theme.of(context);
      return Center(child:ConstrainedBox(constraints:const BoxConstraints(maxWidth:820),
        child:Padding(padding:const EdgeInsets.all(20),
          child:Column(children:[
            Text(widget.title,style:theme.textTheme.titleLarge,
              textAlign:TextAlign.center),
            const SizedBox(height:13),
            Text('${index+1} of ${pages.length}',
              style:theme.textTheme.bodyMedium),
            const SizedBox(height:16),
            Expanded(child:Material(
              color:theme.colorScheme.surfaceContainer,
              borderRadius:BorderRadius.circular(20),
              child:InkWell(onTap:()=>setState(()=>flipped=!flipped),
                borderRadius:BorderRadius.circular(20),
                child:Center(child:SingleChildScrollView(
                  padding:const EdgeInsets.all(28),
                  child:Column(mainAxisSize:MainAxisSize.min,children:[
                    Text(flipped?'READING EXCERPT':'STUDY TOPIC',
                      style:TextStyle(color:theme.colorScheme.primary,
                        fontWeight:FontWeight.w900,letterSpacing:1.2)),
                    const SizedBox(height:22),
                    Text(flipped?current.back:current.front,
                      textAlign:TextAlign.center,
                      style:theme.textTheme.headlineSmall?.copyWith(height:1.5)),
                    const SizedBox(height:25),
                    const Row(mainAxisSize:MainAxisSize.min,children:[
                      Icon(Icons.flip,size:18),SizedBox(width:7),
                      Text('Tap to flip'),
                    ]),
                  ]),
                )),
              ),
            )),
            const SizedBox(height:18),
            Row(children:[
              Expanded(child:OutlinedButton.icon(
                onPressed:index>0?()=>setState((){
                  index--;flipped=false;
                }):null,
                icon:const Icon(Icons.chevron_left),
                label:const Text('Previous'),
              )),
              const SizedBox(width:14),
              Expanded(child:FilledButton.icon(
                onPressed:index+1<pages.length?()=>setState((){
                  index++;flipped=false;
                }):null,
                icon:const Icon(Icons.chevron_right),
                label:const Text('Next'),
              )),
            ]),
          ]),
        ),
      ));
    }),
  );
}
