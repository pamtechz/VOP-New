import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/foundation.dart';
import 'package:firebase_auth/firebase_auth.dart';
import '../core/vop_api.dart';
import '../core/vop_i18n.dart';
import '../theme/vop_theme.dart';
import '../widgets/vop_ui.dart';
import 'certificates_screen.dart';
import 'account_settings_screen.dart';
import 'offline_studies_screen.dart';
import 'content_screen.dart';
import 'guide_screen.dart';
import 'engagement_screen.dart';
import 'notifications_screen.dart';
import 'mentor_screen.dart';
import 'prayer_screen.dart';
import 'institution_finder_sheet.dart';

Map<String,dynamic> asMap(dynamic value)=>value is Map
  ?Map<String,dynamic>.from(value):<String,dynamic>{};
List<Map<String,dynamic>> asRows(dynamic value)=>value is List
  ?value.whereType<Map>().map((e)=>Map<String,dynamic>.from(e)).toList()
  :<Map<String,dynamic>>[];

/// Avoid a one-letter greeting if the account profile only contains an initial.
/// The full name must come from the authenticated account, not a guessed name.
String welcomeGreeting(dynamic displayName){
  final words=(displayName??'').toString().trim()
    .split(RegExp(r'\s+')).map((part)=>part.replaceAll(RegExp(r'[.,;:!?]'),'')).where((part)=>part.length>1).toList();
  if(words.isEmpty)return 'Welcome back';
  return 'Hello, ${words.first}';
}

/// Match the web's mobile bottom navigation, not a generic Flutter shell.
/// Secondary destinations are accessible in an account/feature drawer.
class HomeShell extends StatefulWidget {
  const HomeShell({required this.api,super.key});
  final VopApi api;
  @override State<HomeShell> createState()=>_HomeShellState();
}
class _HomeShellState extends State<HomeShell> {
  int tab=0;
  String search='';
  late Future<Map<String,dynamic>> profile,catalog,progress;
  @override void initState(){super.initState();reload();unawaited(_restoreAppearance().catchError((_) {}));}
  Future<void> _restoreAppearance()async{
    try{
      final uid=FirebaseAuth.instance.currentUser?.uid;
      if(uid==null)return;
      await VopAppearance.restoreTheme(uid);
      final initialRevision=VopAppearance.revision;
      final result=await widget.api.personalSettings();
      if (mounted && initialRevision == VopAppearance.revision) {
        VopAppearance.apply(asMap(result['settings']));
      }
      final locale=(asMap(result['settings'])['uiLocale']??'en').toString().trim().toLowerCase();
      if(locale.isNotEmpty){
        try{
          final published=await widget.api.languagePack(locale);
          if(mounted)VopI18n.apply(locale,published);
        }catch(_){}
      }
    }catch(_){}
  }
  void reload(){
    profile=widget.api.bootstrap()..ignore();
    catalog=widget.api.catalogue()..ignore();
    progress=widget.api.progress()..ignore();
  }
  @override void dispose(){super.dispose();}
  void selectTab(int next)=>setState(()=>tab=next);
  void push(Widget page)=>Navigator.push(context,
    MaterialPageRoute<void>(builder:(_)=>page));

