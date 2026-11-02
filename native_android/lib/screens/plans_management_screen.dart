import 'package:flutter/material.dart';
import '../core/vop_api.dart';
import '../widgets/vop_ui.dart';
import '../widgets/vop_desktop_layout.dart';
import 'workspace_records_screen.dart';
import 'workspace_operations_screen.dart';

class PlansManagementScreen extends StatefulWidget{
  const PlansManagementScreen({required this.api,this.organizationId,super.key});
  final VopApi api;
  final String? organizationId;
  @override State<PlansManagementScreen> createState()=>_PlansState();
}
class _PlansState extends State<PlansManagementScreen>{
  late Future<List<Map<String,dynamic>>> future;
  Map<String,dynamic> get scope=>{if(widget.organizationId?.isNotEmpty==true)'organizationId':widget.organizationId};
  @override void initState(){super.initState();reload();}
  void reload(){future=Future.wait([widget.api.workspace(),widget.api.adminSubscription(organizationId:widget.organizationId),widget.api.adminPlans(organizationId:widget.organizationId)]);}
  Future<Map<String,dynamic>> request(String action,Map<String,dynamic> data)=>widget.api.action('/api/admin/plans',{'action':action,...scope,...data});
  Future<void> editor(String title,List<Map<String,dynamic>> fields,Map<String,dynamic> initial,Map<String,dynamic> options,Future<void> Function(Map<String,dynamic>) save)async{
    await Navigator.push(context,MaterialPageRoute<void>(builder:(_)=>RecordEditor(api:widget.api,title:title,fields:fields,initial:initial,options:options,onSave:save)));
    if(mounted)setState(reload);
  }
  Future<void> editPlan(Map<String,dynamic> workspace,[Map<String,dynamic>? item])async{
    final options=recordMap(workspace['options']);
    await editor(item==null?'New subscription package':'Edit ${recordTitle(item)}',[
      {'key':'name','label':'Name','required':true},{'key':'description','label':'Description','type':'multiline'},
      {'key':'priceUsd','label':'Price in USD','type':'number','required':true},
      {'key':'interval','label':'Billing interval','type':'choice','choices':['month','year','one_time'],'required':true},
      {'key':'active','label':'Available','type':'boolean'},{'key':'defaultForUnsubscribed','label':'Default free package','type':'boolean'},
      {'key':'sortOrder','label':'Display order','type':'number'},
      {'key':'quotas','label':'Usage limits (blank or -1 means unlimited)','type':'object','fields':recordRows(options['subscriptionQuotas']).map((v)=>{'key':v['key'],'label':v['label'],'type':'number'}).toList()},
      {'key':'features','label':'Features','type':'object','fields':recordRows(options['subscriptionFeatures']).map((v)=>{'key':v['key'],'label':v['label'],'type':'boolean'}).toList()},
    ],item??{'active':true},options,(value)async{if(item==null){await widget.api.adminCreatePlan(value);}else{await widget.api.adminUpdatePlan('${item['id']}',value);}});
  }
  Future<void> billingSettings(Map<String,dynamic> workspace)async{
    try{
      final result=await request('getBillingSettings',{});if(!mounted)return;
      await editor('Platform billing settings',[
        {'key':'subscriptionsEnabled','label':'Subscriptions enabled','type':'boolean'},
        {'key':'usdToZmwRate','label':'USD to ZMW rate','type':'number'},
        {'key':'fxSource','label':'Rate source'},{'key':'fxQuoteTtlMinutes','label':'Quote validity (minutes)','type':'number'},
        {'key':'subscriptionAudience','label':'Subscription audiences','type':'object','fields':[for(final key in ['learnersCandidates','organizations','churches','districts','conferences','unions']){'key':key,'label':humanLabel(key),'type':'boolean'}]},
        {'key':'globalQuotas','label':'Global limits','type':'object','fields':recordRows(recordMap(workspace['options'])['subscriptionQuotas']).map((v)=>{'key':v['key'],'label':v['label'],'type':'number'}).toList()},
      ],recordMap(result['item']),recordMap(workspace['options']),(value)async{await request('updateBillingSettings',value);});
    }catch(e){showError(e);}
  }
  void showError(Object e){if(mounted)ScaffoldMessenger.of(context).showSnackBar(SnackBar(content:Text('$e')));}
  Future<void> activateFree(Map<String,dynamic> item)async{try{await request('activateFreePlan',{'planId':item['id']});if(mounted)setState(reload);}catch(e){showError(e);}}
  Future<void> assign(Map<String,dynamic> workspace,Map<String,dynamic> item)async{
    await editor('Assign ${recordTitle(item)}',[
      if(widget.organizationId?.isNotEmpty!=true){'key':'organizationId','label':'Organization','type':'choice','source':'organizations','required':true},
      {'key':'activationSource','label':'Activation reason type','type':'choice','choices':['complimentary','manual_override','migration'],'required':true},
      {'key':'overrideReason','label':'Reason for activation without payment','type':'multiline','required':true},
    ],{},recordMap(workspace['options']),(value)async{await request('assignPlan',{'planId':item['id'],...value});});
  Future<void> openPaymentPlan(Map<String,dynamic> workspace,Map<String,dynamic> plan)async{
    await Navigator.push<void>(context,MaterialPageRoute(builder:(_)=>WorkspaceOperationsScreen(
      api:widget.api,kind:'payments',workspace:{...workspace,...scope},
      focusPayableItemId:'subscription_${plan['id']}',
    )));
    if(mounted)setState(reload);
  }
  }
  Future<void> subscriptionAction(Map<String,dynamic> workspace,bool cancel)async{
    await editor(cancel?'Cancel subscription':'Reactivate subscription',[
      {'key':cancel?'reason':'overrideReason','label':'Reason','type':'multiline','required':true},
      if(cancel){'key':'mode','label':'When to cancel','type':'choice','choices':workspace['isSuperAdmin']==true?['period_end','immediate']:['period_end'],'required':true},
    ],{},recordMap(workspace['options']),(value)async{await request(cancel?'cancelSubscription':'reactivateSubscription',value);});
  }
  Future<void> remove(Map<String,dynamic> item)async{
    final yes=await showDialog<bool>(context:context,builder:(ctx)=>AlertDialog(title:Text('Delete ${recordTitle(item)}?'),actions:[TextButton(onPressed:()=>Navigator.pop(ctx,false),child:const Text('Cancel')),FilledButton(onPressed:()=>Navigator.pop(ctx,true),child:const Text('Delete'))]));
    if(yes!=true)return;try{await widget.api.adminDeletePlan('${item['id']}');if(mounted)setState(reload);}catch(e){showError(e);}
  }
  @override Widget build(BuildContext context)=>FutureBuilder<List<Map<String,dynamic>>>(future:future,builder:(context,s){
    final workspace=s.data?.first??{};final superAdmin=workspace['isSuperAdmin']==true;final data=s.data?[1]??{};
    final subscription=recordMap(data['subscription']);final plans=recordRows(s.data?.last['items']);
    final usage=recordMap(data['usage']),quotas=recordMap(data['quotas']);
    final quotaDefinitions=recordRows(recordMap(workspace['options'])['subscriptionQuotas']);
    String limit(dynamic value)=>value==null||(num.tryParse('$value')??-1)<0?'No package limit':'$value';
    return Scaffold(appBar:AppBar(title:const Text('Subscriptions & usage'),actions:[if(superAdmin)IconButton(tooltip:'Billing settings',onPressed:()=>billingSettings(workspace),icon:const Icon(Icons.settings_outlined)),IconButton(tooltip:'Refresh',onPressed:()=>setState(reload),icon:const Icon(Icons.refresh))]),
      floatingActionButton:superAdmin?FloatingActionButton.extended(onPressed:()=>editPlan(workspace),icon:const Icon(Icons.add),label:const Text('New package')):null,
      body:VopDesktopWorkspaceFrame(api:widget.api,child:s.connectionState!=ConnectionState.done?const VopSkeleton():s.hasError?VopEmpty(icon:Icons.error_outline,message:'${s.error}',onRetry:()=>setState(reload)):
          if(!superAdmin&&data['scope']!='platform')
            const Padding(padding:EdgeInsets.only(bottom:12),child:Wrap(spacing:8,runSpacing:6,children:[
              Chip(label:Text('1 · Compare packages')),
              Chip(label:Text('2 · Secure payment')),
              Chip(label:Text('3 · Verified activation')),
            ])),
        ListView(padding:const EdgeInsets.fromLTRB(16,8,16,96),children:[
          VopCard(child:Padding(padding:const EdgeInsets.all(18),child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
            Text(data['scope']=='platform'?'Platform administration':'${data['tenantName']??data['organizationName']??'Current subscription'}',style:Theme.of(context).textTheme.titleLarge),
            Chip(avatar:Icon(['active','trialing'].contains('${subscription['status']}')?Icons.verified_outlined:Icons.info_outline,size:16),
              label:Text(data['subscriptionsEnabled']==false?'Free platform mode':humanLabel('${subscription['status']??'not subscribed'}'))),
            const SizedBox(height:8),
            if(data['subscriptionRequired']==false)const Text('A subscription is not required for this account scope.')
            else Text(subscription.isEmpty?'No active subscription record.':'${subscription['planName']??data['plan']??''} · ${humanLabel('${subscription['status']??''}')}'),
            if(subscription['currentPeriodEnd']!=null)Text('Current term ends: ${subscription['currentPeriodEnd']}'),
            if('${data['billingSuspendedMessage']??''}'.isNotEmpty)Text('${data['billingSuspendedMessage']}'),
            for(final definition in quotaDefinitions)if(usage.containsKey(definition['usageKey']))
              Padding(padding:const EdgeInsets.symmetric(vertical:5),child:Column(
                crossAxisAlignment:CrossAxisAlignment.start,children:[
                  Row(children:[Expanded(child:Text('${definition['label']}')),
                    Text('${usage[definition['usageKey']]} / ${limit(quotas[definition['key']])}')]),
                  if((num.tryParse('${quotas[definition['key']]??-1}')??-1)>=0)
                    LinearProgressIndicator(value:(){
                      final maximum=num.tryParse('${quotas[definition['key']]}')??0;
                      final used=num.tryParse('${usage[definition['usageKey']]??0}')??0;
                      return maximum==0?(used>0?1.0:0.0):(used/maximum).clamp(0,1).toDouble();
                    }()),
                ])),

            if(subscription.isNotEmpty&&data['subscriptionsEnabled']!=false)
              Wrap(spacing:8,children:[
                if(['active','trialing'].contains('${subscription['status']}')&&subscription['cancelAtPeriodEnd']!=true)
                  OutlinedButton.icon(onPressed:()=>subscriptionAction(workspace,true),
                    icon:const Icon(Icons.event_busy_outlined),label:const Text('Cancel at period end')),
                if(subscription['cancelAtPeriodEnd']==true||(superAdmin&&!['active','trialing'].contains('${subscription['status']}')))
                  OutlinedButton.icon(onPressed:()=>subscriptionAction(workspace,false),
                    icon:const Icon(Icons.restore),label:const Text('Keep subscription')),
              ]),
          ]))),
          const Text('Compare package limits. Final payment and activation are confirmed by the server.'),
          const SizedBox(height:20),Text('Available packages',style:Theme.of(context).textTheme.titleLarge),
          if(plans.isEmpty)const Padding(padding:EdgeInsets.all(20),child:Text('No subscription packages are configured for this scope.')),
          for(final item in plans)Padding(padding:const EdgeInsets.symmetric(vertical:8),child:VopCard(child:Padding(padding:const EdgeInsets.all(18),child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
            Wrap(spacing:8,crossAxisAlignment:WrapCrossAlignment.center,children:[
              Text(recordTitle(item),style:Theme.of(context).textTheme.titleMedium),
              if('${item['id']}'=='${data['plan']??subscription['planId']}')const Chip(label:Text('Current')),
            ]),
            Text('${item['billingCurrency']??item['currency']??item['baseCurrency']??''} ${item['billingPrice']??item['priceUsd']??item['price']??'Price unavailable'} · ${humanLabel('${item['interval']??''}')}'),
            if('${item['description']??''}'.isNotEmpty)Text('${item['description']}'),
            for(final definition in quotaDefinitions)if(recordMap(item['quotas']).containsKey(definition['key']))Text('${definition['label']}: ${limit(recordMap(item['quotas'])[definition['key']])}'),
            for(final feature in recordMap(item['features']).entries)if(feature.value==true)Text(humanLabel(feature.key)),
            Wrap(children:[
              if(superAdmin)...[TextButton(onPressed:()=>editPlan(workspace,item),child:const Text('Edit')),TextButton(onPressed:()=>remove(item),child:const Text('Delete')),TextButton(onPressed:()=>assign(workspace,item),child:const Text('Assign with reason'))],
              if(data['scope']!='platform'&&(num.tryParse('${item['priceUsd']??item['price']}')??-1)==0)TextButton(onPressed:()=>activateFree(item),child:const Text('Activate free package')),
              if(data['scope']!='platform'&&(num.tryParse('${item['priceUsd']??item['price']}')??0)>0)
                FilledButton.icon(onPressed:()=>openPaymentPlan(workspace,item),
                  icon:const Icon(Icons.lock_outline),label:const Text('Choose & pay securely')),
            ]),
          ]))))
        ])));
  });
}
