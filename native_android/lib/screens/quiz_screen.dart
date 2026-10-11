import 'package:flutter/material.dart';

import '../core/vop_api.dart';
import '../core/offline_study.dart';
import '../widgets/vop_ui.dart';

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
  final store=OfflineStudyStore();
  late Future<Map<String,dynamic>> session;
  int position=0;
  bool offlineAttempt=false,pendingVerification=false;
  Map<String,Object?> answers={};
  Map<String,dynamic>? result;
  bool submitting=false;
  String? error;
  @override void initState(){super.initState();start();}
  void start({bool confirmRetake=false}){
    session=_loadSession(confirmRetake:confirmRetake);
  }
  Future<Map<String,dynamic>> _loadSession({bool confirmRetake=false})async{
    try{
      final data=await widget.api.startQuiz(widget.guideId,widget.lessonId,
        widget.language,confirmRetake:confirmRetake);
      if(data['ok']==false||data['sessionId']==null){
        throw VopApiException((data['error']??'Assessment unavailable').toString(),
          code:(data['code']??'').toString());
      }
      await store.saveQuizSession(widget.guideId,widget.lessonId,widget.language,data);
      final saved=await store.quizAnswers(widget.guideId,widget.lessonId,
        widget.language,(data['sessionId']??'').toString());
      if(mounted)setState(()=>answers=saved);
      offlineAttempt=false;
      return data;
    }catch(error){
      if(error is VopApiException && error.status==0){
        final cached=await store.quizSession(widget.guideId,widget.lessonId,widget.language);
        if(cached!=null){
          final saved=await store.quizAnswers(widget.guideId,widget.lessonId,
            widget.language,(cached['sessionId']??'').toString());
          if(mounted)setState(()=>answers=saved);
          offlineAttempt=true;return cached;
        }
      }
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
      await store.clearQuiz(widget.guideId,widget.lessonId,widget.language);
      if(mounted)setState(()=>result=response);
    }catch(e){
      if(e is VopApiException && e.status==0){
        try{
          await store.queueQuiz(widget.guideId,widget.lessonId,
            widget.language,data,answers);
          if(mounted)setState(()=>pendingVerification=true);
        }catch(queueError){if(mounted)setState(()=>error='$queueError');}
      }else if(mounted)setState(()=>error='$e');
    }finally{
      if(mounted)setState(()=>submitting=false);
    }
  }
  @override Widget build(BuildContext context)=>Scaffold(
    appBar:AppBar(title:Text(widget.title)),
    body:pendingVerification
      ?Center(child:Padding(padding:const EdgeInsets.all(24),
        child:Column(mainAxisSize:MainAxisSize.min,children:[
          const Icon(Icons.cloud_upload_outlined,size:58),
          const SizedBox(height:15),
          Text('Awaiting verification',style:Theme.of(context).textTheme.titleLarge),
          const SizedBox(height:10),
          const Text('Your answers are encrypted on this device. VOP will submit '
            'them to the server when you reconnect, provided the original '
            'attempt has not expired. No score or points are awarded offline.',
            textAlign:TextAlign.center),
          const SizedBox(height:18),
          FilledButton(onPressed:()=>Navigator.pop(context),
            child:const Text('Return to guide')),
        ])))
      :result!=null?resultView():FutureBuilder<Map<String,dynamic>>(
      future:session,builder:(context,s){
        if(s.connectionState!=ConnectionState.done){
          return const VopSkeleton(rows:4);
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
        final index=position.clamp(0,questions.length-1).toInt();
        final entry=questions[index];
        final options=(entry['options'] is List)?entry['options'] as List:[true,false];
        final selected=answers['$index'];
        return ListView(padding:const EdgeInsets.all(16),children:[
          if(offlineAttempt)const Card(child:ListTile(
            leading:Icon(Icons.offline_bolt_outlined),
            title:Text('Offline attempt'),
            subtitle:Text('This server-started session expires at its original time. '
              'Answers require online verification.'))),
          LinearProgressIndicator(value:(index+1)/questions.length,minHeight:6),
          const SizedBox(height:11),
          Text('Question ${index+1} of ${questions.length}',
            style:Theme.of(context).textTheme.titleMedium),
          const SizedBox(height:13),
          Card(child:Padding(padding:const EdgeInsets.all(18),
            child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
              Text('Assessment',style:Theme.of(context).textTheme.titleLarge),
              const SizedBox(height:6),
              Text('${questions.length} questions · Pass mark ${policy['threshold']??''}%'),
              if((policy['instructions']??'').toString().isNotEmpty)
                Text('${policy['instructions']}'),
              if((data['expiresAt']??'').toString().isNotEmpty)
                Text('Session expires: ${data['expiresAt']}'),
            ]))),
          const SizedBox(height:14),
          Card(child:Padding(padding:const EdgeInsets.all(17),child:
            Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
              Text('${entry['prompt']??entry['question']??''}',
                style:Theme.of(context).textTheme.titleMedium),
              const SizedBox(height:13),
              ...options.asMap().entries.map((opt){
                final value=entry['options'] is List?opt.key:opt.key==0;
                final label=entry['options'] is List
                  ?'${opt.value}':opt.key==0?'True':'False';
                final checked=selected==value;
                return Padding(padding:const EdgeInsets.only(bottom:8),
                  child:Card(
                    color:checked?Theme.of(context).colorScheme.primaryContainer:null,
                    child:InkWell(
                      onTap:(){
                        setState(()=>answers['$index']=value);
                        store.saveQuizAnswers(widget.guideId,widget.lessonId,
                          widget.language,(data['sessionId']??'').toString(),answers);
                      },
                      borderRadius:BorderRadius.circular(12),
                      child:Padding(padding:const EdgeInsets.all(13),
                        child:Row(children:[
                          Icon(checked?Icons.radio_button_checked:Icons.radio_button_unchecked,
                            color:checked?Theme.of(context).colorScheme.primary:null),
                          const SizedBox(width:11),
                          Expanded(child:Text(label)),
                        ])))));
              }),
            ]))),
          const SizedBox(height:12),
          Row(children:[
            OutlinedButton.icon(onPressed:index==0?null:()=>setState(()=>position--),
              icon:const Icon(Icons.chevron_left),label:const Text('Back')),
            const Spacer(),
            if(index<questions.length-1)
              FilledButton.icon(onPressed:answers.containsKey('$index')
                ?()=>setState(()=>position++):null,
                icon:const Icon(Icons.chevron_right),label:const Text('Next')),
          ]),
          if(error!=null)Padding(padding:const EdgeInsets.all(10),
            child:Text(error!,style:TextStyle(
              color:Theme.of(context).colorScheme.error))),
          const SizedBox(height:12),
          if(position==questions.length-1)FilledButton.icon(
            onPressed:submitting||answers.length!=questions.length
              ?null:()=>submit(data),
            icon:submitting?const SizedBox(width:18,height:18,
              child:CircularProgressIndicator(strokeWidth:2))
              :const Icon(Icons.fact_check_rounded),
            label:const Text('Submit for verification')),
          const SizedBox(height:18),
        ]);
      }),
  );
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
        FilledButton(onPressed:()=>Navigator.pop(context),
          child:const Text('Return to guide')),
      ])));
  }
}