  void _openInstitutionFinder({String currentOrgId = ''}) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => InstitutionFinderSheet(
        api: widget.api,
        currentOrganizationId: currentOrgId,
        onJoined: () {
          setState(reload);
        },
      ),
    );
  }

  Widget asyncView(Future<Map<String,dynamic>> future,
      Widget Function(Map<String,dynamic>) render)=>FutureBuilder<Map<String,dynamic>>(
    future:future,builder:(context,result){
      if (result.connectionState != ConnectionState.done) {
        return const VopSkeleton();
      }
      if (result.hasError) {
        return VopEmpty(icon:Icons.wifi_off,
          message:'${result.error}',onRetry:()=>setState(reload));
      }
      return render(result.data??{});
    });

  Widget get body=>switch(tab){
    0=>home(),
    1=>study(),
    2=>VopContentScreen(key:const ValueKey('resources'),api:widget.api,
      kind:VopContentKind.resources,embedded:true),
    3=>PrayerScreen(key:const ValueKey('prayer'),api:widget.api,embedded:true),
    _=>VopContentScreen(key:const ValueKey('radio'),api:widget.api,
      kind:VopContentKind.radio,embedded:true),
  };

  @override Widget build(BuildContext context){
    final wide=MediaQuery.sizeOf(context).width>=880;
    final labels=[
      VopI18n.text('navigation.discover','Discover'),
      VopI18n.text('navigation.lessons','Lessons'),
      VopI18n.text('navigation.library','Library'),
      VopI18n.text('navigation.prayer','Prayer'),
      VopI18n.text('navigation.radio','Radio')];
    final icons=[
      Icons.home_outlined,Icons.auto_stories_outlined,
      Icons.local_library_outlined,Icons.volunteer_activism_outlined,
      Icons.radio_outlined,
    ];
    final activeIcons=[
      Icons.home_rounded,Icons.auto_stories_rounded,
      Icons.local_library_rounded,Icons.volunteer_activism_rounded,
      Icons.radio_rounded,
    ];
    return Scaffold(
      appBar:AppBar(
        toolbarHeight:58,
        title:tab==0?const VopBrand(compact:true)
          :Text(labels[tab],style:const TextStyle(fontWeight:FontWeight.w800)),
        actions:[
          IconButton(
            tooltip:'Notifications',
            onPressed:()=>push(VopNotifications(api:widget.api)),
            icon:const Icon(Icons.notifications_none_rounded)),
          IconButton(
            tooltip:'My account',icon:CircleAvatar(radius:16,
              backgroundColor:Theme.of(context).colorScheme.primaryContainer,
              child:Icon(Icons.person_outline,
                color:Theme.of(context).colorScheme.primary,size:19)),
            onPressed:()=>push(AccountSettingsScreen(api:widget.api))),
          const SizedBox(width:6),
        ],
      ),
      drawer:Drawer(child:_drawer()),
      body:wide?Row(children:[
        NavigationRail(
          backgroundColor:Theme.of(context).colorScheme.surface,
          selectedIndex:tab,labelType:NavigationRailLabelType.all,
          onDestinationSelected:selectTab,
          destinations:List.generate(labels.length,(index)=>NavigationRailDestination(
            icon:Icon(icons[index]),selectedIcon:Icon(activeIcons[index]),
            label:Text(labels[index]))),
        ),
        const VerticalDivider(width:1),
        Expanded(child:body),
      ]):body,
      bottomNavigationBar:wide?null:NavigationBar(
        selectedIndex:tab,
        onDestinationSelected:selectTab,
        destinations:List.generate(labels.length,(index)=>NavigationDestination(
          icon:Icon(icons[index]),selectedIcon:Icon(activeIcons[index]),
          label:labels[index])),
      ),
    );
  }

  Widget _drawer(){
    return SafeArea(child:ListView(padding:EdgeInsets.zero,children:[
      Container(
        padding:const EdgeInsets.fromLTRB(20,25,18,23),
        decoration:const BoxDecoration(gradient:LinearGradient(
          colors:[VopColors.navyDeep,VopColors.navyBright],
          begin:Alignment.topLeft,end:Alignment.bottomRight)),
        child:const Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
          Icon(Icons.auto_stories,color:VopColors.goldLight,size:33),
          SizedBox(height:12),
          Text('Voice of Prophecy',style:TextStyle(
            fontWeight:FontWeight.w900,fontSize:21,color:Colors.white)),
          SizedBox(height:4),
          Text('Your learning workspace',style:TextStyle(
            color:Color(0xFFD4E7FF),fontSize:12)),
        ]),
      ),
      _label('MENTORING & SUPPORT'),
      _destination('Mentoring Conversations',Icons.forum_outlined,
        ()=>push(Scaffold(appBar:AppBar(title:const Text('Mentoring')),
          body:MentorScreen(api:widget.api)))),
      const Divider(),
      _label('LEARNING'),
      _destination('Discover',Icons.home_outlined,()=>selectTab(0)),
      _destination('Lessons & Assessments',Icons.book_outlined,()=>selectTab(1)),
      _destination('Library',Icons.local_library_outlined,()=>selectTab(2)),
      if(!kIsWeb) _destination('Offline downloads',Icons.download_for_offline_outlined,
        ()=>push(OfflineStudiesScreen(api:widget.api))),
      _destination('My Progress',Icons.insights_outlined,()=>push(_ProgressScreen(api:widget.api))),
      _destination('My Certificates',Icons.workspace_premium_outlined,
        ()=>push(CertificatesScreen(api:widget.api))),
      _destination('Scripture Memory & Challenges',Icons.psychology_outlined,
        ()=>push(EngagementScreen(api:widget.api))),
      const Divider(),
      _label('COMMUNITY'),
      _destination('Find Church / Join Ministry',Icons.church_outlined,
        ()=>_openInstitutionFinder()),
      _destination('Prayer Ministry',Icons.volunteer_activism_outlined,()=>selectTab(3)),
      _destination('Radio & Broadcasts',Icons.radio_outlined,()=>selectTab(4)),
      _destination('Announcements',Icons.campaign_outlined,
        ()=>push(VopContentScreen(api:widget.api,kind:VopContentKind.announcements))),
      _destination('Events',Icons.event_outlined,
        ()=>push(VopContentScreen(api:widget.api,kind:VopContentKind.events))),
      const Divider(),
      _label('ACCOUNT'),
      _destination('Notifications',Icons.notifications_outlined,
        ()=>push(VopNotifications(api:widget.api))),
      _destination('My Profile',Icons.person_outline,
        ()=>push(AccountSettingsScreen(api:widget.api))),
      _destination('Personal Settings',Icons.tune_outlined,
        ()=>push(AccountSettingsScreen(api:widget.api))),
      _destination('About VOP',Icons.info_outline,
        ()=>push(_AboutScreen(api:widget.api))),
      const SizedBox(height:25),
    ]));
  }
  Widget _label(String label)=>Padding(
    padding:const EdgeInsets.fromLTRB(20,16,15,7),
    child:Text(label,style:const TextStyle(
      color:VopColors.gold,fontSize:10,letterSpacing:1.5,
      fontWeight:FontWeight.w900)));
  Widget _destination(String title,IconData icon,VoidCallback go)=>
    ListTile(
      dense:true,contentPadding:const EdgeInsets.symmetric(horizontal:19),
      leading:Icon(icon,size:21),
      title:Text(title,style:const TextStyle(fontSize:13.5,
        fontWeight:FontWeight.w600)),
      trailing:const Icon(Icons.chevron_right,size:17),
      onTap:(){Navigator.pop(context);go();});

  Widget home()=>FutureBuilder<Map<String,dynamic>>(future:profile,
    builder:(context,s){
      if (s.connectionState != ConnectionState.done) {
        return const VopSkeleton(rows:3);
      }
      if (s.hasError) {
        return VopEmpty(icon:Icons.wifi_off,
          message:'${s.error}',onRetry:()=>setState(reload));
      }
      final user=asMap(s.data?['account']);
      return FutureBuilder<Map<String,dynamic>>(future:catalog,
        builder:(context,course){
          final guides=asRows(course.data?['guides']);
          return FutureBuilder<Map<String,dynamic>>(future:progress,
            builder:(context,activity){
              final completed=(activity.data?['completedLessons'] as List?)?.length??0;
              final greeting=welcomeGreeting(user['displayName']);
              final orgId = (user['organizationId'] ?? '').toString().trim();
              final orgName = (user['organizationName'] ?? user['churchName'] ?? '').toString().trim();
              return RefreshIndicator(onRefresh:()async{
                setState(reload);await profile.catchError((_) => <String, dynamic>{});},
        child:ListView(key:const PageStorageKey<String>('vop-discover-scroll'),
          padding:const EdgeInsets.all(15),children:[
          Row(children:[
            Expanded(child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
              Text('WELCOME BACK',style:const TextStyle(
                color:VopColors.gold,fontWeight:FontWeight.w800,
                fontSize:10,letterSpacing:1.35)),
              const SizedBox(height:4),
              Text(greeting,maxLines:1,overflow:TextOverflow.ellipsis,
                style:Theme.of(context).textTheme.headlineMedium?.copyWith(fontSize:24)),
            ])),
            Container(width:38,height:38,alignment:Alignment.center,
              decoration:BoxDecoration(shape:BoxShape.circle,
                color:Theme.of(context).colorScheme.primaryContainer),
              child:const Icon(Icons.waving_hand_outlined,size:21)),
          ]),
          const SizedBox(height:12),
          if (orgId.isEmpty) ...[
            VopCard(
              child: Padding(
                padding: const EdgeInsets.all(14),
                child: Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.all(10),
                      decoration: BoxDecoration(
                        color: VopColors.gold.withAlpha(40),
                        shape: BoxShape.circle,
                      ),
                      child: const Icon(Icons.church_outlined, color: VopColors.gold, size: 24),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text(
                            'Connect to a Church or Public Ministry',
                            style: TextStyle(fontWeight: FontWeight.w800, fontSize: 13.5),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            'Find your local church congregation or study freely via open public ministry.',
                            style: TextStyle(fontSize: 11.5, color: Theme.of(context).colorScheme.onSurface.withAlpha(160)),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 8),
                    FilledButton.tonal(
                      style: FilledButton.styleFrom(
                        visualDensity: VisualDensity.compact,
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                      ),
                      onPressed: () => _openInstitutionFinder(currentOrgId: orgId),
                      child: const Text('Find / Join', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12)),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 12),
          ] else ...[
            VopCard(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                child: Row(
                  children: [
                    const Icon(Icons.verified_outlined, color: Colors.teal, size: 18),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        'Studying with: $orgName',
                        style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    TextButton(
                      onPressed: () => _openInstitutionFinder(currentOrgId: orgId),
                      style: TextButton.styleFrom(visualDensity: VisualDensity.compact),
                      child: const Text('Find institutions', style: TextStyle(fontSize: 11.5)),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 12),
          ],
          _ConfiguredHomeSlides(info:asMap(s.data?['appInfo']),onDestination:(target){
            switch(target){case 'lessons':selectTab(1);break;case 'library':case 'resources':selectTab(2);break;case 'prayer':selectTab(3);break;case 'radio':selectTab(4);break;
              case 'events':push(VopContentScreen(api:widget.api,kind:VopContentKind.events));break;
              case 'announcements':push(VopContentScreen(api:widget.api,kind:VopContentKind.announcements));break;
              default:selectTab(1);}
          }),
          const SizedBox(height:13),
          Row(children:[
            Expanded(child:_metric(icon:Icons.menu_book_outlined,
              value:'${guides.length}',label:'Study guides')),
            const SizedBox(width:12),
            Expanded(child:_metric(icon:Icons.task_alt,
              value:activity.connectionState!=ConnectionState.done?'…':'$completed',label:'Lessons completed')),
          ]),
          const SizedBox(height:14),
          VopSectionTitle('Explore VOP',
            subtitle:'Learning and encouragement at your fingertips'),
          const SizedBox(height:4),
          GridView.count(
            crossAxisCount:2,shrinkWrap:true,
            physics:const NeverScrollableScrollPhysics(),
            crossAxisSpacing:10,mainAxisSpacing:10,childAspectRatio:1.53,
            children:[
              VopFeatureTile(title:'Bible Lessons',subtitle:'Grow through guided study',
                icon:Icons.auto_stories_rounded,tint:VopColors.navyBright,
                onTap:()=>selectTab(1)),
              VopFeatureTile(title:'Library',subtitle:'Books and study resources',
                icon:Icons.local_library_outlined,tint:VopColors.gold,
                onTap:()=>selectTab(2)),
              VopFeatureTile(title:'Prayer Ministry',subtitle:'Share your prayer needs',
                icon:Icons.volunteer_activism_outlined,tint:VopColors.success,
                onTap:()=>selectTab(3)),
              VopFeatureTile(title:'Radio & Media',subtitle:'Listen to messages of hope',
                icon:Icons.radio_outlined,tint:const Color(0xFF8854D0),
                onTap:()=>selectTab(4)),
            ]),
          const SizedBox(height:17),
          VopSectionTitle('Featured study guides',
            subtitle:'Continue exploring the Word',
            action:'View all',onAction:()=>selectTab(1)),
          if(course.connectionState!=ConnectionState.done)
            const VopSkeleton(rows:2,padding:EdgeInsets.symmetric(vertical:8))
          else if(course.hasError)
            VopEmpty(icon:Icons.wifi_off,message:'Could not load study guides.',
              onRetry:()=>setState(reload))
          else if(guides.isEmpty)
            const SizedBox(height:130,child:VopEmpty(
              icon:Icons.menu_book_outlined,
              message:'No published guides are available yet.'))
          else
            ...guides.take(4).map(guideCard),
          const SizedBox(height:28),
        ]),
      );
            });
        });
    });
  Widget _metric({required IconData icon,required String value,required String label})=>
    Card(child:Padding(padding:const EdgeInsets.all(10),child:Row(children:[
      Container(width:35,height:35,decoration:BoxDecoration(
        color:Theme.of(context).colorScheme.primaryContainer,
        borderRadius:BorderRadius.circular(12)),
        child:Icon(icon,color:Theme.of(context).colorScheme.primary,size:19)),
      const SizedBox(width:9),
      Expanded(child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
        Text(value,style:Theme.of(context).textTheme.titleMedium?.copyWith(fontSize:18)),
        Text(label,maxLines:2,style:TextStyle(fontSize:10.5,
          color:Theme.of(context).colorScheme.onSurfaceVariant)),
      ])),
    ])));

  Widget study()=>asyncView(catalog,(data){
    final guides=asRows(data['guides']);
    final programs=asRows(data['programs']);
    final visible=guides.where((guide){
      final text='${guide['title']??''} ${guide['description']??''} ${guide['language']??''}';
      return text.toLowerCase().contains(search.toLowerCase());
    }).toList();
    return RefreshIndicator(onRefresh:()async{setState(reload);await catalog.catchError((_) => <String, dynamic>{});},
      child:ListView(key:const PageStorageKey<String>('vop-lessons-scroll'),
        padding:const EdgeInsets.all(15),children:[
        const VopHeroCard(
          title:'Lessons for life.',
          description:'Explore the Bible at your own pace and continue your learning journey.',
          icon:Icons.auto_stories_rounded,kicker:'STUDY WITH PURPOSE'),
        const SizedBox(height:12),
        TextField(onChanged:(value)=>setState(()=>search=value),
          decoration:const InputDecoration(
            hintText:'Find courses, topics and languages',
            prefixIcon:Icon(Icons.search_rounded))),
        const SizedBox(height:10),
        if(programs.isNotEmpty)...[
          VopSectionTitle('Study programmes',
            subtitle:'Explore structured learning paths'),
          ...programs.map((p)=>Card(
            margin:const EdgeInsets.only(bottom:10),
            clipBehavior:Clip.antiAlias,
            child:ListTile(
              dense:true,visualDensity:VisualDensity.compact,
              leading:const Icon(Icons.school_outlined),
              title:Text((p['title']??'').toString(),
                style:const TextStyle(fontWeight:FontWeight.w800)),
              subtitle:Text((p['description']??'').toString(),
                maxLines:2,overflow:TextOverflow.ellipsis),
              trailing:const Icon(Icons.chevron_right),
              onTap:(){
                final linked=guides.where((g)=>
                  (p['guideIds'] as List? ?? []).contains(g['id'])).toList();
                push(_ProgrammeScreen(title:(p['title']??'Programme').toString(),
                  guides:linked,api:widget.api));
              },
            ))),
          const SizedBox(height:7),
        ],
        VopSectionTitle('Study guides',
          subtitle:'${visible.length} published'),
        if(visible.isEmpty)const SizedBox(height:180,
          child:VopEmpty(icon:Icons.search_off,
            message:'No guides match your search.')),
        ...visible.map(guideCard),
        const SizedBox(height:20),
      ]));
  });
  Widget guideCard(Map<String,dynamic> guide)=>VopCourseCard(
    title:(guide['title']??'Study guide').toString(),
    description:(guide['description']??'').toString(),
    imageUrl:(guide['image']??'').toString(),
    language:(guide['language']??'').toString(),
    onTap:()=>push(GuideScreen(
      api:widget.api,guideId:(guide['id']??'').toString())),
  );
}

