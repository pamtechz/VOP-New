import 'package:flutter/material.dart';
import '../core/vop_api.dart';
import '../theme/vop_theme.dart';
import '../widgets/vop_ui.dart';

class PrayerScreen extends StatefulWidget {
  const PrayerScreen({required this.api,this.embedded=false,super.key});
  final VopApi api;
  final bool embedded;
  @override State<PrayerScreen> createState()=>_PrayerScreenState();
}
class _PrayerScreenState extends State<PrayerScreen> {
  late Future<Map<String,dynamic>> requests;
  bool mine=true;
  @override void initState(){super.initState();reload();}
  void reload(){requests=widget.api.prayers(mine:mine);}
  List<Map<String,dynamic>> rows(dynamic input)=>input is List
    ?input.whereType<Map>().map((e)=>Map<String,dynamic>.from(e)).toList()
    :[];
  @override Widget build(BuildContext context){
    final body=FutureBuilder<Map<String,dynamic>>(future:requests,builder:(context,s){
      if(s.connectionState!=ConnectionState.done)return const VopSkeleton();
      if(s.hasError)return VopEmpty(icon:Icons.wifi_off,
        message:'${s.error}',onRetry:()=>setState(reload));
      final list=rows(s.data?['items']);
      return RefreshIndicator(onRefresh:()async{setState(reload);await requests;},
        child:ListView(padding:const EdgeInsets.all(17),children:[
          VopHeroCard(
            kicker:'PRAYER MINISTRY',
            title:'A place to pray, share and be supported.',
            description:'Bring what is on your heart. Your request can stay private or be shared with your community.',
            icon:Icons.volunteer_activism_outlined,cta:'Send prayer request',
            onTap:_compose),
          const SizedBox(height:19),
          SegmentedButton<bool>(
            segments:const [
              ButtonSegment(value:true,label:Text('My requests'),icon:Icon(Icons.person_outline)),
              ButtonSegment(value:false,label:Text('Community'),icon:Icon(Icons.groups_outlined)),
            ],
            selected:{mine},
            onSelectionChanged:(next)=>setState((){mine=next.first;reload();})),
          const SizedBox(height:16),
          VopSectionTitle(mine?'Your prayer requests':'Community prayer',
            subtitle:'${list.length} requests'),
          if(list.isEmpty)const SizedBox(height:210,
            child:VopEmpty(icon:Icons.favorite_outline,
              message:'No prayer requests available yet.')),
          ...list.map((item)=>Card(
            margin:const EdgeInsets.only(bottom:12),
            child:Padding(padding:const EdgeInsets.all(16),
              child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
                Row(children:[
                  const Icon(Icons.favorite_rounded,color:VopColors.gold,size:19),
                  const SizedBox(width:7),
                  Text('${item['category']??'Prayer'}',
                    style:const TextStyle(fontWeight:FontWeight.w800)),
                  const Spacer(),
                  Text('${item['status']??'Received'}',
                    style:TextStyle(fontSize:11,
                      color:Theme.of(context).colorScheme.primary)),
                  if(item['isPrivate']==true)...[
                    const SizedBox(width:5),const Icon(Icons.lock_outline,size:15),
                  ],
                ]),
                const SizedBox(height:12),
                Text('${item['requestText']??item['text']??''}',
                  style:const TextStyle(fontSize:14,height:1.55)),
              ])))),
          const SizedBox(height:45),
        ]));
    });
    return widget.embedded?body:Scaffold(
      appBar:AppBar(title:const Text('Prayer Ministry')),body:body,
      floatingActionButton:FloatingActionButton.extended(
        onPressed:_compose,icon:const Icon(Icons.edit_outlined),
        label:const Text('Prayer request')));
  }
  Future<void> _compose()async{
    final controller=TextEditingController();
    String category='Spiritual';
    bool private=true,saving=false;
    String? error;
    final done=await showModalBottomSheet<bool>(
      context:context,isScrollControlled:true,useSafeArea:true,
      backgroundColor:Theme.of(context).colorScheme.surface,
      shape:const RoundedRectangleBorder(
        borderRadius:BorderRadius.vertical(top:Radius.circular(25))),
      builder:(sheetContext)=>StatefulBuilder(builder:(context,setSheet){
        return Padding(padding:EdgeInsets.fromLTRB(
          21,22,21,MediaQuery.viewInsetsOf(context).bottom+20),
          child:SingleChildScrollView(
            child:Column(mainAxisSize:MainAxisSize.min,
              crossAxisAlignment:CrossAxisAlignment.stretch,children:[
                Text('New prayer request',
                  style:Theme.of(context).textTheme.titleLarge),
                const SizedBox(height:5),
                const Text('Share what you would like us to pray for.'),
                const SizedBox(height:16),
                TextField(controller:controller,minLines:4,maxLines:7,
                  maxLength:4000,decoration:const InputDecoration(
                    labelText:'Prayer request',alignLabelWithHint:true)),
                const SizedBox(height:8),
                DropdownButtonFormField<String>(
                  initialValue:category,
                  decoration:const InputDecoration(labelText:'Category'),
                  items:const ['Spiritual','Health','Family','Guidance','Thanksgiving','Other']
                    .map((v)=>DropdownMenuItem(value:v,child:Text(v))).toList(),
                  onChanged:(v)=>setSheet(()=>category=v??category)),
                const SizedBox(height:7),
                SwitchListTile.adaptive(
                  value:private,onChanged:(v)=>setSheet(()=>private=v),
                  title:const Text('Keep my request private'),
                  subtitle:const Text('Only authorized ministry members can view it.')),
                if(error!=null)Text(error!,style:TextStyle(
                  color:Theme.of(context).colorScheme.error)),
                const SizedBox(height:14),
                FilledButton.icon(
                  onPressed:saving?null:()async{
                    if(controller.text.trim().length<5){
                      setSheet(()=>error='Please add more details.');return;
                    }
                    setSheet((){saving=true;error=null;});
                    try{
                      await widget.api.submitPrayer(
                        requestText:controller.text.trim(),
                        category:category,isPrivate:private);
                      if(context.mounted)Navigator.pop(context,true);
                    }catch(e){
                      setSheet((){error='$e';saving=false;});
                    }
                  },
                  icon:const Icon(Icons.send_outlined),
                  label:Text(saving?'Submitting…':'Submit request')),
              ])));
      }));
    controller.dispose();
    if(done==true&&mounted){
      setState(reload);
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content:Text('Your prayer request was submitted securely.')));
    }
  }
}
