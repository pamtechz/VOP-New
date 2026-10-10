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
  String? error;
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
        final questions=(data['questions'] as List? ?? [])
          .whereType<Map>().toList();
        if(questions.isEmpty)return const Center(
          child:Text('No published questions are available.'));
        final policy=data['assessmentPolicy'] is Map
          ?data['assessmentPolicy'] as Map:{};
        return ListView(padding:const EdgeInsets.all(18),children:[
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
                    return RadioListTile<Object>(
                      dense:true,contentPadding:EdgeInsets.zero,
                      title:Text(label),value:value,
                      groupValue:selected,
                      onChanged:(answer)=>setState(()=>answers['$index']=answer),
                    );
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