class _ProgrammeScreen extends StatelessWidget {
  const _ProgrammeScreen({required this.title,required this.guides,required this.api});
  final String title;
  final List<Map<String,dynamic>> guides;
  final VopApi api;
  @override Widget build(BuildContext context)=>Scaffold(
    appBar:AppBar(title:Text(title)),
    body:ListView(padding:const EdgeInsets.all(15),children:[
      VopSectionTitle(title,subtitle:'${guides.length} study guides'),
      if(guides.isEmpty)const VopEmpty(icon:Icons.menu_book_outlined,
        message:'No courses have been published under this programme.'),
      ...guides.map((guide)=>Card(
        clipBehavior:Clip.antiAlias,
        margin:const EdgeInsets.only(bottom:10),
        child:ExpansionTile(
          leading:const Icon(Icons.auto_stories_outlined),
          title:Text((guide['title']??'Course').toString(),
            style:const TextStyle(fontWeight:FontWeight.w800)),
          subtitle:Text((guide['language']??'').toString().toUpperCase()),
          children:[FutureBuilder<Map<String,dynamic>>(
            future:api.guide((guide['id']??'').toString())..ignore(),
            builder:(context,s){
              if (s.connectionState != ConnectionState.done) {
                return const Padding(padding:EdgeInsets.all(16),
                  child:LinearProgressIndicator());
              }
              if (s.hasError) {
                return Padding(padding:const EdgeInsets.all(14),
                  child:Text('${s.error}'));
              }
              final lessons=asRows(s.data?['lessons']).where((l)=>l['type']!='Test').toList();
              return Column(children:[
                if(lessons.isEmpty)const Padding(
                  padding:EdgeInsets.all(14),
                  child:Text('No published lessons under this course.')),
                ...lessons.asMap().entries.map((entry)=>ListTile(
                  dense:true,
                  leading:CircleAvatar(radius:16,
                    child:Text('${entry.key+1}',style:const TextStyle(fontSize:12))),
                  title:Text((entry.value['title']??'Lesson').toString()),
                  subtitle:Text('Lesson ${entry.key+1}'),
                  trailing:const Icon(Icons.chevron_right_rounded),
                  onTap:()=>Navigator.push(context,MaterialPageRoute<void>(
                    builder:(_)=>GuideScreen(api:api,
                      guideId:(guide['id']??'').toString()))),
                )),
                TextButton.icon(
                  onPressed:()=>Navigator.push(context,MaterialPageRoute<void>(
                    builder:(_)=>GuideScreen(api:api,
                      guideId:(guide['id']??'').toString()))),
                  icon:const Icon(Icons.menu_book_outlined),
                  label:const Text('Open course')),
              ]);
            },
          )],
        ),
      )),
    ]),
  );
}
class _ProgressScreen extends StatelessWidget{
  const _ProgressScreen({required this.api});
  final VopApi api;
  @override Widget build(BuildContext context)=>Scaffold(
    appBar:AppBar(title:const Text('Learning progress')),
    body:FutureBuilder<Map<String,dynamic>>(
      future:api.progress()..ignore(),builder:(context,s){
        if(s.connectionState!=ConnectionState.done)return const VopSkeleton();
        if(s.hasError)return VopEmpty(icon:Icons.wifi_off,message:'${s.error}');
        final progress=s.data??{};
        final count=(progress['completedLessons'] as List?)?.length??0;
        return ListView(padding:const EdgeInsets.all(19),children:[
          const VopHeroCard(title:'Every lesson counts.',
            description:'Your learning records are verified and synchronized with VOP.',
            kicker:'YOUR PROGRESS',icon:Icons.insights_rounded),
          const SizedBox(height:20),
          Card(child:Padding(padding:const EdgeInsets.all(20),
            child:Row(children:[
              const Icon(Icons.verified_outlined,color:VopColors.success,size:41),
              const SizedBox(width:17),
              Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
                Text('$count',style:Theme.of(context).textTheme.headlineSmall),
                const Text('Completed lessons'),
              ]),
            ]))),
          const SizedBox(height:12),
          const Text('Open a study guide to continue from your saved reading position.'),
        ]);
      }),
  );
}
class _AboutScreen extends StatefulWidget{
  const _AboutScreen({required this.api});
  final VopApi api;
  @override State<_AboutScreen> createState()=>_AboutState();
}
class _AboutState extends State<_AboutScreen>{
  late Future<Map<String,dynamic>> future;
  @override void initState(){super.initState();future=widget.api.workspace();}
  @override Widget build(BuildContext context)=>Scaffold(appBar:AppBar(title:const Text('About')),
    body:FutureBuilder<Map<String,dynamic>>(future:future,builder:(context,s){
      if(s.connectionState!=ConnectionState.done)return const VopSkeleton();
      if(s.hasError)return VopEmpty(icon:Icons.error_outline,message:'${s.error}',onRetry:()=>setState(()=>future=widget.api.workspace()));
      final info=asMap(s.data?['appInfo']);final about=asMap(asMap(info['detailPages'])['about']);
      final content=(about['content']??about['body']??info['welcomeMessage']??'').toString().replaceAll(RegExp(r'<[^>]+>'),'');
      return ListView(padding:const EdgeInsets.all(24),children:[Text('${about['title']??info['appName']??''}',style:Theme.of(context).textTheme.headlineSmall),
        const SizedBox(height:16),Text(content),for(final key in ['organizationName','contactEmail','contactPhone','website'])if('${info[key]??''}'.isNotEmpty)ListTile(title:Text('${info[key]}'))]);
    }));
}

