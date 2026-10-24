import 'package:flutter/material.dart';
import '../core/vop_api.dart';
import '../widgets/vop_ui.dart';
import '../widgets/vop_desktop_layout.dart';
import 'workspace_records_screen.dart';

class UserManagementScreen extends StatefulWidget {
  const UserManagementScreen({required this.api, super.key});
  final VopApi api;
  @override State<UserManagementScreen> createState()=>_UserManagementState();
}
class _UserManagementState extends State<UserManagementScreen> {
  late Future<List<Map<String,dynamic>>> future;
  String search='';
  @override void initState(){super.initState();reload();}
  void reload(){future=Future.wait([widget.api.workspace(),widget.api.adminUsers()]);}
  Future<void> edit(Map<String,dynamic> workspace,[Map<String,dynamic>? user])async{
    final superAdmin=workspace['isSuperAdmin']==true;
    final options=recordMap(workspace['options']);
    final fields=<Map<String,dynamic>>[
      {'key':'displayName','label':'Full name','required':true},
      {'key':'email','label':'Email','required':true},
      {'key':'phoneNumber','label':'Phone number'},
      {'key':'whatsappNumber','label':'WhatsApp number'},
      {'key':'userType','label':'Account type','type':'choice','required':true,
        'choices':['learner','mentor','teacher','admin','guest',if(superAdmin)'super_admin']},
      if(superAdmin)...[
        {'key':'assignmentMode','label':'Assignment','type':'choice','choices':['organization','hierarchy']},
        {'key':'organizationId','label':'Organization','type':'choice','source':'organizations'},
        {'key':'adminNodeType','label':'Hierarchy level','type':'choice','choices':['union','conference','district','church']},
        {'key':'adminNodeId','label':'Hierarchy node','type':'choice','source':'hierarchyNodes'},
      ],
      if(user==null){'key':'password','label':'Initial password (optional)','type':'password'},
      {'key':'disabled','label':'Account disabled','type':'boolean'},
    ];
    if(superAdmin){
      try{
        final collections=['unions','conferences','districts','churches'];
        final groups=await Future.wait(collections.map((c)=>widget.api.recordList(c)));
        final nodes=<Map<String,dynamic>>[];
        for(var i=0;i<groups.length;i++){
          for(final node in recordRows(groups[i]['items'])){
            if(!nodes.any((v)=>v['value']==node['id']))nodes.add({'value':node['id'],'label':'${collections[i]} · ${recordTitle(node)}'});
          }
        }
        options['hierarchyNodes']=nodes;
      }catch(e){if(mounted)ScaffoldMessenger.of(context).showSnackBar(SnackBar(content:Text('Could not load hierarchy: $e')));return;}
    }
    if(!mounted)return;
    await Navigator.push(context,MaterialPageRoute<void>(builder:(_)=>RecordEditor(api:widget.api,
      title:user==null?'Create account':'Edit ${recordTitle(user)}',fields:fields,options:options,initial:user??{},
      onSave:(data)async{
        await widget.api.action('/api/admin/users',{'action':user==null?'create':'update',if(user!=null)'uid':user['uid'],...data});
      })));
    if(mounted)setState(reload);
  }
  Future<void> delete(Map<String,dynamic> user)async{
    final confirmed=await showDialog<bool>(context:context,builder:(ctx)=>AlertDialog(title:Text('Delete ${recordTitle(user)}?'),
      content:const Text('This removes the account. Existing certificates and financial records follow their retention rules.'),
      actions:[TextButton(onPressed:()=>Navigator.pop(ctx,false),child:const Text('Cancel')),FilledButton(onPressed:()=>Navigator.pop(ctx,true),child:const Text('Delete account'))]));
    if(confirmed!=true)return;
    try{await widget.api.action('/api/admin/users',{'action':'delete','uid':user['uid']});if(mounted)setState(reload);}
    catch(e){if(mounted)ScaffoldMessenger.of(context).showSnackBar(SnackBar(content:Text('$e')));}
  }
  @override Widget build(BuildContext context)=>FutureBuilder<List<Map<String,dynamic>>>(future:future,builder:(context,s){
    final workspace=s.data?.first??<String,dynamic>{};
    final actions=(recordMap(workspace['permissions'])['users'] as List? ?? []);
    final items=recordRows(s.data?.last['items']).where((v)=>search.isEmpty||[recordTitle(v),'${v['email']??''}'].any((text)=>text.toLowerCase().contains(search))).toList();
    return Scaffold(appBar:AppBar(title:const Text('User & role management'),actions:[IconButton(tooltip:'Refresh',onPressed:()=>setState(reload),icon:const Icon(Icons.refresh))]),
      floatingActionButton:actions.contains('create')?FloatingActionButton.extended(onPressed:()=>edit(workspace),icon:const Icon(Icons.person_add_outlined),label:const Text('Create account')):null,
      body:VopDesktopWorkspaceFrame(api:widget.api,child:s.connectionState!=ConnectionState.done?const VopSkeleton():s.hasError?VopEmpty(icon:Icons.error_outline,message:'${s.error}',onRetry:()=>setState(reload)):
        Column(children:[Padding(padding:const EdgeInsets.all(16),child:TextField(decoration:const InputDecoration(labelText:'Find account',prefixIcon:Icon(Icons.search)),onChanged:(v)=>setState(()=>search=v.trim().toLowerCase()))),
          Expanded(child:items.isEmpty?const VopEmpty(icon:Icons.people_outline,message:'No accounts found.'):ListView.separated(padding:const EdgeInsets.fromLTRB(16,0,16,96),itemCount:items.length,separatorBuilder:(_,__)=>const Divider(),itemBuilder:(_,i){final user=items[i];return ListTile(
            title:Text(recordTitle(user)),subtitle:Text('${user['email']??''}\n${user['roleLabel']??user['role']??''} · ${user['status']??''}'),isThreeLine:true,
            trailing:Wrap(children:[if(actions.contains('update'))IconButton(tooltip:'Edit account',onPressed:()=>edit(workspace,user),icon:const Icon(Icons.edit_outlined)),if(actions.contains('delete'))IconButton(tooltip:'Delete account',onPressed:()=>delete(user),icon:const Icon(Icons.delete_outline))]));}))])));
  });
}
