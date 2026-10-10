import 'package:flutter/material.dart';

import '../core/vop_api.dart';

List<Map<String,dynamic>> rows(dynamic input)=>
    input is List?input.whereType<Map>().map((e)=>Map<String,dynamic>.from(e)).toList():[];

class MentorScreen extends StatefulWidget {
  const MentorScreen({required this.api,super.key});
  final VopApi api;
  @override State<MentorScreen> createState()=>_MentorScreenState();
}
class _MentorScreenState extends State<MentorScreen> {
  late Future<Map<String,dynamic>> future;
  @override void initState(){super.initState();reload();}
  void reload(){
    future=widget.api.action('/api/mentorship',{'action':'listMyConversations'});
  }
  @override Widget build(BuildContext context)=>FutureBuilder<Map<String,dynamic>>(
    future:future,builder:(context,s){
      if(s.connectionState!=ConnectionState.done){
        return const Center(child:CircularProgressIndicator());
      }
      if(s.hasError)return Center(child:Padding(padding:const EdgeInsets.all(22),
        child:Text('${s.error}',textAlign:TextAlign.center)));
      final list=rows(s.data?['items']);
      if(list.isEmpty)return const Center(child:Padding(
        padding:EdgeInsets.all(24),
        child:Column(mainAxisSize:MainAxisSize.min,children:[
          Icon(Icons.forum_outlined,size:45),
          SizedBox(height:14),
          Text('No mentor conversation is assigned yet.',
            textAlign:TextAlign.center),
          SizedBox(height:8),
          Text('An organisation administrator can assign a mentor to your account.',
            textAlign:TextAlign.center),
        ])));
      return RefreshIndicator(onRefresh:()async{setState(reload);await future;},
        child:ListView.builder(itemCount:list.length,itemBuilder:(context,index){
          final item=list[index];
          return ListTile(
            leading:const CircleAvatar(child:Icon(Icons.person_outline)),
            title:Text('${item['mentorName']??'Mentor'}'),
            subtitle:Text(item['unread']==true?'Unread message':'Open conversation'),
            trailing:const Icon(Icons.chevron_right),
            onTap:()=>Navigator.push(context,MaterialPageRoute<void>(
              builder:(_)=>MentorConversation(api:widget.api,
                data:item))),
          );
        }));
    });
}

class MentorConversation extends StatefulWidget {
  const MentorConversation({required this.api,required this.data,super.key});
  final VopApi api;
  final Map<String,dynamic> data;
  @override State<MentorConversation> createState()=>_MentorConversationState();
}
class _MentorConversationState extends State<MentorConversation> {
  final composer=TextEditingController();
  late Future<Map<String,dynamic>> messages;
  bool sending=false;
  @override void initState(){super.initState();refresh();}
  void refresh(){
    messages=widget.api.action('/api/mentorship',{
      'action':'messages','conversationId':widget.data['id'],
    });
  }
  @override void dispose(){composer.dispose();super.dispose();}
  Future<void> send()async{
    final text=composer.text.trim();
    if(text.isEmpty||sending)return;
    setState(()=>sending=true);
    try{
      await widget.api.action('/api/mentorship',{
        'action':'sendMessage',
        'studentId':widget.data['studentId'],
        'mentorId':widget.data['mentorId'],
        'message':text,
      });
      composer.clear();
      if(mounted)setState(refresh);
    }catch(error){
      if(mounted)ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content:Text('$error')));
    }finally{
      if(mounted)setState(()=>sending=false);
    }
  }
  @override Widget build(BuildContext context)=>Scaffold(
    appBar:AppBar(title:Text('${widget.data['mentorName']??'Mentor'}'),
      actions:[IconButton(icon:const Icon(Icons.refresh),tooltip:'Refresh messages',
        onPressed:()=>setState(refresh))]),
    body:Column(children:[
      Expanded(child:FutureBuilder<Map<String,dynamic>>(
        future:messages,builder:(context,s){
          if(s.connectionState!=ConnectionState.done){
            return const Center(child:CircularProgressIndicator());
          }
          if(s.hasError)return Center(child:Text('${s.error}'));
          final list=rows(s.data?['items']);
          return ListView.builder(
            padding:const EdgeInsets.all(14),itemCount:list.length,
            itemBuilder:(context,index){
              final item=list[index];
              return Padding(
                padding:const EdgeInsets.symmetric(vertical:6),
                child:Card(child:Padding(padding:const EdgeInsets.all(12),
                  child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
                    Text('${item['senderName']??item['senderId']??''}',
                      style:const TextStyle(fontSize:12,fontWeight:FontWeight.w700)),
                    const SizedBox(height:4),
                    Text('${item['message']??item['text']??''}'),
                  ]))));
            });
        })),
      SafeArea(top:false,child:Padding(
        padding:const EdgeInsets.all(10),
        child:Row(children:[
          Expanded(child:TextField(controller:composer,
            minLines:1,maxLines:4,
            decoration:const InputDecoration(hintText:'Message your mentor'))),
          IconButton(
            onPressed:sending?null:send,
            tooltip:'Send message',
            icon:sending?const CircularProgressIndicator():const Icon(Icons.send)),
        ]))),
    ]),
  );
}