class _ConfiguredHomeSlides extends StatelessWidget{
  const _ConfiguredHomeSlides({required this.info,required this.onDestination});
  final Map<String,dynamic> info;
  final ValueChanged<String> onDestination;
  @override Widget build(BuildContext context){
    final now=DateTime.now();
    final slides=asRows(info['heroSlides']).where((slide){
      final start=DateTime.tryParse('${slide['startDate']??''}'),end=DateTime.tryParse('${slide['endDate']??''}');
      return slide['enabled']==true&&(start==null||!now.isBefore(start))&&(end==null||!now.isAfter(end));
    }).toList()..sort((a,b)=>((a['order'] as num?)??0).compareTo((b['order'] as num?)??0));
    if(slides.isEmpty)return VopHeroCard(title:(info['appTagline']??'Explore lessons').toString(),description:(info['welcomeMessage']??'').toString(),icon:Icons.menu_book_rounded,cta:'View lessons',onTap:()=>onDestination('lessons'));
    return SizedBox(height:230,child:PageView(children:slides.map((slide)=>SingleChildScrollView(child:Column(children:[
      if('${slide['imageUrl']??''}'.startsWith('https://'))Image.network('${slide['imageUrl']}',height:110,width:double.infinity,fit:BoxFit.cover,errorBuilder:(_,__,___)=>const SizedBox.shrink()),
      VopHeroCard(title:'${slide['title']??''}',description:'${slide['description']??''}',kicker:'${slide['kicker']??''}',icon:Icons.menu_book_rounded,cta:'${slide['primaryActionLabel']??'View'}',onTap:()=>onDestination('${slide['primaryActionTarget']??'lessons'}')),
    ]))).toList()));
  }
}
