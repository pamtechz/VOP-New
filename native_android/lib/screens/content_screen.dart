import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import '../core/vop_api.dart';
import '../theme/vop_theme.dart';
import '../widgets/vop_ui.dart';

enum VopContentKind {resources,events,radio,announcements}
extension VopContentLabel on VopContentKind {
  String get title=>switch(this){
    VopContentKind.resources=>'Study Library',
    VopContentKind.events=>'Events',
    VopContentKind.radio=>'Radio & Media',
    VopContentKind.announcements=>'Announcements',
  };
  String get subtitle=>switch(this){
    VopContentKind.resources=>'Books, study resources and inspiring reading',
    VopContentKind.events=>'Gatherings, services and upcoming activities',
    VopContentKind.radio=>'Audio programmes, Bible teaching and messages of hope',
    VopContentKind.announcements=>'Stay informed about the VOP community',
  };
  IconData get icon=>switch(this){
    VopContentKind.resources=>Icons.local_library_outlined,
    VopContentKind.events=>Icons.event_outlined,
    VopContentKind.radio=>Icons.radio_outlined,
    VopContentKind.announcements=>Icons.campaign_outlined,
  };
}

class VopContentScreen extends StatefulWidget {
  const VopContentScreen({required this.api,required this.kind,
    this.embedded=false,super.key});
  final VopApi api;
  final VopContentKind kind;
  final bool embedded;
  @override State<VopContentScreen> createState()=>_VopContentScreenState();
}
class _VopContentScreenState extends State<VopContentScreen> {
  late Future<Map<String,dynamic>> content;
  String filter='';
  @override void initState(){super.initState();reload();}
  void reload(){content=switch(widget.kind){
    VopContentKind.resources=>widget.api.resources(),
    VopContentKind.events=>widget.api.events(),
    VopContentKind.radio=>widget.api.radio(),
    VopContentKind.announcements=>widget.api.announcements(),
  };}
  String value(Map<String,dynamic> row,String key)=>(row[key]??'').toString().trim();
  List<Map<String,dynamic>> rows(dynamic input)=>input is List
    ?input.whereType<Map>().map((row)=>Map<String,dynamic>.from(row)).toList()
    :<Map<String,dynamic>>[];
  @override Widget build(BuildContext context){
    final body=FutureBuilder<Map<String,dynamic>>(
      future:content,builder:(context,s){
        if(s.connectionState!=ConnectionState.done)return const VopSkeleton();
        if(s.hasError)return VopEmpty(icon:Icons.wifi_off,
          message:'${s.error}',onRetry:()=>setState(reload));
        final items=rows(s.data?['items']);
        final filtered=items.where((item)=>item.values
          .whereType<String>().join(' ').toLowerCase()
          .contains(filter.toLowerCase())).toList();
        return RefreshIndicator(onRefresh:()async{setState(reload);await content;},
          child:ListView(padding:const EdgeInsets.all(18),children:[
            VopHeroCard(title:widget.kind.title,
              description:widget.kind.subtitle,
              kicker:'VOICE OF PROPHECY',
              icon:widget.kind.icon,
              cta:'Explore',onTap:()=>FocusScope.of(context).unfocus()),
            const SizedBox(height:18),
            TextField(
              onChanged:(text)=>setState(()=>filter=text),
              decoration:InputDecoration(
                hintText:'Search '+widget.kind.title.toLowerCase(),
                prefixIcon:const Icon(Icons.search_rounded))),
            const SizedBox(height:14),
            VopSectionTitle(widget.kind.title,
              subtitle:'${filtered.length} available'),
            if(filtered.isEmpty)SizedBox(height:220,child:VopEmpty(
              icon:widget.kind.icon,
              message:filter.isNotEmpty?'No matching results.':
                'Nothing has been published here yet.')),
            ...filtered.map(_item),
            const SizedBox(height:30),
          ]));
      });
    return widget.embedded?body:Scaffold(
      appBar:AppBar(title:Text(widget.kind.title)),body:body);
  }
  Widget _item(Map<String,dynamic> row){
    final title=widget.kind==VopContentKind.resources?value(row,'name'):value(row,'title');
    final description=value(row,'description').isNotEmpty
      ?value(row,'description'):value(row,'body');
    final image=widget.kind==VopContentKind.radio?value(row,'posterUrl'):value(row,'imageUrl');
    final caption=widget.kind==VopContentKind.resources
      ?[value(row,'category'),value(row,'author')].where((x)=>x.isNotEmpty).join(' · ')
      :widget.kind==VopContentKind.radio
        ?value(row,'speaker'):widget.kind==VopContentKind.events
          ?value(row,'location'):'VOP UPDATE';
    final url=widget.kind==VopContentKind.resources?value(row,'url')
      :widget.kind==VopContentKind.radio
        ?[value(row,'streamUrl'),value(row,'audioUrl'),value(row,'videoUrl')]
          .firstWhere((x)=>x.isNotEmpty,orElse:()=>'')
        :'';
    return Card(margin:const EdgeInsets.only(bottom:12),
      clipBehavior:Clip.antiAlias,
      child:InkWell(onTap:()=>_details(title,description,row,url),
        child:Padding(padding:const EdgeInsets.all(12),
          child:Row(crossAxisAlignment:CrossAxisAlignment.start,children:[
            ClipRRect(borderRadius:BorderRadius.circular(12),
              child:SizedBox(width:76,height:80,
                child:image.startsWith('https://')
                  ?Image.network(image,fit:BoxFit.cover,
                    errorBuilder:(_,error,stack)=>_icon())
                  :_icon())),
            const SizedBox(width:13),
            Expanded(child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
              Text(caption.toUpperCase(),maxLines:1,
                style:const TextStyle(color:VopColors.gold,fontSize:9,
                  fontWeight:FontWeight.w800,letterSpacing:.85)),
              const SizedBox(height:5),
              Text(title,maxLines:2,overflow:TextOverflow.ellipsis,
                style:const TextStyle(fontSize:14,fontWeight:FontWeight.w800)),
              const SizedBox(height:5),
              Text(description,maxLines:2,overflow:TextOverflow.ellipsis,
                style:TextStyle(fontSize:11.5,height:1.45,
                  color:Theme.of(context).colorScheme.onSurfaceVariant)),
            ])),
            const Icon(Icons.chevron_right_rounded,size:22),
          ]))),
    );
  }
  Widget _icon()=>Container(color:Theme.of(context).colorScheme.primaryContainer,
    child:Icon(widget.kind.icon,size:29,
      color:Theme.of(context).colorScheme.primary));
  void _details(String title,String description,Map<String,dynamic> item,String url){
    Navigator.push(context,MaterialPageRoute<void>(builder:(_)=>Scaffold(
      appBar:AppBar(title:Text(widget.kind.title)),
      body:ListView(padding:const EdgeInsets.all(21),children:[
        Icon(widget.kind.icon,size:52,color:VopColors.gold),
        const SizedBox(height:20),
        Text(title,style:Theme.of(context).textTheme.headlineSmall),
        const SizedBox(height:14),
        Text(description,style:const TextStyle(fontSize:15,height:1.6)),
        if(widget.kind==VopContentKind.events)...[
          const SizedBox(height:18),
          ListTile(leading:const Icon(Icons.event),
            title:Text(value(item,'startAt'))),
          ListTile(leading:const Icon(Icons.place_outlined),
            title:Text(value(item,'location'))),
        ],
        if(url.startsWith('https://'))...[
          const SizedBox(height:24),
          FilledButton.icon(
            icon:Icon(widget.kind==VopContentKind.radio
              ?Icons.play_arrow_rounded:Icons.open_in_new),
            onPressed:()=>_open(url),
            label:Text(widget.kind==VopContentKind.radio
              ?'Play programme':'Open resource')),
        ],
      ]),
    )));
  }
  Future<void> _open(String raw)async{
    final uri=Uri.tryParse(raw);
    if(uri==null||uri.scheme!='https')return;
    if(!await launchUrl(uri,mode:LaunchMode.externalApplication)&&mounted){
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content:Text('This resource could not be opened.')));
    }
  }
}
