import 'package:flutter/material.dart';

import '../core/vop_api.dart';
import '../core/offline_study.dart';

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
  bool submitting=false,pendingOffline=false;
  String? error;
  @override void initState(){super.initState();start();}
  void start({bool confirmRetake=false}){
    session=_startSession(confirmRetake:confirmRetake);
  }
  Future<Map<String,dynamic>> _startSession({bool confirmRetake=false})async{
    if(!confirmRetake){
      final stored=await OfflineStudy.instance.quiz(
        widget.guideId,widget.lessonId,widget.language);
      if(stored!=null)return stored;
    }
    try{
      final issued=await widget.api.startQuiz(
        widget.guideId,widget.lessonId,widget.language,
        confirmRetake:confirmRetake);
      try{
        await OfflineStudy.instance.saveQuiz(
          widget.guideId,widget.lessonId,widget.language,issued);
      }catch(_){}
      return issued;
    }catch(error){
      if(error is VopApiException&&error.status>=400&&error.status<500)rethrow;
      final stored=await OfflineStudy.instance.quiz(
        widget.guideId,widget.lessonId,widget.language);
      if(stored!=null)return stored;
      rethrow;
    }
  }
  Future<void> submit(Map<String,dynamic> data)async{
    if(submitting)return;
    final questions=(data['questions'] as List?)??[];
    if(answers.length<questions.length){
      setState(()=>error='Answer all the questions before submitting.');
      return;
    }
    setState((){submitting=true;error=null;});
    try{
      final response=await widget.api.submitQuiz(
        widget.guideId,widget.lessonId,widget.language,
        '${data['sessionId']}',answers);
      if(mounted)setState(()=>result=response);
    }catch(e){
      if(e is VopApiException&&(e.status>=400&&e.status<500)){
        if(mounted)setState(()=>error='$e');
      }else{
        try{
          await OfflineStudy.instance.queue('quiz',widget.guideId,
            widget.lessonId,widget.language,
            sessionId:(data['sessionId']??'').toString(),
            expiresAt:(data['expiresAt']??'').toString(),
            answers:answers);
          if(mounted)setState(()=>pendingOffline=true);
        }catch(storageError){
          if(mounted)setState(()=>error='$storageError');
        }
      }
    }finally{
      if(mounted)setState(()=>submitting=false);
    }
  }
  @override Widget build(BuildContext context)=>Scaffold(
    appBar:AppBar(title:Text(widget.title)),
    body:pendingOffline?_pendingView():result!=null?resultView():FutureBuilder<Map<String,dynamic>>(
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
        final questions=(data['questions'] as List? ?? [])
          .whereType<Map>().toList();
        if(questions.isEmpty)return const Center(
          child:Text('No published questions are available.'));
        final policy=data['assessmentPolicy'] is Map
          ?data['assessmentPolicy'] as Map:{};
        final answeredCount=answers.length.clamp(0,questions.length);
        return ListView(padding:const EdgeInsets.all(16),children:[
          ClipRRect(borderRadius:BorderRadius.circular(8),
            child:LinearProgressIndicator(
              value:answeredCount/questions.length,minHeight:7)),
          const SizedBox(height:8),
          Text('$answeredCount of ${questions.length} answered',
            style:Theme.of(context).textTheme.labelMedium),
          const SizedBox(height:12),
          Card(child:Padding(padding:const EdgeInsets.all(18),
            child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
              Text(widget.title,style:Theme.of(context).textTheme.titleLarge),
              const SizedBox(height:6),
              Text('${questions.length} questions · Pass mark ${policy['threshold']??''}%'),
              if((policy['instructions']??'').toString().isNotEmpty)
                Text('${policy['instructions']}'),
              if((data['expiresAt']??'').toString().isNotEmpty)
                Text('Session expires: ${data['expiresAt']}'),
            ]))),
          const SizedBox(height:14),
          ...questions.asMap().entries.map((entry){
            final index=entry.key;
            final question=entry.value;
            final options=(question['options'] is List)
              ?question['options'] as List:[true,false];
            final selected=answers['$index'];
            return Card(margin:const EdgeInsets.only(bottom:12),
              child:Padding(padding:const EdgeInsets.all(15),
                child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
                  Text('${index+1}. ${question['prompt']??question['question']??''}',
                    style:const TextStyle(fontWeight:FontWeight.w700)),
                  const SizedBox(height:9),
                  ...options.asMap().entries.map((opt){
                    final value=question['options'] is List?opt.key:opt.key==0;
                    final label=question['options'] is List
                      ?'${opt.value}':opt.key==0?'True':'False';
                    final chosen=selected==value;
                    return Padding(padding:const EdgeInsets.only(bottom:7),
                      child:Material(
                        color:chosen?Theme.of(context).colorScheme.primaryContainer:
                          Theme.of(context).colorScheme.surface,
                        borderRadius:BorderRadius.circular(12),
                        child:InkWell(
                          borderRadius:BorderRadius.circular(12),
                          onTap:()=>setState(()=>answers['$index']=value),
                          child:Padding(padding:const EdgeInsets.all(13),
                            child:Row(children:[
                              Icon(chosen?Icons.radio_button_checked:
                                Icons.radio_button_off,size:21,
                                color:chosen?Theme.of(context).colorScheme.primary:null),
                              const SizedBox(width:12),
                              Expanded(child:Text(label,style:TextStyle(
                                fontWeight:chosen?FontWeight.w700:FontWeight.w400))),
                            ]))),
                      ));
                  }),
                ]),
              ),
            );
          }),
          if(error!=null)Padding(padding:const EdgeInsets.all(10),
            child:Text(error!,style:TextStyle(
              color:Theme.of(context).colorScheme.error))),
          const SizedBox(height:12),
          FilledButton.icon(
            onPressed:submitting?null:()=>submit(data),
            icon:submitting?const SizedBox(width:18,height:18,
              child:CircularProgressIndicator(strokeWidth:2))
              :const Icon(Icons.fact_check_rounded),
            label:const Text('Submit for verification')),
          const SizedBox(height:18),
        ]);
      }),
  );
  Widget _pendingView()=>Center(child:Padding(
    padding:const EdgeInsets.all(24),
    child:Column(mainAxisSize:MainAxisSize.min,children:[
      const Icon(Icons.cloud_upload_outlined,size:52),
      const SizedBox(height:16),
      Text('Awaiting verification',style:Theme.of(context).textTheme.titleLarge),
      const SizedBox(height:12),
      const Text('Answers are saved securely on this device. '
        'The result will only be available after the server accepts the session.',
        textAlign:TextAlign.center),
      const SizedBox(height:18),
      FilledButton(onPressed:()=>Navigator.pop(context,false),
        child:const Text('Return to study')),
    ])));
  Widget resultView(){
    final data=result!;
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
        FilledButton(onPressed:()=>Navigator.pop(context,true),
          child:const Text('Return to guide')),
      ])));
  }
}
