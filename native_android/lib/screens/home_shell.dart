import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import '../core/vop_api.dart';
import 'guide_screen.dart';
import 'mentor_screen.dart';

Map<String,dynamic> asMap(dynamic v) =>
  v is Map?Map<String,dynamic>.from(v):<String,dynamic>{};
List<Map<String,dynamic>> asRows(dynamic v)=>
  v is List?v.map(asMap).toList():[];

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
  Widget asyncView(Future<Map<String,dynamic>> future,Widget Function(Map<String,dynamic>) render)=>
    FutureBuilder<Map<String,dynamic>>(future:future,builder:(context,s){
      if(s.connectionState!=ConnectionState.done){
        return const Center(child:CircularProgressIndicator());
      }
      if(s.hasError)return Center(child:Padding(padding:const EdgeInsets.all(25),
        child:Column(mainAxisSize:MainAxisSize.min,children:[
          const Icon(Icons.wifi_off_outlined,size:42),
          const SizedBox(height:12),Text('${s.error}',textAlign:TextAlign.center),
          const SizedBox(height:16),
          OutlinedButton(onPressed:()=>setState(reload),child:const Text('Retry')),
        ])));
      return render(s.data??{});
    });
  @override Widget build(BuildContext context){
    const tabs=['Home','Study','Progress','Mentor','Account'];
    return Scaffold(
      appBar:AppBar(
        title:Text(tab==0?'Voice of Prophecy':tabs[tab],
          style:const TextStyle(fontWeight:FontWeight.w800)),
        actions:[IconButton(tooltip:'Refresh',icon:const Icon(Icons.refresh_rounded),
          onPressed:()=>setState(reload))],
      ),
      body:switch(tab){
        0=>home(),
        1=>library(),
        2=>progressPage(),
        3=>MentorScreen(api:widget.api),
        _=>account(),
      },
      bottomNavigationBar:NavigationBar(
        height:72,selectedIndex:tab,onDestinationSelected:(i)=>setState(()=>tab=i),
        destinations:const [
          NavigationDestination(icon:Icon(Icons.home_outlined),label:'Home'),
          NavigationDestination(icon:Icon(Icons.menu_book_outlined),label:'Study'),
          NavigationDestination(icon:Icon(Icons.insights_outlined),label:'Progress'),
          NavigationDestination(icon:Icon(Icons.forum_outlined),label:'Mentor'),
          NavigationDestination(icon:Icon(Icons.person_outline),label:'Account'),
        ],
      ),
    );
  }
  Widget home()=>asyncView(profile,(v){
    final user=asMap(v['account']);
    return ListView(padding:const EdgeInsets.all(20),children:[
      Card(color:Theme.of(context).colorScheme.primaryContainer,
        child:Padding(padding:const EdgeInsets.all(23),
          child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
            Text('Welcome to Voice of Prophecy',
              style:Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight:FontWeight.w800)),
            const SizedBox(height:8),
            Text('Hello, ${user['displayName']??'learner'}. Continue studying the Word of God.'),
            const SizedBox(height:15),
            FilledButton.icon(onPressed:()=>setState(()=>tab=1),
              icon:const Icon(Icons.auto_stories),label:const Text('Explore courses')),
          ]))),
      const SizedBox(height:24),
      Text('Your organisation',style:Theme.of(context).textTheme.titleLarge),
      const SizedBox(height:8),
      Text('${user['organizationName']??'Shared courses'}'),
      const SizedBox(height:16),
      ListTile(
        leading:const Icon(Icons.bookmark_outline),title:const Text('Resume your studies'),
        subtitle:const Text('Progress is synchronized with the VOP web app.'),
        trailing:const Icon(Icons.chevron_right),
        onTap:()=>setState(()=>tab=2)),
    ]);
  });
  Widget library()=>asyncView(catalog,(data){
    final all=asRows(data['guides']);
    final programs=asRows(data['programs']);
    final filtered=all.where((guide)=>'${guide['title']} ${guide['description']} ${guide['language']}'
      .toLowerCase().contains(search.toLowerCase())).toList();
    return RefreshIndicator(
      onRefresh:()async{setState(reload);await catalog;},
      child:ListView(padding:const EdgeInsets.all(16),children:[
        TextField(onChanged:(v)=>setState(()=>search=v),
          decoration:const InputDecoration(hintText:'Search guides and lessons',
            prefixIcon:Icon(Icons.search))),
        const SizedBox(height:16),
        if(programs.isNotEmpty)...[
          Text('Programs',style:Theme.of(context).textTheme.titleLarge),
          const SizedBox(height:8),
          ...programs.map((program)=>Card(
            margin:const EdgeInsets.only(bottom:8),child:ListTile(
              leading:const Icon(Icons.school_outlined),
              title:Text('${program['title']}'),
              subtitle:Text('${program['description']??''}',maxLines:2,
                overflow:TextOverflow.ellipsis),
              onTap:(){
                final linked=all.where((g)=>(program['guideIds'] as List? ?? [])
                  .contains(g['id'])).toList();
                Navigator.push(context,MaterialPageRoute<void>(builder:(_)=>
                  Scaffold(appBar:AppBar(title:Text('${program['title']}')),
                    body:ListView(children:linked.map(guideTile).toList()))));
              },
            ))),
          const SizedBox(height:14),
        ],
        Text('Study guides',style:Theme.of(context).textTheme.titleLarge),
        const SizedBox(height:8),
        if(filtered.isEmpty)const Padding(padding:EdgeInsets.all(22),
          child:Text('No published courses are available in this selection.')),
        ...filtered.map(guideTile),
      ]),
    );
  });
  Widget guideTile(Map<String,dynamic> g)=>Card(
    margin:const EdgeInsets.only(bottom:10),clipBehavior:Clip.antiAlias,
    child:ListTile(
      contentPadding:const EdgeInsets.symmetric(horizontal:12,vertical:8),
      leading:const CircleAvatar(child:Icon(Icons.auto_stories)),
      title:Text('${g['title']}',maxLines:2,
        style:const TextStyle(fontWeight:FontWeight.w700)),
      subtitle:Text('${g['language']??''} · ${g['description']??''}',
        maxLines:2,overflow:TextOverflow.ellipsis),
      trailing:const Icon(Icons.chevron_right),
      onTap:()=>Navigator.push(context,MaterialPageRoute<void>(
        builder:(_)=>GuideScreen(api:widget.api,guideId:'${g['id']}'))),
    ),
  );
  Widget progressPage()=>asyncView(progress,(data){
    final completed=(data['completedLessons'] as List?)??[];
    final resumes=asMap(data['lessonResume']);
    return ListView(padding:const EdgeInsets.all(20),children:[
      Card(child:Padding(padding:const EdgeInsets.all(22),
        child:Column(children:[
          const Icon(Icons.task_alt,size:40),
          Text('${completed.length}',style:Theme.of(context).textTheme.headlineLarge),
          const Text('Completed lessons'),
        ]))),
      const SizedBox(height:20),
      Text('Resume positions',style:Theme.of(context).textTheme.titleLarge),
      const SizedBox(height:12),
      if(resumes.isEmpty)const Text('No saved lesson resume positions yet.'),
      ...resumes.values.map((v){
        final row=asMap(v);
        return ListTile(
          leading:const Icon(Icons.bookmark_border),
          title:Text('Lesson ${row['lessonId']??''}'),
          subtitle:Text('Page ${(row['pageIndex'] as num? ?? 0).toInt()+1}'),
          onTap:()=>Navigator.push(context,MaterialPageRoute<void>(
            builder:(_)=>GuideScreen(api:widget.api,guideId:'${row['guideId']}'))),
        );
      }),
    ]);
  });
  Widget account()=>asyncView(profile,(data){
    final user=asMap(data['account']);
    return ListView(padding:const EdgeInsets.all(20),children:[
      const Center(child:CircleAvatar(radius:40,child:Icon(Icons.person,size:42))),
      const SizedBox(height:14),
      Center(child:Text('${user['displayName']??''}',
        style:Theme.of(context).textTheme.titleLarge)),
      const SizedBox(height:5),
      Center(child:Text('${user['email']??''}')),
      const SizedBox(height:20),
      ListTile(title:const Text('Role'),subtitle:Text('${user['role']??''}')),
      ListTile(title:const Text('Organisation'),
        subtitle:Text('${user['organizationName']??''}')),
      ListTile(title:const Text('Study language'),
        subtitle:Text('${user['studyLanguage']??'en'}')),
      const SizedBox(height:20),
      OutlinedButton.icon(
        icon:const Icon(Icons.logout),
        label:const Text('Sign out'),
        onPressed:()async=>FirebaseAuth.instance.signOut()),
    ]);
  });
}
