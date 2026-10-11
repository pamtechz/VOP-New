import 'package:flutter/material.dart';
import '../core/vop_api.dart';
import '../theme/vop_theme.dart';
import '../widgets/vop_ui.dart';

class CertificatesScreen extends StatefulWidget {
  const CertificatesScreen({required this.api,super.key});
  final VopApi api;
  @override State<CertificatesScreen> createState()=>_CertificatesScreenState();
}
class _CertificatesScreenState extends State<CertificatesScreen>{
  late Future<Map<String,dynamic>> certificate;
  @override void initState(){super.initState();reload();}
  void reload(){certificate=widget.api.certificates();}
  List<Map<String,dynamic>> rows(dynamic input)=>input is List
    ?input.whereType<Map>().map((item)=>Map<String,dynamic>.from(item)).toList()
    :[];
  @override Widget build(BuildContext context)=>Scaffold(
    appBar:AppBar(title:const Text('My Certificates'),
      actions:[IconButton(tooltip:'Refresh certificates',
        onPressed:()=>setState(reload),icon:const Icon(Icons.refresh))]),
    body:FutureBuilder<Map<String,dynamic>>(
      future:certificate,builder:(context,s){
        if(s.connectionState!=ConnectionState.done)return const VopSkeleton(rows:2);
        if(s.hasError)return VopEmpty(icon:Icons.wifi_off,
          message:'${s.error}',onRetry:()=>setState(reload));
        final items=rows(s.data?['certificates']);
        final review=s.data?['review'] is Map
          ?Map<String,dynamic>.from(s.data!['review'] as Map):<String,dynamic>{};
        return ListView(padding:const EdgeInsets.all(18),children:[
          const VopHeroCard(title:'Your learning milestones',
            kicker:'OFFICIAL VOP CREDENTIALS',
            description:'Every certificate is approved, issued and verified through your organisation.',
            icon:Icons.workspace_premium_outlined),
          const SizedBox(height:20),
          VopSectionTitle('Earned certificates',
            subtitle:'${items.length} issued'),
          if(items.isEmpty)Card(child:Padding(
            padding:const EdgeInsets.all(20),
            child:Column(children:[
              Icon(Icons.workspace_premium_outlined,size:44,
                color:Theme.of(context).colorScheme.primary),
              const SizedBox(height:12),
              Text(review['status']=='approved'
                ?'Approval complete — publication pending'
                :review.isNotEmpty
                  ?'Your certificate is awaiting organisational review.'
                  :'No certificate has been issued yet.',
                textAlign:TextAlign.center,
                style:const TextStyle(fontWeight:FontWeight.w700)),
              const SizedBox(height:8),
              const Text('Complete the required studies and assessments to become eligible.',
                textAlign:TextAlign.center),
            ]))),
          ...items.map((item)=>Card(margin:const EdgeInsets.only(bottom:13),
            child:Padding(padding:const EdgeInsets.all(18),
              child:Column(crossAxisAlignment:CrossAxisAlignment.stretch,children:[
                Container(height:95,decoration:BoxDecoration(
                  gradient:const LinearGradient(
                    colors:[VopColors.navyDeep,VopColors.navyBright]),
                  borderRadius:BorderRadius.circular(12)),
                  child:const Column(mainAxisAlignment:MainAxisAlignment.center,children:[
                    Icon(Icons.workspace_premium,color:VopColors.goldLight,size:42),
                    SizedBox(height:5),
                    Text('VOICE OF PROPHECY',style:TextStyle(
                      color:Colors.white,fontWeight:FontWeight.w800,letterSpacing:1.4)),
                  ])),
                const SizedBox(height:15),
                Text('${item['courseName']??item['programTitle']??'Certificate'}',
                  style:Theme.of(context).textTheme.titleLarge),
                const SizedBox(height:7),
                Text('Issued to: ${item['candidateName']??''}'),
                Text('Certificate number: ${item['certificateNumber']??''}'),
                Text('Status: ${item['status']??''}'),
                const SizedBox(height:11),
                Text('This is a record of the official credential. '
                  'The complete designed certificate artwork is managed by the issuing organisation.',
                  style:TextStyle(fontSize:11.5,height:1.5,
                    color:Theme.of(context).colorScheme.onSurfaceVariant)),
              ]))),
        ]);
      }),
  );
}
