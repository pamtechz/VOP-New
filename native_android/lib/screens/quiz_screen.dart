import 'package:flutter/material.dart';

import '../core/vop_api.dart';

class QuizScreen extends StatefulWidget {
  const QuizScreen({
    required this.api,required this.guideId,required this.lessonId,
    required this.language,required this.title,super.key,
  });
  final VopApi api;
  final String guideId,lessonId,language,title;
  @override State<QuizScreen> createState()=>_QuizScreenState();
}
class _QuizScreenState extends State<QuizScreen> {
  late Future<Map<String,dynamic>> session;
  Map<String,Object?> answers={};
  Map<String,dynamic>? result;
  bool submitting=false;
  int currentIndex=0;
  bool reviewing=false;
  String? error;
  String? restoredSession;
  void _restore(Map<String,dynamic> data){
    final id=(data['sessionId']??'').toString();
    if(id.isEmpty||id==restoredSession)return;
    if(restoredSession!=null){answers={};currentIndex=0;reviewing=false;}
    restoredSession=id;
    widget.api.quizDraft(widget.language,widget.guideId,
      widget.lessonId,id).then((value){
      if(mounted&&value.isNotEmpty&&answers.isEmpty)setState(()=>answers=value);
    }).catchError((Object ignored){});
  }
  void _answer(Map<String,dynamic> data,String key,Object? response){
    setState(()=>answers[key]=response);
    final id=(data['sessionId']??'').toString();
    if(id.isNotEmpty){
      widget.api.saveQuizDraft(widget.language,widget.guideId,
        widget.lessonId,id,answers,
        expiresAt:DateTime.tryParse((data['expiresAt']??'').toString()))
        .catchError((Object ignored){});
    }
  }
  @override void initState(){super.initState();start();}
  void start({bool confirmRetake=false}){
    session=widget.api.startQuiz(
      widget.guideId,widget.lessonId,widget.language,
      confirmRetake:confirmRetake);
  }
  Future<void> submit(Map<String,dynamic> data)async{
    if(submitting)return;
    final questions=(data['questions'] as List?)??[];
    if(answers.length<questions.length){
      final incomplete=List.generate(questions.length,(i)=>i)
        .firstWhere((index)=>!answers.containsKey(index.toString()),orElse:()=>0);
      setState((){
        currentIndex=incomplete;reviewing=false;
        error='Answer all questions before submitting.';
      });
      return;
    }
    setState((){submitting=true;error=null;});
    try{
      final response=await widget.api.submitQuiz(
        widget.guideId,widget.lessonId,widget.language,
        '${data['sessionId']}',answers);
      if(mounted)setState(()=>result=response);
    }catch(e){
      if(mounted)setState(()=>error='$e');
    }finally{
      if(mounted)setState(()=>submitting=false);
    }
  }
  @override Widget build(BuildContext context)=>Scaffold(
    appBar:AppBar(title:Text(widget.title)),
    body:result!=null?resultView():FutureBuilder<Map<String,dynamic>>(
      future:session,builder:(context,s){
        if(s.connectionState!=ConnectionState.done){
          return const Center(child:CircularProgressIndicator());
        }
        if(s.hasError){
          final exception=s.error;
          final retake=exception is VopApiException &&
            exception.code=='ASSESSMENT_RETAKE_CONFIRMATION';
          return Center(child:Padding(padding:const EdgeInsets.all(25),
            child:Column(mainAxisSize:MainAxisSize.min,children:[
              const Icon(Icons.assignment_late_outlined,size:45),
              const SizedBox(height:10),
              Text('${s.error}',textAlign:TextAlign.center),
              const SizedBox(height:16),
              if(retake)FilledButton(
                onPressed:()=>setState(()=>start(confirmRetake:true)),
                child:const Text('Confirm retake')),
              if(!retake)OutlinedButton(
                onPressed:()=>setState(start),
                child:const Text('Retry')),
            ])));
        }
        final data=s.data??{};
        _restore(data);
        final questions=(data['questions'] as List? ?? [])
          .whereType<Map>().toList();
        if (questions.isEmpty) {
          return const Center(
            child:Text('No published questions are available.'));
        }
        final policy=data['assessmentPolicy'] is Map
          ?data['assessmentPolicy'] as Map:{};
        final current=currentIndex.clamp(0,questions.length-1).toInt();
        final question=questions[current];
        final options=(question['options'] is List)
          ?question['options'] as List:[true,false];
        final selected=answers[current.toString()];
        final scheme=Theme.of(context).colorScheme;
        final completed=answers.length;
        return ListView(padding:const EdgeInsets.all(16),children:[
          Row(children:[
            Expanded(child:Text('Question ${current + 1} of ${questions.length}',
              style:const TextStyle(fontWeight:FontWeight.w800))),
            Text('$completed/${questions.length} answered',
              style:TextStyle(fontSize:11.5,color:scheme.onSurfaceVariant)),
          ]),
          const SizedBox(height:9),
          LinearProgressIndicator(
            value:completed/questions.length,minHeight:5,
            borderRadius:BorderRadius.circular(6)),
          const SizedBox(height:14),
          if(data['offline']==true)const Align(alignment:Alignment.centerLeft,
            child:Chip(avatar:Icon(Icons.cloud_off,size:16),
              label:Text('Offline attempt'))),
          if(reviewing)...[
            Text('Review your answers',
              style:Theme.of(context).textTheme.titleLarge),
            const SizedBox(height:12),
            ...questions.asMap().entries.map((entry)=>Card(
              margin:const EdgeInsets.only(bottom:8),
              child:ListTile(
                leading:Icon(answers.containsKey(entry.key.toString())
                  ?Icons.check_circle_rounded:Icons.radio_button_unchecked,
                  color:answers.containsKey(entry.key.toString())
                    ?Colors.green:scheme.onSurfaceVariant),
                title:Text((entry.value['prompt']??entry.value['question']??'Question').toString(),
                  maxLines:2,overflow:TextOverflow.ellipsis),
                subtitle:Text(answers.containsKey(entry.key.toString())
                  ?'Answered':'Not answered'),
                trailing:const Icon(Icons.edit_outlined,size:18),
                onTap:()=>setState((){
                  currentIndex=entry.key;reviewing=false;
                }),
              ))),
            const SizedBox(height:10),
            FilledButton.icon(
              onPressed:submitting||completed<questions.length
                ?null:()=>submit(data),
              icon:submitting?const SizedBox(width:17,height:17,
                child:CircularProgressIndicator(strokeWidth:2)):
                const Icon(Icons.fact_check_outlined),
              label:Text(submitting?'Submitting…':'Submit for verification')),
            TextButton(onPressed:()=>setState(()=>reviewing=false),
              child:const Text('Back to questions')),
          ]else...[
            Card(clipBehavior:Clip.antiAlias,
              child:Padding(padding:const EdgeInsets.all(17),
                child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
                  Text(widget.title,style:TextStyle(fontSize:11,
                    fontWeight:FontWeight.w800,color:scheme.primary)),
                  const SizedBox(height:10),
                  Text((question['prompt']??question['question']??'').toString(),
                    style:Theme.of(context).textTheme.titleLarge?.copyWith(height:1.42)),
                  const SizedBox(height:18),
                  ...options.asMap().entries.map((option){
                    final value=question['options'] is List
                      ?option.key:option.key==0;
                    final label=question['options'] is List
                      ?option.value.toString():option.key==0?'True':'False';
                    final chosen=selected==value;
                    return Padding(padding:const EdgeInsets.only(bottom:9),
                      child:Material(
                        color:chosen?scheme.primaryContainer:scheme.surface,
                        shape:RoundedRectangleBorder(
                          side:BorderSide(
                            color:chosen?scheme.primary:scheme.outlineVariant,
                            width:chosen?1.6:1),
                          borderRadius:BorderRadius.circular(13)),
                        clipBehavior:Clip.antiAlias,
                        child:InkWell(
                          onTap:()=>_answer(data,current.toString(),value),
                          child:Padding(padding:const EdgeInsets.symmetric(
                            horizontal:14,vertical:14),
                            child:Row(children:[
                              Icon(chosen?Icons.check_circle_rounded:
                                Icons.radio_button_unchecked,
                                size:22,color:chosen?scheme.primary:
                                  scheme.onSurfaceVariant),
                              const SizedBox(width:11),
                              Expanded(child:Text(label,
                                style:const TextStyle(fontSize:14.5,
                                  fontWeight:FontWeight.w600))),
                            ]),
                          ),
                        ),
                      ),
                    );
                  }),
                ]))),
            const SizedBox(height:12),
            Row(children:[
              OutlinedButton.icon(
                onPressed:current==0?null:()=>setState(()=>currentIndex--),
                icon:const Icon(Icons.chevron_left),
                label:const Text('Previous')),
              const Spacer(),
              FilledButton.icon(
                onPressed:()=>setState((){
                  if (current < questions.length - 1) {
                    currentIndex++;
                  } else {
                    reviewing = true;
                  }
                }),
                icon:Icon(current==questions.length-1
                  ?Icons.fact_check_outlined:Icons.chevron_right),
                label:Text(current==questions.length-1
                  ?'Review':'Next')),
            ]),
          ],
          if((policy['instructions']??'').toString().isNotEmpty)...[
            const SizedBox(height:13),
            Text((policy['instructions']??'').toString(),
              style:TextStyle(fontSize:12,color:scheme.onSurfaceVariant)),
          ],
          if(error!=null)Padding(padding:const EdgeInsets.symmetric(vertical:10),
            child:Text(error!,style:TextStyle(color:scheme.error))),
          const SizedBox(height:10),
          Wrap(spacing:6,runSpacing:6,children:[
            for(var number=0;number<questions.length;number++)
              ActionChip(
                avatar:Icon(answers.containsKey(number.toString())
                  ?Icons.check_circle_outline:Icons.circle_outlined,size:15),
                label:Text((number+1).toString()),
                onPressed:()=>setState((){
                  currentIndex=number;reviewing=false;
                }),
              ),
          ]),
          const SizedBox(height:20),
        ]);
      }),
  );
  Widget resultView(){
    final data=result!;
    if(data['queued']==true){
      return Center(child:Padding(padding:const EdgeInsets.all(22),
        child:Column(mainAxisSize:MainAxisSize.min,children:[
          const Icon(Icons.cloud_upload_outlined,size:62),
          const SizedBox(height:17),
          Text('Answers saved offline',
            style:Theme.of(context).textTheme.headlineSmall),
          const SizedBox(height:10),
          const Text('Your result will be available once VOP verifies this attempt online.',
            textAlign:TextAlign.center),
          const SizedBox(height:18),
          FilledButton.icon(
            onPressed:()async{
              final sync=await widget.api.syncPending();
              if(!mounted)return;
              if(sync['pending']==0){
                Navigator.pop(context,true);
              }else{
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content:Text('Still waiting for a connection.')));
              }
            },
            icon:const Icon(Icons.sync),label:const Text('Sync now')),
          TextButton(onPressed:()=>Navigator.pop(context),
            child:const Text('Return to course')),
        ])));
    }
    final passed=data['passed']==true;
    return Center(child:Padding(padding:const EdgeInsets.all(24),
      child:Column(mainAxisSize:MainAxisSize.min,children:[
        Icon(passed?Icons.verified:Icons.assignment_outlined,size:60,
          color:passed?Colors.green:null),
        const SizedBox(height:20),
        Text(passed?'Assessment passed':'Assessment completed',
          style:Theme.of(context).textTheme.headlineSmall),
        const SizedBox(height:12),
        if(data['score']!=null)
          Text('Score: ${data['score']}%',
            style:Theme.of(context).textTheme.titleLarge),
        if(data['threshold']!=null)Text('Pass mark: ${data['threshold']}%'),
        const SizedBox(height:10),
        const Text('This result was verified and recorded on the VOP server.',
          textAlign:TextAlign.center),
        const SizedBox(height:20),
        FilledButton(onPressed:()=>Navigator.pop(context),
          child:const Text('Return to guide')),
      ])));
  }
}
