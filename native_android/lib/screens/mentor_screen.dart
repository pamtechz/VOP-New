import 'package:flutter/material.dart';
import 'package:firebase_auth/firebase_auth.dart';

import '../core/vop_api.dart';
import 'learner_support_screen.dart';

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
  Widget _mentorList(BuildContext context)=>FutureBuilder<Map<String,dynamic>>(
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

  @override
  Widget build(BuildContext context) => DefaultTabController(
    length: 2,
    child: Column(children: [
      const TabBar(tabs: [
        Tab(text: 'Mentor conversations'),
        Tab(text: 'Support requests'),
      ]),
      Expanded(child: TabBarView(children: [
        _mentorList(context),
        LearnerSupportScreen(api: widget.api, embedded: true),
      ])),
    ]),
  );
}

class MentorConversation extends StatefulWidget {
  const MentorConversation({required this.api,required this.data,super.key});
  final VopApi api;
  final Map<String,dynamic> data;
  @override State<MentorConversation> createState()=>_MentorConversationState();
}
class _MentorConversationState extends State<MentorConversation> {
  final composer=TextEditingController();
  final references=<StudySupportReference>[];
  late Future<Map<String,dynamic>> messages;
  bool sending=false;
  @override void initState(){super.initState();refresh();}
  void refresh(){
    messages=widget.api.action('/api/mentorship',{
      'action':'messages','conversationId':widget.data['id'],
    });
  }
  @override void dispose(){composer.dispose();super.dispose();}
  Future<void> attach() async {
    final reference=await pickStudySupportReference(context,widget.api);
    if(!mounted||reference==null)return;
    if(!references.any((value)=>value.type==reference.type&&value.id==reference.id)){
      setState(()=>references.add(reference));
    }
  }
  Future<void> editOrDelete(Map<String,dynamic> item,bool delete)async{
    final messageId=(item['id']??'').toString();
    final conversationId=(widget.data['id']??'').toString();
    if(messageId.isEmpty||conversationId.isEmpty)return;
    var text=(item['body']??'').toString();
    if(!delete){
      final input=TextEditingController(text:text);
      final updated=await showDialog<String>(context:context,builder:(dialogContext)=>
        AlertDialog(title:const Text('Edit message'),
          content:TextField(controller:input,minLines:2,maxLines:6,maxLength:10000),
          actions:[
            TextButton(onPressed:()=>Navigator.pop(dialogContext),child:const Text('Cancel')),
            FilledButton(onPressed:()=>Navigator.pop(dialogContext,input.text.trim()),
              child:const Text('Save')),
          ]));
      input.dispose();
      if(updated==null||updated.isEmpty)return;
      text=updated;
    }else{
      final confirmed=await showDialog<bool>(context:context,builder:(dialogContext)=>
        AlertDialog(title:const Text('Delete message?'),
          content:const Text('The deleted message will no longer be visible.'),
          actions:[
            TextButton(onPressed:()=>Navigator.pop(dialogContext,false),child:const Text('Cancel')),
            FilledButton(onPressed:()=>Navigator.pop(dialogContext,true),child:const Text('Delete')),
          ]));
      if(confirmed!=true)return;
    }
    try{
      await widget.api.action('/api/mentorship',{
        'action':delete?'deleteMessage':'editMessage',
        'conversationId':conversationId,'messageId':messageId,
        if(!delete)'message':text,
        if(!delete)'references':item['references'] is List?item['references']:<Object>[],
      });
      if(mounted)setState(refresh);
    }catch(problem){
      if(mounted)ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content:Text(problem.toString())));
    }
  }
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
        'references':references.map((reference)=>reference.toJson()).toList(),
      });
      composer.clear();
      if(mounted)setState((){references.clear();refresh();});
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
          final selfId=FirebaseAuth.instance.currentUser?.uid??'';
          return ListView.builder(
            padding:const EdgeInsets.all(14),itemCount:list.length,
            itemBuilder:(context,index){
              final item=list[index];
              return Padding(
                padding:const EdgeInsets.symmetric(vertical:6),
                child:Card(child:Padding(padding:const EdgeInsets.all(12),
                  child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
                    Row(children:[
                      Expanded(child:Text(item['senderId']==selfId?'You':
                        (item['senderName']??item['senderId']??'Mentor').toString(),
                        style:const TextStyle(fontSize:12,fontWeight:FontWeight.w700))),
                      if(selfId.isNotEmpty&&item['senderId']==selfId&&item['deleted']!=true)
                        PopupMenuButton<String>(
                          tooltip:'Message actions',
                          onSelected:(value)=>editOrDelete(item,value=='delete'),
                          itemBuilder:(_)=>const [
                            PopupMenuItem(value:'edit',child:Text('Edit')),
                            PopupMenuItem(value:'delete',child:Text('Delete')),
                          ],
                        ),
                    ]),
                    const SizedBox(height:4),
                    Text(item['deleted']==true?'Message deleted':
                      (item['body']??item['message']??item['text']??'').toString()),
                    ...rows(item['references']).map((reference)=>Padding(
                      padding:const EdgeInsets.only(top:7),
                      child:Chip(avatar:const Icon(Icons.link_outlined,size:16),
                        label:Text((reference['label']??'').toString())),
                    )),
                  ]))));
            });
        })),
      SafeArea(top:false,child:Padding(
        padding:const EdgeInsets.all(10),
        child:Column(children:[
          if(references.isNotEmpty)SizedBox(height:38,
            child:ListView(scrollDirection:Axis.horizontal,children:[
              ...references.map((reference)=>InputChip(
                label:Text(reference.label),
                onDeleted:()=>setState(()=>references.remove(reference)),
              )),
            ])),
          Row(children:[
          IconButton(onPressed:sending?null:attach,
            tooltip:'Attach study reference',icon:const Icon(Icons.attach_file)),
          Expanded(child:TextField(controller:composer,
            minLines:1,maxLines:4,
            decoration:const InputDecoration(hintText:'Message your mentor'))),
          IconButton(
            onPressed:sending?null:send,
            tooltip:'Send message',
            icon:sending?const CircularProgressIndicator():const Icon(Icons.send)),
        ]),
        ]))),
    ]),
  );
}
