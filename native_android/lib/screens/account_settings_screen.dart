import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import '../core/vop_api.dart';
import '../core/vop_i18n.dart';
import 'offline_studies_screen.dart';
import '../theme/vop_theme.dart';
import '../widgets/vop_ui.dart';

Map<String,dynamic> _map(dynamic value)=>value is Map
    ?Map<String,dynamic>.from(value):<String,dynamic>{};
List<Map<String,dynamic>> _rows(dynamic value)=>value is List
    ?value.whereType<Map>().map((x)=>Map<String,dynamic>.from(x)).toList():[];

class AccountSettingsScreen extends StatefulWidget {
  const AccountSettingsScreen({required this.api,super.key});
  final VopApi api;
  @override State<AccountSettingsScreen> createState()=>_AccountSettingsScreenState();
}
class _AccountSettingsScreenState extends State<AccountSettingsScreen> {
  final name=TextEditingController(),phone=TextEditingController(),
    whatsapp=TextEditingController(),address=TextEditingController();
  bool loading=true,saving=false;
  String? error,message;
  Map<String,dynamic> profile={},preferences={},deletion={};
  List<Map<String,dynamic>> languages=[];
  int page=0;
  @override void initState(){super.initState();_load();}
  @override void dispose(){
    name.dispose();phone.dispose();whatsapp.dispose();address.dispose();super.dispose();
  }
  Future<void> _load()async{
    setState((){loading=true;error=null;});
    try{
      final results=await Future.wait([
        widget.api.accountProfile(),
        widget.api.personalSettings(),
        widget.api.supportedLanguages(),
      ]);
      final p=_map(results[0]['profile']);
      final settings=_map(results[1]['settings']);
      final supported=_rows(results[2]['items']);
      if(!mounted)return;
      setState((){
        profile=p;preferences=settings;languages=supported;
        name.text=(p['displayName']??'').toString();
        phone.text=(p['phoneNumber']??'').toString();
        whatsapp.text=(p['whatsappNumber']??'').toString();
        address.text=(p['address']??'').toString();
        loading=false;
      });
      VopAppearance.apply(settings);
      widget.api.accountLifecycle().then((r){
        if(mounted)setState(()=>deletion=r);
      }).catchError((Object ignored){});
    }catch(e){if(mounted)setState((){error='$e';loading=false;});}
  }
  Future<void> _saveProfile()async{
    if(name.text.trim().isEmpty){
      setState(()=>error='Your display name cannot be empty.');return;
    }
    await _perform(()async{
      final result=await widget.api.saveProfile({
        'displayName':name.text.trim(),
        'phoneNumber':phone.text.trim(),
        'whatsappNumber':whatsapp.text.trim(),
        'address':address.text.trim(),
      });
      profile=_map(result['profile']);
    },'Profile updated for web and Android.');
  }
  Future<void> _saveSettings()async{
    await _perform(()async{
      final result=await widget.api.savePersonalSettings(preferences);
      preferences=_map(result['settings']);
      VopAppearance.apply(preferences);
      final locale=(preferences['uiLocale']??'en').toString().trim();
      if(locale.isNotEmpty){
        try{
          final pack=await widget.api.languagePack(locale);
          VopI18n.apply(locale,pack);
        }catch(_){}
      }
    },'Personal settings saved for web and Android.');
  }
  Future<void> _perform(Future<void> Function() action,String success)async{
    if(saving)return;
    setState((){saving=true;error=null;message=null;});
    try{
      await action();
      if(mounted)setState(()=>message=success);
    }catch(e){if(mounted)setState(()=>error='$e');}
    finally{if(mounted)setState(()=>saving=false);}
  }
  void _patch(String key,dynamic value){
    setState(()=>preferences={...preferences,key:value});
    if(key=='theme'||key=='accessibility')VopAppearance.apply(preferences);
  }
  void _nested(String section,String key,dynamic value){
    _patch(section,{..._map(preferences[section]),key:value});
  }
  Widget _switch(String section,String key,String title,
      {bool enabled=true,String? help}) {
    final raw=_map(preferences[section])[key];
    final defaultsOn=section=='notifications'||
      (section=='studyPreferences'&&key=='reminders');
    final value=defaultsOn ? raw!=false : raw==true;
    return SwitchListTile.adaptive(
      contentPadding:EdgeInsets.zero,
      title:Text(title,style:const TextStyle(fontSize:14,fontWeight:FontWeight.w600)),
      subtitle:help==null?null:Text(help),
      value:value,onChanged:enabled?(v)=>_nested(section,key,v):null);
  }
  Widget _heading(String title,String desc,IconData icon)=>Padding(
    padding:const EdgeInsets.only(top:17,bottom:10),
    child:Row(children:[
      Icon(icon,color:Theme.of(context).colorScheme.primary,size:20),
      const SizedBox(width:10),
      Expanded(child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
        Text(title,style:Theme.of(context).textTheme.titleMedium),
        Text(desc,style:TextStyle(fontSize:11,height:1.4,
          color:Theme.of(context).colorScheme.onSurfaceVariant)),
      ])),
    ]));
  Widget _group(List<Widget> children)=>Card(child:Padding(
    padding:const EdgeInsets.symmetric(horizontal:17,vertical:15),
    child:Column(crossAxisAlignment:CrossAxisAlignment.stretch,children:children)));
  Widget _field(TextEditingController controller,String label,IconData icon,
      {TextInputType keyboard=TextInputType.text,int lines=1})=>
    Padding(padding:const EdgeInsets.only(bottom:12),
      child:TextField(controller:controller,maxLines:lines,
        keyboardType:keyboard,
        decoration:InputDecoration(
          labelText:label,prefixIcon:Icon(icon))));
  Widget _choose(String label,String section,String key,
      List<DropdownMenuItem<String>> options,String current){
    final value=options.any((v)=>v.value==current)?current:
        options.first.value;
    return Padding(padding:const EdgeInsets.only(bottom:15),
      child:DropdownButtonFormField<String>(
        initialValue:value,
        isExpanded:true,
        decoration:InputDecoration(labelText:label),
        items:options,onChanged:(v){
          if(v!=null){
            if(section.isEmpty)_patch(key,v);
            else _nested(section,key,v);
          }
        }));
  }
  @override Widget build(BuildContext context)=>Scaffold(
    appBar:AppBar(title:const Text('My Account & Settings'),
      actions:[IconButton(tooltip:'Reload account',onPressed:_load,
        icon:const Icon(Icons.refresh_rounded))]),
    body:loading?const VopSkeleton(rows:4):
      error!=null&&profile.isEmpty
        ?VopEmpty(icon:Icons.wifi_off,message:error!,onRetry:_load)
        :Column(children:[
          Padding(padding:const EdgeInsets.fromLTRB(12,10,12,3),
            child:LayoutBuilder(builder:(context,constraints){
              final compact=constraints.maxWidth<390;
              return SegmentedButton<int>(
                showSelectedIcon:!compact,
                style:ButtonStyle(
                  visualDensity:VisualDensity.compact,
                  padding:WidgetStateProperty.all(const EdgeInsets.symmetric(
                    horizontal:5,vertical:7)),
                  textStyle:WidgetStateProperty.all(const TextStyle(fontSize:12))),
                segments:[
                  ButtonSegment(value:0,
                    label:Text(VopI18n.text('navigation.profile','Profile')),
                    icon:const Icon(Icons.person_outline,size:17)),
                  ButtonSegment(value:1,
                    label:Text(VopI18n.text('navigation.personal_settings','Settings')),
                    icon:const Icon(Icons.tune,size:17)),
                  const ButtonSegment(value:2,
                    label:Text('Security'),icon:Icon(Icons.shield_outlined,size:17)),
                ],selected:{page},onSelectionChanged:(v)=>setState(()=>page=v.first));
            })),
          if(error!=null)Padding(padding:const EdgeInsets.symmetric(horizontal:18,vertical:5),
            child:Text(error!,style:TextStyle(color:Theme.of(context).colorScheme.error))),
          if(message!=null)Padding(padding:const EdgeInsets.symmetric(horizontal:18,vertical:5),
            child:Text(message!,style:const TextStyle(color:VopColors.success))),
          Expanded(child:ListView(
            key:ValueKey(page),padding:const EdgeInsets.fromLTRB(17,12,17,28),
            children:[if(page==0)..._profile(),if(page==1)..._preferences(),
              if(page==2)..._security()],
          )),
        ]),
  );
  List<Widget> _profile()=>[
    const SizedBox(height:9),
    Center(child:CircleAvatar(radius:35,
      backgroundColor:Theme.of(context).colorScheme.primaryContainer,
      child:const Icon(Icons.person,size:37))),
    const SizedBox(height:12),
    Center(child:Text((profile['email']??FirebaseAuth.instance.currentUser?.email??'').toString(),
      textAlign:TextAlign.center)),
    const SizedBox(height:17),
    _heading('Your profile','Your public name and verified contact details.',Icons.badge_outlined),
    _group([
      _field(name,'Display name',Icons.person_outline),
      _field(phone,'Phone number',Icons.phone_outlined,keyboard:TextInputType.phone),
      _field(whatsapp,'WhatsApp number',Icons.chat_outlined,keyboard:TextInputType.phone),
      _field(address,'Address',Icons.place_outlined,lines:2),
      FilledButton.icon(onPressed:saving?null:_saveProfile,
        icon:const Icon(Icons.save_outlined),
        label:Text(saving?'Saving…':'Save profile')),
    ]),
    _heading('Organisation & permissions','Your organisation controls these assignments.',
      Icons.apartment_outlined),
    _group([
      ListTile(contentPadding:EdgeInsets.zero,
        title:const Text('Role'),
        subtitle:Text((profile['organizationRole']??profile['role']??'Learner').toString())),
      ListTile(contentPadding:EdgeInsets.zero,
        title:const Text('Organisation ID'),
        subtitle:Text((profile['organizationId']??'Personal account').toString())),
    ]),
  ];
  List<Widget> _preferences(){
    final colors=['system','light','dark'].map((v)=>
      DropdownMenuItem<String>(value:v,child:Text(
        v=='system'?'Use system theme':v=='dark'?'Dark':'Light'))).toList();
    final codes=languages.map((lang)=>lang['code'].toString()).toSet();
    final uiCode=(preferences['uiLocale']??'').toString();
    final studyCode=(preferences['studyLanguage']??'').toString();
    final opts=[
      const DropdownMenuItem(value:'',child:Text('System default')),
      ...languages.map((lang)=>DropdownMenuItem<String>(
        value:lang['code'].toString(),child:Text(
          (lang['name']??lang['code']).toString()+' · '+
          (lang['nativeName']??lang['code']).toString()))),
    ];
    return [
      _heading('Appearance','Choose how VOP looks on your phone.',Icons.palette_outlined),
      _group([
        _choose('Theme','', 'theme',colors,
          (preferences['theme']??'system').toString()),
        _switch('accessibility','largeText','Larger reading text'),
        _switch('accessibility','highContrast','High contrast'),
        _switch('accessibility','reducedMotion','Reduce motion'),
      ]),
      _heading('Language','Set the interface and the language of your Bible studies.',
        Icons.translate_outlined),
      _group([
        _choose('Interface language','','uiLocale',opts,
          codes.contains(uiCode)?uiCode:''),
        _choose('Study language','','studyLanguage',opts,
          codes.contains(studyCode)?studyCode:''),
      ]),
      _heading('Notifications','Control the messages you receive.',Icons.notifications_outlined),
      _group([
        _switch('notifications','enabled','Enable notifications'),
        _switch('notifications','email','Email updates'),
        _switch('notifications','announcements','Announcements'),
        _switch('notifications','certificates','Certificate updates'),
      ]),
      _heading('Study routine','Make learning fit your schedule.',
        Icons.schedule_outlined),
      _group([
        _switch('studyPreferences','reminders','Study reminders'),
        TextFormField(
          initialValue:(_map(preferences['studyPreferences'])['preferredStudyTime']??'').toString(),
          keyboardType:TextInputType.datetime,
          decoration:const InputDecoration(
            labelText:'Preferred study time (HH:MM)',
            hintText:'18:30'),
          onChanged:(text)=>_nested('studyPreferences','preferredStudyTime',text),
        ),
        const SizedBox(height:10),
        TextFormField(
          initialValue:(_map(preferences['studyPreferences'])['timezone']??'').toString(),
          decoration:const InputDecoration(
            labelText:'Timezone (e.g. Africa/Lusaka)'),
          onChanged:(text)=>_nested('studyPreferences','timezone',text),
        ),
      ]),
      const SizedBox(height:19),
      FilledButton.icon(onPressed:saving?null:_saveSettings,
        icon:const Icon(Icons.save_outlined),
        label:Text(saving?'Saving…':'Save preferences')),
    ];
  }
  List<Widget> _security()=>[
    _heading('Account protection','Manage sign-in and personal data.',
      Icons.security_outlined),
    _group([
      ListTile(contentPadding:EdgeInsets.zero,
        leading:const Icon(Icons.password_outlined),
        title:const Text('Reset account password'),
        subtitle:const Text('Receive a secure password-reset email.'),
        trailing:const Icon(Icons.chevron_right),
        onTap:()async{
          final email=FirebaseAuth.instance.currentUser?.email;
          if(email==null||email.isEmpty)return;
          await _perform(()async{
            await FirebaseAuth.instance.sendPasswordResetEmail(email:email);
          },'Password reset email requested. Check your inbox.');
        }),
      const Divider(),
      _choose('Profile visibility','privacy','profileVisibility',[
        const DropdownMenuItem(value:'organization',child:Text('My organisation')),
        const DropdownMenuItem(value:'private',child:Text('Private')),
      ],(_map(preferences['privacy'])['profileVisibility']??'organization').toString()),
      FilledButton.icon(onPressed:saving?null:_saveSettings,
        icon:const Icon(Icons.save_outlined),label:const Text('Save privacy')),
    ]),
    _heading('Offline downloads','Manage this device’s study files.',Icons.download_outlined),
    _group([
      ListTile(
        contentPadding:EdgeInsets.zero,
        leading:const Icon(Icons.folder_outlined),
        title:const Text('Saved lessons and sync'),
        trailing:const Icon(Icons.chevron_right),
        onTap:()=>Navigator.push(context,MaterialPageRoute<void>(
          builder:(_)=>OfflineStudiesScreen(api:widget.api))),
      ),
      OutlinedButton.icon(
        onPressed:()async{
          final confirm=await showDialog<bool>(context:context,
            builder:(ctx)=>AlertDialog(
              title:const Text('Clear offline files?'),
              content:const Text('Downloaded studies, assessment drafts and pending changes on this device will be deleted.'),
              actions:[
                TextButton(onPressed:()=>Navigator.pop(ctx,false),
                  child:const Text('Cancel')),
                FilledButton(onPressed:()=>Navigator.pop(ctx,true),
                  child:const Text('Clear')),
              ],
            ));
          if(confirm==true){
            await widget.api.clearOfflineStudies();
            if(mounted)ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(content:Text('Offline files cleared.')));
          }
        },
        icon:const Icon(Icons.delete_outline),
        label:const Text('Clear offline files')),
    ]),
    _heading('Account lifecycle','A deletion request follows the VOP retention process.',
      Icons.manage_accounts_outlined),
    _group([
      Text('Status: '+(deletion['status']??'Active').toString()),
      const SizedBox(height:10),
      if(['requested','processing','blocked'].contains(deletion['status']))
        OutlinedButton.icon(
          onPressed:saving?null:()=>_perform(()async{
            final result=await widget.api.cancelAccountDeletion();
            deletion=result;
          },'Account deletion request cancelled.'),
          icon:const Icon(Icons.undo),label:const Text('Cancel deletion request'))
      else
        OutlinedButton.icon(
          onPressed:saving?null:()async{
            final accepted=await showDialog<bool>(context:context,
              builder:(ctx)=>AlertDialog(
                title:const Text('Request account deletion?'),
                content:const Text('Your account will enter the VOP deletion workflow. '
                  'You may lose access to your learning data.'),
                actions:[
                  TextButton(onPressed:()=>Navigator.pop(ctx,false),
                    child:const Text('Keep account')),
                  FilledButton(onPressed:()=>Navigator.pop(ctx,true),
                    child:const Text('Request deletion')),
                ]));
            if(accepted==true)await _perform(()async{
              deletion=await widget.api.requestAccountDeletion();
            },'Account deletion request submitted.');
          },
          icon:const Icon(Icons.delete_outline),
          label:const Text('Request account deletion')),
    ]),
    const SizedBox(height:22),
    OutlinedButton.icon(
      onPressed:()=>FirebaseAuth.instance.signOut(),
      icon:const Icon(Icons.logout),label:const Text('Sign out')),
  ];
}
