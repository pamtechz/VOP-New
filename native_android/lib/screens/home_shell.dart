import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import '../core/vop_api.dart';
import '../theme/vop_theme.dart';
import '../widgets/vop_ui.dart';
import 'certificates_screen.dart';
import 'content_screen.dart';
import 'guide_screen.dart';
import 'engagement_screen.dart';
import 'notifications_screen.dart';
import 'mentor_screen.dart';
import 'prayer_screen.dart';

Map<String,dynamic> asMap(dynamic value)=>value is Map
  ?Map<String,dynamic>.from(value):<String,dynamic>{};
List<Map<String,dynamic>> asRows(dynamic value)=>value is List
  ?value.whereType<Map>().map((e)=>Map<String,dynamic>.from(e)).toList()
  :<Map<String,dynamic>>[];

/// Avoid a one-letter greeting if the account profile only contains an initial.
/// The full name must come from the authenticated account, not a guessed name.
String welcomeGreeting(dynamic displayName){
  final words=(displayName??'').toString().trim()
    .split(RegExp(r'\s+')).where((part)=>part.length>1).toList();
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
  @override void initState(){super.initState();reload();}
  void reload(){
    profile=widget.api.bootstrap();
    catalog=widget.api.catalogue();
    progress=widget.api.progress();
  }
  @override void dispose(){widget.api.dispose();super.dispose();}
  void selectTab(int next)=>setState(()=>tab=next);
  void push(Widget page)=>Navigator.push(context,
    MaterialPageRoute<void>(builder:(_)=>page));

  Widget asyncView(Future<Map<String,dynamic>> future,
      Widget Function(Map<String,dynamic>) render)=>FutureBuilder<Map<String,dynamic>>(
    future:future,builder:(context,result){
      if(result.connectionState!=ConnectionState.done)return const VopSkeleton();
      if(result.hasError)return VopEmpty(icon:Icons.wifi_off,
        message:'${result.error}',onRetry:()=>setState(reload));
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
    const labels=['Discover','Lessons','Library','Prayer','Radio'];
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
            onPressed:()=>push(_AccountScreen(api:widget.api))),
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
      _label('LEARNING'),
      _destination('Discover',Icons.home_outlined,()=>selectTab(0)),
      _destination('Lessons & Assessments',Icons.book_outlined,()=>selectTab(1)),
      _destination('Library',Icons.local_library_outlined,()=>selectTab(2)),
      _destination('My Progress',Icons.insights_outlined,()=>push(_ProgressScreen(api:widget.api))),
      _destination('My Certificates',Icons.workspace_premium_outlined,
        ()=>push(CertificatesScreen(api:widget.api))),
      _destination('Scripture Memory & Challenges',Icons.psychology_outlined,
        ()=>push(EngagementScreen(api:widget.api))),
      const Divider(),
      _label('COMMUNITY'),
      _destination('Prayer Ministry',Icons.volunteer_activism_outlined,()=>selectTab(3)),
      _destination('Radio & Broadcasts',Icons.radio_outlined,()=>selectTab(4)),
      _destination('Announcements',Icons.campaign_outlined,
        ()=>push(VopContentScreen(api:widget.api,kind:VopContentKind.announcements))),
      _destination('Events',Icons.event_outlined,
        ()=>push(VopContentScreen(api:widget.api,kind:VopContentKind.events))),
      _destination('Mentor & Conversations',Icons.forum_outlined,
        ()=>push(Scaffold(appBar:AppBar(title:const Text('Mentoring')),
          body:MentorScreen(api:widget.api)))),
      const Divider(),
      _label('ACCOUNT'),
      _destination('Notifications',Icons.notifications_outlined,
        ()=>push(VopNotifications(api:widget.api))),
      _destination('My Profile',Icons.person_outline,
        ()=>push(_AccountScreen(api:widget.api))),
      _destination('About VOP',Icons.info_outline,
        ()=>push(const _AboutScreen())),
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

  Widget home()=>FutureBuilder<List<Map<String,dynamic>>>(
    future:Future.wait([profile,catalog,progress]),
    builder:(context,s){
      if(s.connectionState!=ConnectionState.done)return const VopSkeleton(rows:5);
      if(s.hasError)return VopEmpty(icon:Icons.wifi_off,
        message:'${s.error}',onRetry:()=>setState(reload));
      final result=s.data??[];
      if(result.length<3)return const VopEmpty(icon:Icons.error_outline,
        message:'The dashboard could not load.');
      final user=asMap(result[0]['account']);
      final guides=asRows(result[1]['guides']);
      final completed=(result[2]['completedLessons'] as List?)?.length??0;
      final greeting=welcomeGreeting(user['displayName']);
      return RefreshIndicator(onRefresh:()async{
        setState(reload);await Future.wait([profile,catalog,progress]);},
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
          VopHeroCard(
            title:'Discover truth.\nGrow in faith.',
            description:'Continue your Bible study journey and explore lessons prepared for you.',
            kicker:'YOUR FAITH. YOUR JOURNEY.',
            icon:Icons.menu_book_rounded,
            cta:'Explore Lessons',onTap:()=>selectTab(1)),
          const SizedBox(height:13),
          Row(children:[
            Expanded(child:_metric(icon:Icons.menu_book_outlined,
              value:'${guides.length}',label:'Study guides')),
            const SizedBox(width:12),
            Expanded(child:_metric(icon:Icons.task_alt,
              value:'$completed',label:'Lessons completed')),
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
          if(guides.isEmpty)
            const SizedBox(height:130,child:VopEmpty(
              icon:Icons.menu_book_outlined,
              message:'No published guides are available yet.')),
          ...guides.take(4).map(guideCard),
          const SizedBox(height:28),
        ]),
      );
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
      final text=(guide['title']??'').toString()+' '+
        (guide['description']??'').toString()+' '+
        (guide['language']??'').toString();
      return text.toLowerCase().contains(search.toLowerCase());
    }).toList();
    return RefreshIndicator(onRefresh:()async{setState(reload);await catalog;},
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
    body:ListView(padding:const EdgeInsets.all(17),children:[
      if(guides.isEmpty)const VopEmpty(icon:Icons.menu_book_outlined,
        message:'No published lessons in this programme yet.'),
      ...guides.map((guide)=>VopCourseCard(
        title:(guide['title']??'').toString(),
        description:(guide['description']??'').toString(),
        language:(guide['language']??'').toString(),
        imageUrl:(guide['image']??'').toString(),
        onTap:()=>Navigator.push(context,MaterialPageRoute<void>(
          builder:(_)=>GuideScreen(api:api,guideId:(guide['id']??'').toString()))))),
    ]),
  );
}
class _ProgressScreen extends StatelessWidget{
  const _ProgressScreen({required this.api});
  final VopApi api;
  @override Widget build(BuildContext context)=>Scaffold(
    appBar:AppBar(title:const Text('Learning progress')),
    body:FutureBuilder<Map<String,dynamic>>(
      future:api.progress(),builder:(context,s){
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
class _AccountScreen extends StatelessWidget {
  const _AccountScreen({required this.api});
  final VopApi api;
  @override Widget build(BuildContext context)=>Scaffold(
    appBar:AppBar(title:const Text('My Account')),
    body:FutureBuilder<Map<String,dynamic>>(future:api.bootstrap(),
      builder:(context,s){
        if(s.connectionState!=ConnectionState.done)return const VopSkeleton();
        if(s.hasError)return VopEmpty(icon:Icons.wifi_off,message:'${s.error}');
        final user=asMap(s.data?['account']);
        return ListView(padding:const EdgeInsets.all(19),children:[
          const Center(child:CircleAvatar(radius:37,
            child:Icon(Icons.person_outline,size:41))),
          const SizedBox(height:11),
          Center(child:Text((user['displayName']??'Learner').toString(),
            style:Theme.of(context).textTheme.titleLarge)),
          const SizedBox(height:4),
          Center(child:Text((user['email']??'').toString())),
          const SizedBox(height:24),
          Card(child:Column(children:[
            ListTile(leading:const Icon(Icons.shield_outlined),
              title:const Text('Account role'),
              subtitle:Text((user['role']??'').toString())),
            const Divider(height:1),
            ListTile(leading:const Icon(Icons.apartment_outlined),
              title:const Text('Organisation'),
              subtitle:Text((user['organizationName']??'').toString())),
            const Divider(height:1),
            ListTile(leading:const Icon(Icons.translate_outlined),
              title:const Text('Study language'),
              subtitle:Text((user['studyLanguage']??'en').toString())),
          ])),
          const SizedBox(height:20),
          OutlinedButton.icon(
            onPressed:()=>FirebaseAuth.instance.signOut(),
            icon:const Icon(Icons.logout),
            label:const Text('Sign out')),
        ]);
      }),
  );
}
class _AboutScreen extends StatelessWidget{
  const _AboutScreen();
  @override Widget build(BuildContext context)=>Scaffold(
    appBar:AppBar(title:const Text('About VOP')),
    body:ListView(padding:const EdgeInsets.all(22),children:[
      const Center(child:VopBrand()),
      const SizedBox(height:27),
      Text('The Voice of Prophecy',style:Theme.of(context).textTheme.headlineSmall),
      const SizedBox(height:10),
      const Text('A Christ-centred Bible learning and mentoring platform. '
        'Study materials, personal progress and mentoring work together '
        'across the VOP Android and web experiences.'),
      const SizedBox(height:15),
      const Text('Your curriculum and organisation data are retrieved '
        'from the same authenticated VOP service as the web portal.'),
    ]),
  );
}
