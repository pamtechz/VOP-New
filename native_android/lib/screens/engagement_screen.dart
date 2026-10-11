import 'package:flutter/material.dart';
import '../core/vop_api.dart';
import '../theme/vop_theme.dart';
import '../widgets/vop_ui.dart';

List<Map<String,dynamic>> engagementRows(dynamic v)=>v is List
    ?v.whereType<Map>().map((e)=>Map<String,dynamic>.from(e)).toList():[];

class EngagementScreen extends StatefulWidget {
  const EngagementScreen({required this.api,super.key});
  final VopApi api;
  @override State<EngagementScreen> createState()=>_EngagementScreenState();
}
class _EngagementScreenState extends State<EngagementScreen> {
  int tab=0;
  late Future<Map<String,dynamic>> decks,arena;
  @override void initState(){super.initState();reload();}
  void reload(){
    decks=widget.api.action('/api/engagement',{'action':'memoryDecks'});
    arena=widget.api.action('/api/engagement',{'action':'duelOverview'});
  }
  @override Widget build(BuildContext context)=>Scaffold(
    appBar:AppBar(title:const Text('Scripture & Challenges')),
    body:Column(children:[
      Padding(padding:const EdgeInsets.all(15),
        child:SegmentedButton<int>(segments:const [
          ButtonSegment(value:0,label:Text('Memory decks'),
            icon:Icon(Icons.psychology_outlined)),
          ButtonSegment(value:1,label:Text('Challenges'),
            icon:Icon(Icons.sports_esports_outlined)),
        ],selected:{tab},onSelectionChanged:(values)=>setState(()=>tab=values.first))),
      Expanded(child:tab==0?_decks():_challenges()),
    ]),
  );
  Widget _decks()=>FutureBuilder<Map<String,dynamic>>(future:decks,
    builder:(context,s){
      if(s.connectionState!=ConnectionState.done)return const VopSkeleton();
      if(s.hasError)return VopEmpty(icon:Icons.wifi_off,message:'${s.error}',
        onRetry:()=>setState(reload));
      final items=engagementRows(s.data?['decks']);
      return RefreshIndicator(onRefresh:()async{setState(reload);await decks;},
        child:ListView(padding:const EdgeInsets.all(17),children:[
          const VopHeroCard(kicker:'SCRIPTURE MEMORY',
            title:'Hide His word in your heart.',
            description:'Review Bible verses at your own pace. Your progress and awards are verified by VOP.',
            icon:Icons.psychology_outlined),
          const SizedBox(height:18),
          VopSectionTitle('Memory decks',subtitle:'${items.length} available'),
          if(items.isEmpty)const SizedBox(height:170,
            child:VopEmpty(icon:Icons.bookmark_border,
              message:'No Scripture decks have been published for your organisation.')),
          ...items.map((deck)=>Card(margin:const EdgeInsets.only(bottom:11),
            child:ListTile(
              leading:const CircleAvatar(child:Icon(Icons.auto_stories_outlined)),
              title:Text('${deck['title']??deck['name']??'Memory deck'}',
                style:const TextStyle(fontWeight:FontWeight.w800)),
              subtitle:Text('${deck['description']??''}',maxLines:2,
                overflow:TextOverflow.ellipsis),
              trailing:const Icon(Icons.chevron_right),
              onTap:()=>Navigator.push(context,MaterialPageRoute<void>(
                builder:(_)=>_MemoryDeck(api:widget.api,
                  id:(deck['id']??'').toString(),
                  title:(deck['title']??deck['name']??'Memory deck').toString()))),
            ))),
        ]));
    });
  Widget _challenges()=>FutureBuilder<Map<String,dynamic>>(future:arena,
    builder:(context,s){
      if(s.connectionState!=ConnectionState.done)return const VopSkeleton();
      if(s.hasError)return VopEmpty(icon:Icons.wifi_off,message:'${s.error}',
        onRetry:()=>setState(reload));
      final data=s.data??{},stats=data['arena'] is Map
        ?Map<String,dynamic>.from(data['arena'] as Map):<String,dynamic>{};
      final active=engagementRows(data['soloChallenges']);
      return RefreshIndicator(onRefresh:()async{setState(reload);await arena;},
        child:ListView(padding:const EdgeInsets.all(17),children:[
          VopHeroCard(kicker:'BIBLE CHALLENGE ARENA',
            title:'Sharpen your faith.',
            description:'Build Scripture knowledge through solo challenges and track earned points.',
            icon:Icons.shield_outlined,cta:'Start solo challenge',
            onTap:()=>_startChallenge()),
          const SizedBox(height:18),
          Row(children:[
            Expanded(child:_score('LEVEL','${stats['level']??1}',Icons.trending_up)),
            const SizedBox(width:10),
            Expanded(child:_score('POINTS','${stats['points']??0}',Icons.stars_outlined)),
            const SizedBox(width:10),
            Expanded(child:_score('SOLO','${stats['soloCompleted']??0}',Icons.bolt_outlined)),
          ]),
          const SizedBox(height:18),
          VopSectionTitle('Continue challenges',subtitle:'Your active attempts'),
          if(active.isEmpty)const SizedBox(height:125,
            child:VopEmpty(icon:Icons.emoji_events_outlined,
              message:'No active solo challenge.')),
          ...active.map((item)=>Card(margin:const EdgeInsets.only(bottom:10),
            child:ListTile(
              title:Text('Solo challenge'),
              subtitle:Text('${item['answeredCount']??0} of ${item['questionCount']??0} answered'),
              trailing:const Icon(Icons.chevron_right),
              onTap:()=>_openChallenge((item['id']??'').toString())))),
          const SizedBox(height:12),
          OutlinedButton.icon(onPressed:_leaderboard,
            icon:const Icon(Icons.leaderboard_outlined),
            label:const Text('View leaderboard')),
        ]));
    });
  Widget _score(String label,String number,IconData icon)=>Card(
    child:Padding(padding:const EdgeInsets.symmetric(horizontal:9,vertical:14),
      child:Column(children:[
        Icon(icon,color:VopColors.gold,size:25),
        const SizedBox(height:7),
        Text(number,style:Theme.of(context).textTheme.titleLarge),
        Text(label,style:const TextStyle(fontSize:9,fontWeight:FontWeight.w800)),
      ])));
  Future<void> _startChallenge()async{
    try{
      final session=await widget.api.action('/api/engagement',
        {'action':'duelSoloCreate'});
      if(!mounted)return;
      await Navigator.push(context,MaterialPageRoute<void>(
        builder:(_)=>_SoloChallenge(api:widget.api,session:session)));
      if(mounted)setState(reload);
    }catch(e){
      if(mounted)ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content:Text('$e')));
    }
  }
  Future<void> _openChallenge(String id)async{
    try{
      final session=await widget.api.action('/api/engagement',
        {'action':'duelSoloJoin','challengeId':id});
      if(!mounted)return;
      await Navigator.push(context,MaterialPageRoute<void>(
        builder:(_)=>_SoloChallenge(api:widget.api,session:session)));
      if(mounted)setState(reload);
    }catch(e){
      if(mounted)ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content:Text('$e')));
    }
  }
  Future<void> _leaderboard()async{
    try{
      final data=await widget.api.action('/api/engagement',
        {'action':'duelLeaderboard'});
      if(!mounted)return;
      final items=engagementRows(data['leaderboard']);
      Navigator.push(context,MaterialPageRoute<void>(builder:(_)=>Scaffold(
        appBar:AppBar(title:const Text('Leaderboard')),
        body:items.isEmpty
          ?const VopEmpty(icon:Icons.leaderboard_outlined,
            message:'No participating learners yet.')
          :ListView.builder(padding:const EdgeInsets.all(16),itemCount:items.length,
            itemBuilder:(context,index)=>Card(child:ListTile(
              leading:CircleAvatar(child:Text('${items[index]['rank']??index+1}')),
              title:Text('${items[index]['displayName']??'Learner'}'),
              subtitle:Text('${items[index]['rating']??1200} rating'),
              trailing:Text('${items[index]['points']??0} pts')))),
      )));
    }catch(e){
      if(mounted)ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content:Text('$e')));
    }
  }
}
class _MemoryDeck extends StatefulWidget {
  const _MemoryDeck({required this.api,required this.id,required this.title});
  final VopApi api;
  final String id,title;
  @override State<_MemoryDeck> createState()=>_MemoryDeckState();
}
class _MemoryDeckState extends State<_MemoryDeck> {
  late Future<Map<String,dynamic>> due;
  @override void initState(){super.initState();reload();}
  void reload(){due=widget.api.action('/api/engagement',
    {'action':'memoryDue','deckId':widget.id});}
  Future<void> review(String verseId,int rating)async{
    try{
      await widget.api.action('/api/engagement',
        {'action':'memoryReview','deckId':widget.id,'verseId':verseId,'rating':rating});
      if(mounted)setState(reload);
    }catch(e){
      if(mounted)ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content:Text('$e')));
    }
  }
  @override Widget build(BuildContext context)=>Scaffold(
    appBar:AppBar(title:Text(widget.title)),
    body:FutureBuilder<Map<String,dynamic>>(future:due,builder:(context,s){
      if(s.connectionState!=ConnectionState.done)return const VopSkeleton();
      if(s.hasError)return VopEmpty(icon:Icons.wifi_off,message:'${s.error}');
      final verses=engagementRows(s.data?['due']);
      final summary=s.data?['summary'] is Map
        ?Map<String,dynamic>.from(s.data!['summary'] as Map):<String,dynamic>{};
      return ListView(padding:const EdgeInsets.all(18),children:[
        const VopHeroCard(title:'Review and remember.',
          description:'Recall each verse and rate how well you remembered it.',
          icon:Icons.menu_book_rounded,kicker:'MEMORY PRACTICE'),
        const SizedBox(height:16),
        VopSectionTitle('Verses due',
          subtitle:'${summary['due']??verses.length} ready for review'),
        if(verses.isEmpty)const SizedBox(height:180,
          child:VopEmpty(icon:Icons.task_alt_rounded,
            message:'All caught up. Your reviewed verses remain scheduled for revisiting.')),
        ...verses.map((verse)=>Card(margin:const EdgeInsets.only(bottom:13),
          child:Padding(padding:const EdgeInsets.all(16),
            child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
              Text('${verse['reference']??verse['scriptureRef']??''}',
                style:const TextStyle(fontWeight:FontWeight.w800,
                  color:VopColors.gold)),
              const SizedBox(height:11),
              Text('${verse['text']??verse['verseText']??''}',
                style:const TextStyle(fontSize:15,height:1.6)),
              const SizedBox(height:14),
              const Text('How well did you remember it?',
                style:TextStyle(fontWeight:FontWeight.w700,fontSize:12)),
              const SizedBox(height:9),
              Wrap(spacing:8,children:[
                for(final rating in [1,3,5])
                  OutlinedButton(onPressed:()=>review(
                    (verse['id']??'').toString(),rating),
                    child:Text(rating==1?'Again':rating==3?'Good':'Easy')),
              ]),
            ])))),
      ]);
    }),
  );
}
class _SoloChallenge extends StatefulWidget {
  const _SoloChallenge({required this.api,required this.session});
  final VopApi api;
  final Map<String,dynamic> session;
  @override State<_SoloChallenge> createState()=>_SoloChallengeState();
}
class _SoloChallengeState extends State<_SoloChallenge>{
  int position=0;
  bool busy=false,completed=false;
  String? error;
  Map<String,dynamic>? results;
  final answered=<String>{};
  @override void initState(){
    super.initState();
    for(final id in widget.session['answeredQuestionIds'] is List
      ?widget.session['answeredQuestionIds'] as List:[]){
      answered.add(id.toString());
    }
  }
  List<Map<String,dynamic>> get questions=>engagementRows(widget.session['questions']);
  String get id=>(widget.session['challengeId']??'').toString();
  Future<void> answer(String questionId,String selected)async{
    if(busy||answered.contains(questionId))return;
    setState((){busy=true;error=null;});
    try{
      await widget.api.action('/api/engagement',{
        'action':'duelSoloAnswer','challengeId':id,
        'questionId':questionId,'answer':selected,
      });
      if(!mounted)return;
      setState((){
        answered.add(questionId);
        if(position<questions.length-1)position++;
      });
    }catch(e){if(mounted)setState(()=>error='$e');}
    finally{if(mounted)setState(()=>busy=false);}
  }
  Future<void> finish()async{
    if(busy||answered.length<questions.length)return;
    setState(()=>busy=true);
    try{
      final result=await widget.api.action('/api/engagement',{
        'action':'duelSoloFinish','challengeId':id,
      });
      if(mounted)setState((){completed=true;results=result;});
    }catch(e){if(mounted)setState(()=>error='$e');}
    finally{if(mounted)setState(()=>busy=false);}
  }
  @override Widget build(BuildContext context){
    if(completed)return Scaffold(
      appBar:AppBar(title:const Text('Challenge result')),
      body:Center(child:Padding(padding:const EdgeInsets.all(25),
        child:Column(mainAxisSize:MainAxisSize.min,children:[
          const Icon(Icons.emoji_events,color:VopColors.gold,size:62),
          const SizedBox(height:18),
          Text('Challenge complete!',style:Theme.of(context).textTheme.headlineSmall),
          const SizedBox(height:12),
          Text('Score: ${results?['score']??0} / ${results?['questionCount']??questions.length}'),
          Text('Points awarded: ${results?['pointsAwarded']??0}'),
          const SizedBox(height:23),
          FilledButton(onPressed:()=>Navigator.pop(context),
            child:const Text('Return to arena')),
        ]))));
    if(questions.isEmpty)return const Scaffold(
      body:VopEmpty(icon:Icons.warning_amber,
        message:'No valid questions were returned for this challenge.'));
    final safePosition=position.clamp(0,questions.length-1).toInt();
    final q=questions[safePosition];
    final questionId=(q['id']??'').toString();
    final options=(q['options'] is List)
      ?(q['options'] as List).map((e)=>e.toString()).toList():<String>[];
    final done=answered.length>=questions.length;
    return Scaffold(
      appBar:AppBar(title:const Text('Solo Scripture Challenge')),
      body:ListView(padding:const EdgeInsets.all(19),children:[
        LinearProgressIndicator(value:answered.length/questions.length,minHeight:6),
        const SizedBox(height:20),
        Text('Question ${safePosition+1} of ${questions.length}',
          style:const TextStyle(fontWeight:FontWeight.w800,color:VopColors.gold)),
        const SizedBox(height:14),
        Text('${q['question']??''}',style:Theme.of(context).textTheme.titleLarge),
        if((q['scriptureRef']??'').toString().isNotEmpty)...[
          const SizedBox(height:8),Text('${q['scriptureRef']}'),
        ],
        const SizedBox(height:18),
        if(answered.contains(questionId))
          const Text('This question has already been answered.'),
        ...options.map((option)=>Padding(
          padding:const EdgeInsets.only(bottom:9),
          child:OutlinedButton(
            onPressed:busy||answered.contains(questionId)
              ?null:()=>answer(questionId,option),
            child:Padding(padding:const EdgeInsets.symmetric(vertical:12),
              child:Align(alignment:Alignment.centerLeft,child:Text(option)))))),
        if(error!=null)Text(error!,style:TextStyle(
          color:Theme.of(context).colorScheme.error)),
        const SizedBox(height:18),
        if(done)FilledButton(
          onPressed:busy?null:finish,child:const Text('Finish challenge'))
        else if(answered.contains(questionId)&&safePosition<questions.length-1)
          FilledButton(onPressed:()=>setState(()=>position++),
            child:const Text('Next question')),
      ]),
    );
  }
}
