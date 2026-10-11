import 'package:flutter/material.dart';
import '../core/vop_api.dart';
import '../theme/vop_theme.dart';
import '../widgets/vop_ui.dart';

class VopNotifications extends StatefulWidget {
  const VopNotifications({required this.api,super.key});
  final VopApi api;
  @override State<VopNotifications> createState()=>_VopNotificationsState();
}
class _VopNotificationsState extends State<VopNotifications>{
  late Future<Map<String,dynamic>> inbox;
  @override void initState(){super.initState();reload();}
  void reload(){inbox=widget.api.notifications();}
  List<Map<String,dynamic>> rows(dynamic v)=>v is List
    ?v.whereType<Map>().map((e)=>Map<String,dynamic>.from(e)).toList():[];
  Future<void> update(Future<Map<String,dynamic>> Function() op)async{
    try{await op();if(mounted)setState(reload);}
    catch(error){
      if(mounted)ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content:Text('$error')));
    }
  }
  @override Widget build(BuildContext context)=>Scaffold(
    appBar:AppBar(title:const Text('Notifications'),
      actions:[IconButton(tooltip:'Mark all read',
        onPressed:()=>update(widget.api.markAllNotificationsRead),
        icon:const Icon(Icons.done_all))]),
    body:FutureBuilder<Map<String,dynamic>>(future:inbox,builder:(context,s){
      if(s.connectionState!=ConnectionState.done)return const VopSkeleton();
      if(s.hasError)return VopEmpty(icon:Icons.wifi_off,
        message:'${s.error}',onRetry:()=>setState(reload));
      final notifications=rows(s.data?['items']);
      return RefreshIndicator(onRefresh:()async{setState(reload);await inbox;},
        child:ListView(padding:const EdgeInsets.all(16),children:[
          VopSectionTitle('Updates and messages',
            subtitle:'${s.data?['unread']??0} unread'),
          if(notifications.isEmpty)const SizedBox(height:250,
            child:VopEmpty(icon:Icons.notifications_none_rounded,
              message:'You are all caught up.')),
          ...notifications.map((item)=>Card(
            margin:const EdgeInsets.only(bottom:10),
            clipBehavior:Clip.antiAlias,
            child:InkWell(
              onTap:()=>update(()=>widget.api.markNotificationRead(
                (item['id']??'').toString())),
              child:Padding(padding:const EdgeInsets.all(14),
                child:Row(crossAxisAlignment:CrossAxisAlignment.start,children:[
                  Container(width:41,height:41,
                    decoration:BoxDecoration(
                      color:VopColors.navyBright.withValues(alpha:.11),
                      borderRadius:BorderRadius.circular(11)),
                    child:const Icon(Icons.notifications_active_outlined,
                      color:VopColors.navyBright,size:22)),
                  const SizedBox(width:12),
                  Expanded(child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
                    Row(children:[
                      Expanded(child:Text('${item['title']??'Notification'}',
                        style:TextStyle(fontWeight:item['read']==true
                          ?FontWeight.w600:FontWeight.w800))),
                      if(item['read']!=true)const CircleAvatar(
                        radius:4,backgroundColor:VopColors.gold),
                    ]),
                    const SizedBox(height:5),
                    Text('${item['body']??item['message']??''}',
                      style:TextStyle(height:1.5,
                        color:Theme.of(context).colorScheme.onSurfaceVariant)),
                  ])),
                  PopupMenuButton<String>(
                    icon:const Icon(Icons.more_vert,size:20),
                    onSelected:(selection){
                      if(selection=='delete')update(()=>widget.api.deleteNotification(
                        (item['id']??'').toString()));
                      if(selection=='read')update(()=>widget.api.markNotificationRead(
                        (item['id']??'').toString()));
                    },
                    itemBuilder:(_)=>const [
                      PopupMenuItem(value:'read',child:Text('Mark as read')),
                      PopupMenuItem(value:'delete',child:Text('Delete')),
                    ]),
                ]))),
          )),
        ]));
    }),
  );
}
