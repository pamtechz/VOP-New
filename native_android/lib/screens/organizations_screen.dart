import 'package:flutter/material.dart';
import '../core/vop_api.dart';
import '../widgets/vop_ui.dart';
import '../widgets/vop_desktop_layout.dart';
import '../widgets/vop_management_list.dart';
import 'workspace_operations_screen.dart';
import 'workspace_records_screen.dart';
import 'plans_management_screen.dart';

class OrganizationsScreen extends StatefulWidget {
  const OrganizationsScreen({required this.api,super.key});
  final VopApi api;
  @override State<OrganizationsScreen> createState()=>_OrganizationsState();
}
class _OrganizationsState extends State<OrganizationsScreen>{
  late Future<List<Map<String,dynamic>>> future;
  String search='';
  @override void initState(){super.initState();reload();}
  void reload(){future=Future.wait([widget.api.workspace(),widget.api.adminOrganizations()]);}
  bool can(Map<String,dynamic> workspace,String action)=>(recordMap(workspace['permissions'])['organizations'] as List? ?? []).contains(action);
  Future<void> edit(Map<String,dynamic> workspace,[Map<String,dynamic>? item])async{
    final superAdmin=workspace['isSuperAdmin']==true;
    await Navigator.push(context,MaterialPageRoute<void>(builder:(_)=>RecordEditor(api:widget.api,title:item==null?'New organization':'Edit ${recordTitle(item)}',
      options:recordMap(workspace['options']),initial:item??{'allowSelfEnrollment':true},fields:[
        {'key':'name','label':'Organization name','required':true},
        {'key':'organizationType','label':'Organization type','type':'choice','source':'organizationTypes','required':true},
        {'key':'customOrganizationType','label':'Custom type (for Other)'},
        if(superAdmin){'key':'billingCountry','label':'Billing country','required':true},
        {'key':'city','label':'City / locality'},
        {'key':'description','label':'Directory description','type':'multiline'},
        {'key':'allowSelfEnrollment','label':'Accept learners from the institution directory','type':'boolean'},
        if(superAdmin&&item!=null){'key':'churchId','label':'Linked church in the hierarchy','type':'choice','source':'churches'},
        if(superAdmin&&item==null){'key':'isPublicMinistry','label':'Super Admin public access ministry','type':'boolean'},
      ],onSave:(value)async{
        if(item==null){await widget.api.action('/api/admin/organizations',{'action':'create',...value});}
        else{await widget.api.updateOrganization('${item['id']}',value);}
      })));
    if(mounted)setState(reload);
  }
  Future<void> change(Map<String,dynamic> item,String action,Map<String,dynamic> values)async{
    try{await widget.api.action('/api/admin/organizations',{'action':action,'organizationId':item['id'],...values});if(mounted)setState(reload);}
    catch(e){if(mounted)ScaffoldMessenger.of(context).showSnackBar(SnackBar(content:Text('$e')));}
  }
  Future<void> ownership(Map<String,dynamic> workspace,Map<String,dynamic> item)async{
    try{
      final result=await widget.api.action('/api/admin/organizations',{'action':'searchUsers','organizationId':item['id']});
      final users=recordRows(result['items']);
      if(!mounted)return;
      await Navigator.push(context,MaterialPageRoute<void>(builder:(_)=>RecordEditor(api:widget.api,title:'Assign organization owner',
        fields:[{'key':'uid','label':'Existing account','type':'choice','source':'eligibleUsers','required':true}],
        options:{'eligibleUsers':users.map((v)=>{'value':v['uid'],'label':'${recordTitle(v)} · ${v['email']??''}'}).toList()},initial:{},
        onSave:(value)async{await widget.api.action('/api/admin/organizations',{'action':'assignOwner','organizationId':item['id'],...value});})));
      if(mounted)setState(reload);
    }catch(e){if(mounted)ScaffoldMessenger.of(context).showSnackBar(SnackBar(content:Text('$e')));}
  }
  void details(Map<String,dynamic> workspace,Map<String,dynamic> item){
    final superAdmin=workspace['isSuperAdmin']==true;
    showModalBottomSheet<void>(context:context,isScrollControlled:true,builder:(ctx)=>SafeArea(child:ConstrainedBox(constraints:BoxConstraints(maxHeight:MediaQuery.sizeOf(ctx).height*.9),child:ListView(shrinkWrap:true,padding:const EdgeInsets.all(24),children:[
      Text(recordTitle(item),style:Theme.of(ctx).textTheme.headlineSmall),
      for(final key in ['organizationType','status','billingCountry','city','description','memberCount','candidateCount'])if(item[key]!=null)ListTile(title:Text(humanLabel(key)),subtitle:Text('${item[key]}')),
      ListTile(title:const Text('Directory admission'),subtitle:Text(item['allowSelfEnrollment']==true?'Accepting learners':'Invitation only')),
      if(item['isPublicMinistry']==true)const ListTile(leading:Icon(Icons.public),title:Text('Super Admin public access ministry')),
      if(can(workspace,'update'))FilledButton.icon(onPressed:(){Navigator.pop(ctx);edit(workspace,item);},icon:const Icon(Icons.edit_outlined),label:const Text('Edit organization')),
      FilledButton.tonalIcon(onPressed:(){Navigator.pop(ctx);Navigator.push(context,MaterialPageRoute<void>(builder:(_)=>WorkspaceOperationsScreen(api:widget.api,kind:'organization',workspace:{...workspace,'organizationId':item['id']})));},icon:const Icon(Icons.people_outline),label:const Text('Members & invitations')),
      if((recordMap(workspace['permissions'])['billing'] as List? ?? []).contains('view'))TextButton(onPressed:(){Navigator.pop(ctx);Navigator.push(context,MaterialPageRoute<void>(builder:(_)=>PlansManagementScreen(api:widget.api,organizationId:'${item['id']}')));},child:const Text('Subscription & usage')),
      if(superAdmin)...[
        TextButton(onPressed:(){Navigator.pop(ctx);ownership(workspace,item);},child:const Text('Assign owner')),
        SwitchListTile(title:const Text('Super Admin public ministry'),value:item['isPublicMinistry']==true,onChanged:(value){Navigator.pop(ctx);change(item,'setPublicMinistry',{'isPublicMinistry':value});}),
        DropdownButtonFormField<String>(initialValue:'${item['status']}',decoration:const InputDecoration(labelText:'Status'),items:['active','suspended','archived'].map((v)=>DropdownMenuItem(value:v,child:Text(humanLabel(v)))).toList(),onChanged:(v){if(v!=null){Navigator.pop(ctx);change(item,'setStatus',{'status':v});}}),
      ],
    ]))));
  }
  @override Widget build(BuildContext context)=>FutureBuilder<List<Map<String,dynamic>>>(future:future,builder:(context,s){
    final workspace=s.data?.first??{};
    final items=recordRows(s.data?.last['items']).where((v)=>search.isEmpty||['name','slug','organizationType','city','billingCountry'].any((key)=>'${v[key]??''}'.toLowerCase().contains(search))).toList();
    return Scaffold(appBar:AppBar(title:const Text('Organizations & hierarchy'),actions:[IconButton(tooltip:'Refresh',onPressed:()=>setState(reload),icon:const Icon(Icons.refresh))]),
      floatingActionButton:workspace['isSuperAdmin']==true&&can(workspace,'create')?FloatingActionButton.extended(onPressed:()=>edit(workspace),icon:const Icon(Icons.add_business_outlined),label:const Text('New organization')):null,
      body:VopDesktopWorkspaceFrame(api:widget.api,child:s.connectionState!=ConnectionState.done?const VopSkeleton():s.hasError?VopEmpty(icon:Icons.error_outline,message:'${s.error}',onRetry:()=>setState(reload)):
        Column(children:[Padding(padding:const EdgeInsets.all(16),child:TextField(decoration:const InputDecoration(labelText:'Search name, type, or location',prefixIcon:Icon(Icons.search)),onChanged:(v)=>setState(()=>search=v.trim().toLowerCase()))),
          Expanded(child:items.isEmpty?const VopEmpty(icon:Icons.corporate_fare,message:'No organizations found.'):
            VopAdaptiveManagementList(
              items:items,
              title:recordTitle,
              description:(item)=>['${item['organizationType']??''}',
                '${item['city']??''}','${item['billingCountry']??''}']
                .where((v)=>v.isNotEmpty).join(' · '),
              status:(item)=>'${item['status']??'Unknown'}',
              icon:(item)=>item['isPublicMinistry']==true
                ?Icons.public:Icons.corporate_fare,
              onOpen:(item)=>()=>details(workspace,item),
              actions:(item)=>IconButton(
                tooltip:'View organisation',icon:const Icon(Icons.chevron_right),
                onPressed:()=>details(workspace,item))))])));
  });
}
