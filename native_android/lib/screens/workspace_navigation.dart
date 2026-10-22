import 'package:flutter/material.dart';
import '../core/vop_api.dart';
import '../widgets/vop_ui.dart';
import 'candidates_screen.dart';
import 'organizations_screen.dart';
import 'user_management_screen.dart';
import 'graduations_screen.dart';
import 'plans_management_screen.dart';
import 'curriculum_studio_screen.dart';
import 'workspace_records_screen.dart';
import 'workspace_operations_screen.dart';

class WorkspaceNavigation extends StatefulWidget{
  const WorkspaceNavigation({required this.api,super.key});
  final VopApi api;
  @override State<WorkspaceNavigation> createState()=>_WorkspaceNavigationState();
}
class _WorkspaceNavigationState extends State<WorkspaceNavigation>{
  late Future<Map<String,dynamic>> future;
  @override void initState(){super.initState();future=widget.api.workspace();}
  void open(Widget page)=>Navigator.push(context,MaterialPageRoute<void>(builder:(_)=>page));
  @override Widget build(BuildContext context)=>FutureBuilder<Map<String,dynamic>>(future:future,builder:(context,s){
    if(s.connectionState!=ConnectionState.done)return const VopSkeleton(rows:3);
    if(s.hasError)return VopEmpty(icon:Icons.error_outline,message:'${s.error}',onRetry:()=>setState(()=>future=widget.api.workspace()));
    final permissions=recordMap(s.data?['permissions']);
    final schemas=recordMap(s.data?['schemas']);
    bool can(String resource,String action)=>(permissions[resource] as List? ?? []).contains(action);
    final org=(s.data?['organizationId']??'').toString();
    Widget tile(String title,IconData icon,Widget page)=>ListTile(title:Text(title),leading:Icon(icon),trailing:const Icon(Icons.chevron_right),onTap:()=>open(page));
    final links=<Widget>[
      if(can('users','view'))tile('Candidates & enrollment',Icons.people_outline,CandidatesScreen(api:widget.api,organizationId:org.isEmpty?null:org)),
      if(can('users','view'))tile('User & role management',Icons.manage_accounts_outlined,UserManagementScreen(api:widget.api)),
      if(can('organizations','view'))tile('Organizations & membership',Icons.corporate_fare,OrganizationsScreen(api:widget.api)),
      if(schemas.containsKey('guides')||schemas.containsKey('quizzes'))tile('Curriculum Studio',Icons.menu_book_outlined,CurriculumStudioScreen(api:widget.api)),
      if(can('certificates','approve')||can('certificates','manage'))tile('Graduation approvals',Icons.school_outlined,GraduationsScreen(api:widget.api,organizationId:org.isEmpty?null:org)),
      if(can('mentoring','assign')||can('mentoring','manage'))tile('Mentoring operations & insights',Icons.support_agent_outlined,WorkspaceOperationsScreen(api:widget.api,kind:'mentoring',workspace:s.data!)),
      if(can('prayer','manage'))tile('Prayer ministry inbox',Icons.volunteer_activism_outlined,WorkspaceOperationsScreen(api:widget.api,kind:'prayer',workspace:s.data!)),
      if(can('portfolio','approve'))tile('Portfolio review queue',Icons.fact_check_outlined,WorkspaceOperationsScreen(api:widget.api,kind:'portfolio',workspace:s.data!)),
      if(can('billing','view'))tile('Subscriptions & usage',Icons.payments_outlined,PlansManagementScreen(api:widget.api,organizationId:org.isEmpty?null:org)),
      if(can('payments','view'))tile('Payments & receipts',Icons.receipt_long_outlined,WorkspaceOperationsScreen(api:widget.api,kind:'payments',workspace:s.data!)),
      for(final entry in schemas.entries.where((e)=>!['guides','quizzes','programs'].contains(e.key)))
        tile('${recordMap(entry.value)['title']}',Icons.folder_outlined,WorkspaceRecordsScreen(api:widget.api,collection:entry.key,organizationId:org.isEmpty?null:org)),
      if(can('audit','view'))tile('Audit history',Icons.history,WorkspaceOperationsScreen(api:widget.api,kind:'audit',workspace:s.data!)),
      if(s.data?['isSuperAdmin']==true)tile('Permissions',Icons.admin_panel_settings_outlined,WorkspaceOperationsScreen(api:widget.api,kind:'permissions',workspace:s.data!)),
      if(can('translations','view'))tile('Translation Studio',Icons.translate,WorkspaceOperationsScreen(api:widget.api,kind:'translations',workspace:s.data!)),
    ];
    return LayoutBuilder(builder:(context,constraints){
      final columns=constraints.maxWidth>=950?3:
        constraints.maxWidth>=620?2:1;
      final width=(constraints.maxWidth-((columns-1)*12))/columns;
      return Wrap(spacing:12,runSpacing:12,children:[
        for(final link in links)
          SizedBox(width:width,child:Card(
            clipBehavior:Clip.antiAlias,
            margin:EdgeInsets.zero,
            child:link)),
      ]);
    });
  });
}
