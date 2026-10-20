import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import '../core/vop_api.dart';
import '../widgets/vop_ui.dart';
import 'workspace_records_screen.dart';
import 'mentor_screen.dart';
import 'learner_support_screen.dart';
import 'payment_checkout_screen.dart';

class WorkspaceOperationsScreen extends StatefulWidget {
  const WorkspaceOperationsScreen({required this.api,required this.kind,required this.workspace,super.key});
  final VopApi api;
  final String kind;
  final Map<String,dynamic> workspace;
  @override State<WorkspaceOperationsScreen> createState()=>_WorkspaceOperationsState();
}
class _WorkspaceOperationsState extends State<WorkspaceOperationsScreen>{
  late Future<Map<String,dynamic>> future;
  int tab=0;
  String language='',search='',organization='';
  bool busy=false;
  String? error;
  bool get superAdmin=>widget.workspace['isSuperAdmin']==true;
  Map<String,dynamic> get scope=>{if(organization.isNotEmpty)'organizationId':organization};
  List<String> get tabs=>switch(widget.kind){
    'mentoring'=>['Learners','Mentors','Assignments','Support','Conversations','Automation'],
    'payments'=>['Charges','History',if(superAdmin)...['Transactions','Providers','Payable items','Reconciliation']],
    'translations'=>['Translations','Proposals',if(superAdmin)...['Collaborators','Applications','Access requests']],
    'organization'=>['Members','Invitations','Audit'],
    _=>[widget.kind=='permissions'?'Permissions':'Audit history'],
  };
  @override void initState(){super.initState();organization='${widget.workspace['organizationId']??''}';
    final languages=recordRows(recordMap(widget.workspace['options'])['languages']).where((row)=>row['value']!='en');
    language=languages.isEmpty?'':'${languages.first['value']}';reload();}
  void reload(){future=load();}
  Future<Map<String,dynamic>> admin(String route,Map<String,Object?> body)=>widget.api.action('/api/admin/$route',{...scope,...body});
  Future<Map<String,dynamic>> mentor(String action,[Map<String,Object?> body=const {}])=>widget.api.action('/api/mentorship',{'action':action,...scope,...body});
  Future<Map<String,dynamic>> load()=>switch(widget.kind){
    'prayer'=>widget.api.ministryPrayers(),
    'portfolio'=>widget.api.action('/api/engagement',{'action':'portfolioReviewQueue'}).then((result)=>{...result,'items':result['learners']}),
    'mentoring'=>mentor(['listStudents','listMentors','listAssignments','listSupportRequests','listConversations','getAutomationSettings'][tab]),
    'payments'=>tab==5?Future.value({'ok':true,'items':<dynamic>[]}):widget.api.action('/api/payments/${['catalog','history','admin/transactions','admin/providers','admin/payable-items'][tab]}',{'action':'list',...scope}),
    'translations'=>tab==0?widget.api.action('/api/localization',{'action':'list','locale':language}):admin('localization',{'action':['','listProposals','listCollaborators','listApplications','listAccessRequests'][tab],'languageId':language}),
    'permissions'=>widget.api.adminPermissions(),
    'organization'=>admin('organizations',{'action':['listMembers','listInvites','listAudit'][tab]}),
    _=>organization.isNotEmpty?admin('organizations',{'action':'listAudit'}):admin('audit',{}),
  };
  Future<void> run(Future<void> Function() action)async{
    if(busy)return;setState((){busy=true;error=null;});
    try{await action();if(mounted)setState(reload);}catch(e){if(mounted)setState(()=>error='$e');}
    finally{if(mounted)setState(()=>busy=false);}
  }
  Future<void> form(String title,List<Map<String,dynamic>> fields,Map<String,dynamic> initial,Future<void> Function(Map<String,dynamic>) save,{Map<String,dynamic>? options,String submitLabel='Save changes'})async{
    await Navigator.push(context,MaterialPageRoute<void>(builder:(_)=>RecordEditor(api:widget.api,title:title,fields:fields,options:options??recordMap(widget.workspace['options']),initial:initial,onSave:save,submitLabel:submitLabel)));
    if(mounted)setState(reload);
  }
  Map<String,dynamic> field(String key,String label,{String type='text',List<String>? choices,String? source,bool required=false})=>{'key':key,'label':label,'type':type,if(choices!=null)'choices':choices,if(source!=null)'source':source,'required':required};
  Future<void> create(Map<String,dynamic> data)async{
    if(widget.kind=='mentoring'){
      if(tab==2){
        await run(()async{
          final results=await Future.wait([mentor('listStudents'),mentor('listMentors')]);
          final options={...recordMap(widget.workspace['options']),
            'students':recordRows(results[0]['items']).map((v)=>{'value':v['uid'],'label':recordTitle(v)}).toList(),
            'mentors':recordRows(results[1]['items']).map((v)=>{'value':v['uid'],'label':recordTitle(v)}).toList()};
          if(mounted)await form('Assign mentor',[field('studentId','Learner',type:'choice',source:'students',required:true),field('mentorId','Mentor',type:'choice',source:'mentors',required:true),field('notes','Notes',type:'multiline')],{},(v)async{await mentor('assign',v);},options:options);
        });
      }else if(tab==5){await form('Mentoring automation',[field('enabled','Enabled',type:'boolean'),field('channel','Channel',type:'choice',choices:['in_app','email']),field('minAverageScore','Minimum average score',type:'number'),field('maxProgressPercent','Maximum progress (%)',type:'number'),field('cooldownDays','Cooldown days',type:'number')],recordMap(data['item']),(v)async{await mentor('saveAutomationSettings',v);});}
    }else if(widget.kind=='translations'){
      if(tab==0)await translationForm(null);
      if(tab==2)await form('Invite collaborator',[field('email','Email',required:true),field('languages','Assigned language codes',type:'strings'),field('roles','Roles',type:'strings')],{},(v)async{await admin('localization',{'action':'inviteCollaborator',...v});});
    }else if(widget.kind=='organization'&&tab==1){
      Map<String,dynamic>? invitation;
      await form('Create invitation',[field('email','Email (leave blank for a shareable learner link)'),field('role','Role',type:'choice',choices:['learner','mentor','teacher','editor','admin'],required:true)],{},(v)async{
        final email='${v['email']??''}'.trim();
        final result=await admin('organizations',{'action':email.isEmpty?'createMemberInvite':'sendInvite',...v});invitation=recordMap(result['item']);
      });
      if(mounted&&invitation!=null)details(invitation!);
    }else if(widget.kind=='payments'&&tab==4){
      await payableForm(null);
    }
  }
  Future<void> translationForm(Map<String,dynamic>? item)async{
    await form(superAdmin?'Edit translation':'Propose translation',[
      field('key','Translation key',required:true),field('value','Translation',type:'multiline',required:true),
      if(superAdmin)field('status','Status',type:'choice',choices:['draft','review','published']),
      if(!superAdmin)field('reason','Reason',type:'multiline'),
    ],item??{},(v)async{
      if(superAdmin){await widget.api.action('/api/localization',{'action':'save','locale':language,...v});}
      else{await admin('localization',{'action':'submitProposal','languageId':language,'key':v['key'],'proposedValue':v['value'],'reason':v['reason']});}
    });
  }
  Future<void> payableForm(Map<String,dynamic>? item)async{
    await form(item==null?'New charge':'Edit charge',[
      field('name','Name',required:true),field('description','Description',type:'multiline'),field('itemType','Charge type',required:true),
      field('itemId','Linked item reference'),field('amountDecimal','Amount',type:'number',required:true),field('currency','Currency',required:true),
      field('organizationId','Organization',type:'choice',source:'organizations'),field('active','Active',type:'boolean'),field('repeatable','Repeatable',type:'boolean'),
      field('allowedMethods','Payment methods',type:'strings'),field('allowedProviders','Providers',type:'strings'),
    ],item??{},(v)async{await widget.api.action('/api/payments/admin/payable-items',{'action':'upsert','item':{...v,if(item!=null)'id':item['id']}});});
  }
  Future<void> checkout(Map<String,dynamic> item)async{
    final methods=(item['allowedMethods'] as List? ?? []).map((v)=>v.toString()).toList();
    if(methods.isEmpty){setState(()=>error='No configured payment method is available for this charge.');return;}
    Map<String,dynamic>? result;
    await form('Pay ${recordTitle(item)}',[field('paymentMethod','Payment method',type:'choice',choices:methods,required:true),
      {'key':'quote','type':'paymentQuote','quotes':item['methodQuotes'],'currency':item['currency'],'amountDecimal':item['amountDecimal']},field('phone','Mobile money phone number')],{},(v)async{
      result=await widget.api.action('/api/payments/checkout',{'payableItemId':item['id'],...scope,...v});
    },submitLabel:'Continue to payment');
    if(!mounted||result==null)return;
    final checkout=recordMap(result!['checkout']);
    if(checkout['mode']=='inline'){
      await Navigator.push(context,MaterialPageRoute<void>(builder:(_)=>PaymentCheckoutScreen(api:widget.api,checkout:checkout,payment:recordMap(result!['payment']))));
      if(mounted)setState(reload);
      return;
    }
    final url=Uri.tryParse('${checkout['url']??checkout['redirectUrl']??''}');
    if(url!=null&&url.scheme=='https')await launchUrl(url,mode:LaunchMode.inAppBrowserView);
    if(mounted)details(recordMap(result!['payment']));
  }
  Future<void> performance(Map<String,dynamic> item)async{
    await run(()async{final result=await mentor('performance',{'studentId':item['uid']??item['studentId']});if(mounted)details(recordMap(result['item']));});
  }
  void details(Map<String,dynamic> item){
    void visit(List<Widget> output,Map<String,dynamic> data,[String prefix='']){
      for(final entry in data.entries){if(entry.value is Map){visit(output,recordMap(entry.value),'$prefix${humanLabel(entry.key)} · ');}
        else if(entry.value is String||entry.value is num||entry.value is bool)output.add(ListTile(title:Text('$prefix${humanLabel(entry.key)}'),subtitle:SelectableText('${entry.value}')));}
    }
    final children=<Widget>[];visit(children,item);
    showModalBottomSheet<void>(context:context,isScrollControlled:true,builder:(ctx)=>SafeArea(child:ConstrainedBox(constraints:BoxConstraints(maxHeight:MediaQuery.sizeOf(ctx).height*.85),child:ListView(padding:const EdgeInsets.all(20),children:children))));
  }
  Future<void> editSupport(Map<String,dynamic> item)=>form('Manage support request',[
    field('status','Status',type:'choice',choices:['open','in_progress','resolved','closed']),field('priority','Priority',type:'choice',choices:['low','normal','high','urgent']),
    field('followUpStatus','Follow-up',type:'choice',choices:['new','contacted','scheduled','completed','not_required']),field('followUpScheduledAt','Follow-up date and time',type:'datetime'),
  ],item,(v)async{await mentor('updateSupportRequest',{'requestId':item['id'],...v});});
  Future<void> portfolio(Map<String,dynamic> item)async{
    await run(()async{
      final result=await widget.api.action('/api/engagement',{'action':'portfolioGet','learnerId':item['uid']});
      final records=recordMap(result['portfolio']);
      final requirements=recordRows(result['requirements']);
      if(!mounted)return;
      await form('Review ${recordTitle(item)}',[{'key':'submission','type':'recordDetails','label':'Submitted portfolio','data':records},
        field('requirementId','Requirement',type:'choice',source:'requirements',required:true),
        field('decision','Decision',type:'choice',choices:['approved','changes_requested'],required:true),field('notes','Review notes',type:'multiline')],{},
        (value)async{await widget.api.action('/api/engagement',{'action':'portfolioSignoff','learnerId':item['uid'],...value});},
        options:{'requirements':requirements.map((v)=>{'value':v['id'],'label':recordTitle(v)}).toList()});
    });
  }
  Widget rowActions(Map<String,dynamic> item)=>Wrap(children:[
    if(widget.kind=='portfolio')IconButton(tooltip:'Review portfolio',onPressed:()=>portfolio(item),icon:const Icon(Icons.fact_check_outlined)),
    if(widget.kind=='prayer')IconButton(tooltip:'Update prayer status',onPressed:()=>form('Prayer status',[field('status','Status',type:'choice',choices:['Received','Praying','Answered'],required:true)],{'status':item['status']},(value)async{await widget.api.action('/api/prayer',{'action':'status','id':item['id'],...value});}),icon:const Icon(Icons.edit_outlined)),
    if(widget.kind=='mentoring'&&tab==0)IconButton(tooltip:'Performance',onPressed:()=>performance(item),icon:const Icon(Icons.insights)),
    if(widget.kind=='mentoring'&&tab==3)IconButton(tooltip:'Manage request',onPressed:()=>editSupport(item),icon:const Icon(Icons.edit_outlined)),
    if(widget.kind=='translations'&&tab==0)IconButton(tooltip:superAdmin?'Edit':'Propose',onPressed:()=>translationForm(item),icon:const Icon(Icons.edit_outlined)),
    if(widget.kind=='translations'&&tab==1&&superAdmin)IconButton(tooltip:'Approve proposal',onPressed:()=>run(()async{await admin('localization',{'action':'approveProposal','languageId':language,'proposalId':item['id']});}),icon:const Icon(Icons.check)),
    if(widget.kind=='translations'&&tab==1)IconButton(tooltip:'Review proposal',onPressed:()=>form('Review translation proposal',[field('decision','Decision',type:'choice',choices:['recommend','reject'],required:true)],{},(v)async{await admin('localization',{'action':'recommend','languageId':language,'proposalId':item['id'],...v});}),icon:const Icon(Icons.rate_review_outlined)),
    if(widget.kind=='translations'&&tab==2&&superAdmin)IconButton(tooltip:'Manage collaborator',onPressed:()=>form('Collaborator access',[field('roles','Roles',type:'strings'),field('languages','Assigned languages',type:'strings'),field('status','Status',type:'choice',choices:['active','inactive'],required:true)],item,(v)async{await admin('localization',{'action':'setCollaborator','uid':item['uid']??item['id'],...v});}),icon:const Icon(Icons.edit_outlined)),
    if(widget.kind=='translations'&&[3,4].contains(tab)&&superAdmin&&item['status']=='pending')IconButton(tooltip:'Review request',onPressed:()=>form('Review request',[field('decision','Decision',type:'choice',choices:['approve','reject'],required:true)],{},(v)async{await admin('localization',{'action':tab==3?'setApplication':'reviewAccessRequest',if(tab==3)'uid':item['uid']??item['id'] else 'requestId':item['id'],...v});}),icon:const Icon(Icons.rule_outlined)),
    if(widget.kind=='payments'&&tab==0)TextButton(onPressed:()=>checkout(item),child:const Text('Pay')),
    if(widget.kind=='payments'&&tab==1)IconButton(tooltip:'Receipt',onPressed:()=>run(()async{final result=await widget.api.action('/api/payments/receipt',{'paymentId':item['id']});if(mounted)details(recordMap(result['item']));}),icon:const Icon(Icons.receipt_long)),
    if(widget.kind=='payments'&&tab==3)Switch(value:item['enabled']==true,onChanged:item['configured']!=true?null:(value)=>run(()async{await widget.api.action('/api/payments/admin/providers',{'action':'configure','provider':{'key':item['key'],'enabled':value,'methods':item['methods']}});})),
    if(widget.kind=='payments'&&tab==4)IconButton(tooltip:'Edit charge',onPressed:()=>payableForm(item),icon:const Icon(Icons.edit_outlined)),
    if(widget.kind=='organization'&&tab==0&&item['role']!='owner')IconButton(tooltip:'Change membership',onPressed:()=>form('Organization membership',[field('role','Role',type:'choice',choices:['learner','mentor','teacher','editor','admin','viewer']),field('active','Active',type:'boolean')],item,(v)async{await admin('organizations',{'action':'setMember','uid':item['uid'],...v});}),icon:const Icon(Icons.edit_outlined)),
    if(widget.kind=='organization'&&tab==1&&item['status']=='pending')IconButton(tooltip:'Cancel invitation',onPressed:()=>run(()async{await admin('organizations',{'action':'cancelInvite','token':item['token']??item['id']});}),icon:const Icon(Icons.cancel_outlined)),
  ]);
  Widget matrix(Map<String,dynamic> data){
    final values=recordMap(data['matrix']);final roles=(data['roles'] as List? ?? []);final actions=(data['actions'] as List? ?? []);final resources=(data['resources'] as List? ?? []);
    return ListView(padding:const EdgeInsets.all(16),children:[for(final role in roles)ExpansionTile(title:Text(humanLabel('$role')),children:[
      for(final resource in resources)Wrap(crossAxisAlignment:WrapCrossAlignment.center,children:[SizedBox(width:160,child:Text(humanLabel('$resource'))),
        for(final action in actions)Row(mainAxisSize:MainAxisSize.min,children:[Checkbox(value:(recordMap(values[role])[resource] as List? ?? []).contains(action),
          onChanged:role=='super_admin'||busy?null:(selected){final permissions=recordMap(values[role]);final list=List<dynamic>.from(permissions[resource] as List? ?? []);selected==true?list.add(action):list.remove(action);permissions['$resource']=list;values['$role']=permissions;data['matrix']=values;setState((){});}),Text('$action')])]),
    ]),FilledButton(onPressed:busy?null:()=>run(()async{await admin('permissions',{'action':'save','matrix':values});}),child:const Text('Save permissions'))]);
  }
  @override Widget build(BuildContext context)=>Scaffold(appBar:AppBar(title:Text({'mentoring':'Mentoring & insights','payments':'Payments & receipts','translations':'Translation Studio','permissions':'Permissions','organization':'Organization management','prayer':'Prayer ministry inbox','portfolio':'Portfolio reviews'}[widget.kind]??'Audit history'),actions:[IconButton(tooltip:'Refresh',onPressed:busy?null:()=>setState(reload),icon:const Icon(Icons.refresh))]),
    body:Column(children:[
      if(error!=null)Padding(padding:const EdgeInsets.all(12),child:Text(error!,style:TextStyle(color:Theme.of(context).colorScheme.error))),
      if(busy)const LinearProgressIndicator(),
      if(superAdmin&&['mentoring','organization','audit'].contains(widget.kind))Padding(padding:const EdgeInsets.all(12),child:DropdownButtonFormField<String>(initialValue:organization.isEmpty?null:organization,decoration:const InputDecoration(labelText:'Organization'),isExpanded:true,
        items:recordRows(recordMap(widget.workspace['options'])['organizations']).map((v)=>DropdownMenuItem(value:'${v['value']}',child:Text('${v['label']}'))).toList(),onChanged:(v)=>setState((){organization=v??'';reload();}))),
      if(widget.kind=='translations')Padding(padding:const EdgeInsets.all(12),child:DropdownButtonFormField<String>(initialValue:language.isEmpty?null:language,isExpanded:true,decoration:const InputDecoration(labelText:'Language'),
        items:recordRows(recordMap(widget.workspace['options'])['languages']).where((v)=>v['value']!='en').map((v)=>DropdownMenuItem(value:'${v['value']}',child:Text('${v['label']}'))).toList(),onChanged:(v)=>setState((){language=v??'';reload();}))),
      if(tabs.length>1)SingleChildScrollView(scrollDirection:Axis.horizontal,child:Row(children:tabs.asMap().entries.map((e)=>Padding(padding:const EdgeInsets.all(6),child:ChoiceChip(label:Text(e.value),selected:tab==e.key,onSelected:(_)=>setState((){tab=e.key;error=null;reload();})))).toList())),
      Expanded(child:FutureBuilder<Map<String,dynamic>>(future:future,builder:(context,s){
        if(s.connectionState!=ConnectionState.done)return const VopSkeleton();if(s.hasError)return VopEmpty(icon:Icons.error_outline,message:'${s.error}',onRetry:()=>setState(reload));
        final data=s.data??{};
        if(widget.kind=='permissions')return matrix(data);
        if(widget.kind=='payments'&&tab==5)return ListView(padding:const EdgeInsets.all(24),children:[const Text('Check pending payments with the configured providers and apply verified results.'),const SizedBox(height:16),FilledButton.icon(onPressed:busy?null:()=>run(()async{final result=await widget.api.action('/api/payments/admin/reconcile',{});if(mounted)details(result);}),icon:const Icon(Icons.sync),label:const Text('Run reconciliation'))]);
        final items=recordRows(data['items']);
        final canAdd=(widget.kind=='mentoring'&&[2,5].contains(tab))||(widget.kind=='translations'&&[0,2].contains(tab))||(widget.kind=='organization'&&tab==1)||(widget.kind=='payments'&&tab==4);
        return Column(children:[if(canAdd)Padding(padding:const EdgeInsets.all(12),child:FilledButton.icon(onPressed:busy?null:()=>create(data),icon:const Icon(Icons.add),label:Text(widget.kind=='mentoring'&&tab==5?'Edit automation':'Add'))),
          Expanded(child:items.isEmpty?ListView(padding:const EdgeInsets.all(20),children:[if(data['item'] is Map)...recordMap(data['item']).entries.map((e)=>ListTile(title:Text(humanLabel(e.key)),subtitle:Text('${e.value}')))else const Text('No records found.')]):
            ListView.separated(padding:const EdgeInsets.all(12),itemCount:items.length,separatorBuilder:(_,__)=>const Divider(),itemBuilder:(_,i){final item=items[i];return ListTile(
              title:Text('${item['title']??item['name']??item['displayName']??item['candidateName']??item['subject']??item['key']??item['action']??item['email']??item['id']??''}'),
              subtitle:Text('${item['value']??item['message']??item['status']??item['description']??item['email']??''}',maxLines:2,overflow:TextOverflow.ellipsis),trailing:rowActions(item),
              onTap:(){if(widget.kind=='mentoring'&&tab==3){Navigator.push(context,MaterialPageRoute<void>(builder:(_)=>SupportThreadScreen(api:widget.api,request:item)));}
                else if(widget.kind=='mentoring'&&tab==4){Navigator.push(context,MaterialPageRoute<void>(builder:(_)=>MentorConversation(api:widget.api,data:item)));}else{details(item);}});})),
        ]);
      })),
    ]));
}
