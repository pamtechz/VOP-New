import 'dart:convert';
import 'dart:typed_data';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:share_plus/share_plus.dart';
import 'package:local_auth/local_auth.dart';
import 'package:flutter/material.dart';
import '../core/vop_api.dart';
import '../core/vop_i18n.dart';
import 'offline_studies_screen.dart';
import '../core/vop_passkeys.dart';
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
    whatsapp=TextEditingController(),address=TextEditingController(),
    bio=TextEditingController(),photoUrl=TextEditingController();
  bool loading=true,saving=false;
  String? error,message;
  Map<String,dynamic> profile={},preferences={},savedPreferences={},deletion={},security={},notificationCapabilities={};
  bool preferencesReady=false;
  String? settingsLoadError;
  bool notificationStatusLoaded=false;
  List<Map<String,dynamic>> languages=[],securityActivity=[],passkeyItems=[];
  String? securityActivityError,passkeyError;
  bool securityActivityLoading=false;
  int page=0;
  @override void initState(){
    super.initState();
    _load();
    _loadSecurityActivity();
    _loadNativePasskeys();
    _loadAuxiliary();
  }
  @override void dispose(){
    name.dispose();phone.dispose();whatsapp.dispose();address.dispose();
    bio.dispose();photoUrl.dispose();super.dispose();
  }
  Future<void> _load()async{
    setState((){loading=true;error=null;});
    try{
      final results=await Future.wait([
        widget.api.accountProfile(),
        widget.api.personalSettings().catchError((Object problem)=>
          <String,dynamic>{'settings':<String,dynamic>{},'settingsUnavailable':true,
            'message':'$problem'}),
        widget.api.supportedLanguages().catchError(
          (Object _) => <String,dynamic>{'items':<dynamic>[]}),
      ]);
      final p=_map(results[0]['profile']);
      final settings=_map(results[1]['settings']);
      final settingsAvailable=results[1]['settingsUnavailable']!=true;
      final supported=_rows(results[2]['items']);
      if(!mounted)return;
      setState((){
        profile=p;preferences=settings;savedPreferences=Map<String,dynamic>.from(settings);
        preferencesReady=settingsAvailable;
        settingsLoadError=settingsAvailable?null:
          'Personal preferences could not be loaded. Reload before making changes.';
        languages=supported;
        name.text=(p['displayName']??'').toString();
        phone.text=(p['phoneNumber']??'').toString();
        whatsapp.text=(p['whatsappNumber']??'').toString();
        address.text=(p['address']??'').toString();
        bio.text=(p['bio']??'').toString();
        photoUrl.text=(p['photoURL']??'').toString();
        loading=false;
      });
      if(settingsAvailable)VopAppearance.apply(settings);
    }catch(e){if(mounted)setState((){error='$e';loading=false;});}
  }
  void _loadAuxiliary(){
      widget.api.accountLifecycle().then((r){
        if(mounted)setState(()=>deletion=r);
      }).catchError((Object ignored){});
      widget.api.accountSecurityStatus().then((r){
        if(mounted)setState(()=>security=r);
      }).catchError((Object ignored){if(mounted)setState(()=>security={'error':'Security details unavailable.'});});
      widget.api.notificationCapabilities().then((r){
        if(mounted)setState((){notificationCapabilities=r;notificationStatusLoaded=true;});
      }).catchError((Object ignored){
        if(mounted)setState(()=>notificationStatusLoaded=true);
      });
  }
  void _reloadAccount(){
    _load();
    _loadSecurityActivity();
    _loadNativePasskeys();
    _loadAuxiliary();
  }
  Future<void> _saveProfile()async{
    if(name.text.trim().isEmpty){
      setState(()=>error='Your display name cannot be empty.');return;
    }
    if(name.text.trim().length>120 || phone.text.trim().length>40 ||
        whatsapp.text.trim().length>40 || address.text.trim().length>500 ||
        bio.text.trim().length>1000 || photoUrl.text.trim().length>2048){
      setState(()=>error='One or more profile fields are too long.');return;
    }
    final image=photoUrl.text.trim();
    if(image.isNotEmpty && (!Uri.tryParse(image).toString().startsWith('https://') ||
        Uri.tryParse(image)?.hasAuthority!=true)){
      setState(()=>error='Use a public HTTPS profile picture URL.');return;
    }
    await _perform(()async{
      final result=await widget.api.saveProfile({
        'displayName':name.text.trim(),
        'phoneNumber':phone.text.trim(),
        'whatsappNumber':whatsapp.text.trim(),
        'address':address.text.trim(),
        'bio':bio.text.trim(),
        'photoURL':image,
      });
      profile=_map(result['profile']);
    },'Profile updated for web and Android.');
  }
  Map<String,dynamic> _settingsDelta(){
    final changes=<String,dynamic>{};
    for(final key in preferences.keys){
      final current=preferences[key],previous=savedPreferences[key];
      if(jsonEncode(current)==jsonEncode(previous))continue;
      if(current is Map && previous is Map){
        final nested=<String,dynamic>{};
        for(final entry in current.entries){
          final field=entry.key.toString();
          if(jsonEncode(entry.value)!=jsonEncode(previous[field])){
            nested[field]=entry.value;
          }
        }
        if(nested.isNotEmpty)changes[key]=nested;
      }else{
        changes[key]=current;
      }
    }
    return changes;
  }
  Future<void> _saveSettings()async{
    if(!preferencesReady)return;
    final changes=_settingsDelta();
    if(changes.isEmpty)return;
    await _perform(()async{
      final result=await widget.api.savePersonalSettings(changes);
      preferences=_map(result['settings']);
      savedPreferences=Map<String,dynamic>.from(preferences);
      VopAppearance.apply(preferences);
      if(changes.containsKey('uiLocale')){
        final locale=(preferences['uiLocale']??'en').toString().trim().toLowerCase();
        if(locale.isNotEmpty){
          try{
            final published=await widget.api.languagePack(locale);
            VopI18n.apply(locale,published);
          }catch(_){}
        }
      }
      if(changes.containsKey('theme')){
        final uid=FirebaseAuth.instance.currentUser?.uid;
        if(uid!=null)await VopAppearance.persistTheme(
          uid,(preferences['theme']??'system').toString());
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
        key:ValueKey('$section:$key:$current'),
        initialValue:value,
        isExpanded:true,
        decoration:InputDecoration(labelText:label),
        items:options,onChanged:saving?null:(v){
          if(v!=null){
            if(section.isEmpty)_patch(key,v);
            else _nested(section,key,v);
            if(key=='theme'&&preferencesReady){
              final uid=FirebaseAuth.instance.currentUser?.uid;
              if(uid!=null)VopAppearance.persistTheme(uid,v);
              _saveSettings();
            }
          }
        }));
  }
  @override Widget build(BuildContext context)=>Scaffold(
    appBar:AppBar(title:const Text('My Account & Settings'),
      actions:[IconButton(tooltip:'Reload account',onPressed:_reloadAccount,
        icon:const Icon(Icons.refresh_rounded))]),
    body:loading?const VopSkeleton(rows:4):
      error!=null&&profile.isEmpty
        ?VopEmpty(icon:Icons.wifi_off,message:error!,onRetry:_load)
        :Column(children:[
          Padding(padding:const EdgeInsets.fromLTRB(14,12,14,3),
            child:LayoutBuilder(builder:(context,constraints){
              final compact=constraints.maxWidth<410;
              return SegmentedButton<int>(showSelectedIcon:false,segments:[
                ButtonSegment(value:0,label:compact?null:const Text('Profile'),
                  icon:const Icon(Icons.person_outline)),
                ButtonSegment(value:1,label:compact?null:const Text('Settings'),
                  icon:const Icon(Icons.tune)),
                ButtonSegment(value:2,label:compact?null:const Text('Security'),
                  icon:const Icon(Icons.shield_outlined)),
              ],selected:{page},
                onSelectionChanged:(v)=>setState(()=>page=v.first));
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
      foregroundImage:Uri.tryParse((profile['photoURL']??'').toString())?.scheme=='https'
        ?NetworkImage((profile['photoURL']??'').toString()):null,
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
      _field(bio,'About me',Icons.edit_note_outlined,lines:3),
      _field(photoUrl,'Profile picture URL',Icons.image_outlined,
        keyboard:TextInputType.url),
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
        title:const Text('Organisation'),
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
      if(settingsLoadError!=null)...[
        Text(settingsLoadError!,style:TextStyle(
          color:Theme.of(context).colorScheme.error)),
        const SizedBox(height:8),
        OutlinedButton.icon(onPressed:loading?null:_load,
          icon:const Icon(Icons.refresh_rounded),
          label:const Text('Retry loading settings')),
      ],
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
        if(notificationStatusLoaded)...[
          const SizedBox(height:8),
          Text(
            notificationCapabilities.isEmpty
              ?'Email delivery status could not be checked. Preferences can still be saved.'
              :_map(notificationCapabilities['email'])['available']==true
                ?'Email delivery is configured for this platform.'
                :'Email delivery is currently unavailable. Your preference will take effect when the administrator configures email.',
            style:TextStyle(fontSize:12,
              color:Theme.of(context).colorScheme.onSurfaceVariant)),
        ],
      ]),
      const SizedBox(height:19),
      FilledButton.icon(onPressed:saving||!preferencesReady||_settingsDelta().isEmpty
        ?null:_saveSettings,
        icon:const Icon(Icons.save_outlined),
        label:Text(saving?'Saving…':'Save preferences')),
    ];
  }
  Future<void> _loadNativePasskeys()async{
    try{
      final items=await VopPasskeys().credentials();
      if(mounted)setState((){passkeyItems=items;passkeyError=null;});
    }catch(_){
      if(mounted)setState(()=>passkeyError='Passkeys could not be loaded.');
    }
  }
  Future<void> _registerNativePasskey()async{
    await _perform(()async{
      await VopPasskeys().register();
      await _loadNativePasskeys();
    },'Passkey added to your VOP account.');
  }
  Future<void> _removeNativePasskey(Map<String,dynamic> credential)async{
    final accepted=await showDialog<bool>(context:context,
      builder:(ctx)=>AlertDialog(
        title:const Text('Remove passkey?'),
        content:const Text('You will no longer be able to sign in using this passkey.'),
        actions:[
          TextButton(onPressed:()=>Navigator.pop(ctx,false),child:const Text('Cancel')),
          FilledButton(onPressed:()=>Navigator.pop(ctx,true),child:const Text('Remove')),
        ],
      ));
    if(accepted!=true||!mounted)return;
    await _perform(()async{
      await VopPasskeys().delete((credential['id']??'').toString());
      await _loadNativePasskeys();
    },'Passkey removed.');
  }

  Future<void> _loadSecurityActivity()async{
    if(securityActivityLoading)return;
    if(mounted)setState((){
      securityActivityLoading=true;
      securityActivityError=null;
    });
    try{
      final result=await widget.api.accountSecurityActivity();
      if(mounted)setState((){
        securityActivity=_rows(result['items']);
        securityActivityError=null;
      });
    }catch(e){
      if(mounted)setState((){
        securityActivityError=e is VopApiException&&e.status==401
          ?'Session expired. Sign in again to view security activity.'
          :e is VopApiException&&e.status==403
          ?'This account cannot access security history.'
          :'Security history unavailable. Check connection and retry.';
      });
    }finally{
      if(mounted)setState(()=>securityActivityLoading=false);
    }
  }
  String _activityTime(BuildContext context,String raw){
    final date=DateTime.tryParse(raw)?.toLocal();
    if(date==null)return '';
    final material=MaterialLocalizations.of(context);
    return '${material.formatShortDate(date)} · ${TimeOfDay.fromDateTime(date).format(context)}';
  }
  Future<bool> _confirmDeviceIdentity()async{
    final verifier=LocalAuthentication();
    try{
      if(!await verifier.isDeviceSupported()){
        if(mounted)setState(()=>error='Configure a screen lock to confirm sensitive account actions.');
        return false;
      }
      return await verifier.authenticate(
        localizedReason:'Confirm your identity for this VOP account action',
        options:const AuthenticationOptions(
          biometricOnly:false,stickyAuth:true),
      );
    }catch(e){
      if(mounted)setState(()=>error='Device verification could not be completed: $e');
      return false;
    }
  }
  Future<void> _checkBiometrics()async{
    if(!await _confirmDeviceIdentity())return;
    if(mounted)setState(()=>message='Device verification succeeded. Server sign-in remains required for account changes.');
  }

  Future<void> _exportData()async{
    final accepted=await showDialog<bool>(context:context,
      builder:(ctx)=>AlertDialog(
        title:const Text('Export your VOP account data?'),
        content:const Text('Your export may contain private study and account records. Share only with a trusted destination. The system share sheet can leave a temporary file in the app cache.'),
        actions:[
          TextButton(onPressed:()=>Navigator.pop(ctx,false),
            child:const Text('Cancel')),
          FilledButton(onPressed:()=>Navigator.pop(ctx,true),
            child:const Text('Prepare export')),
        ]));
    if(accepted!=true||!mounted||!await _confirmDeviceIdentity())return;
    await _perform(()async{
      final result=await widget.api.exportOwnAccount();
      final export=result['export'];
      if(export is! Map)throw StateError('The server did not return a valid account export.');
      final bytes=Uint8List.fromList(utf8.encode(const JsonEncoder.withIndent('  ').convert(export)));
      if(bytes.length>12*1024*1024){
        throw StateError('This export is too large to share from the device.');
      }
      final date=DateTime.now().toIso8601String().substring(0,10);
      await SharePlus.instance.share(ShareParams(
        files:[XFile.fromData(bytes,mimeType:'application/json')],
        fileNameOverrides:['vop-account-export-$date.json'],
        subject:'VOP account data export',
      ));
    },'Your export was prepared. Keep any saved copy secure.');
  }

  Future<void> _revokeSessions()async{
    final accepted=await showDialog<bool>(context:context,
      builder:(ctx)=>AlertDialog(
        title:const Text('Sign out all devices?'),
        content:const Text('All refresh tokens will be revoked. Existing access tokens on other devices may remain usable until expiry. You will be signed out here too. For security, this action requires a recent sign-in.'),
        actions:[
          TextButton(onPressed:()=>Navigator.pop(ctx,false),
            child:const Text('Cancel')),
          FilledButton(onPressed:()=>Navigator.pop(ctx,true),
            child:const Text('Sign out all')),
        ]));
    if(accepted!=true||!mounted||!await _confirmDeviceIdentity())return;
    await _perform(()async{
      await widget.api.revokeAllSessions();
      await FirebaseAuth.instance.signOut();
    },'Sessions revoked. Sign in again.');
  }
  Future<void> _requestDeletion()async{
    final confirmation=TextEditingController();
    try{
      final text=await showDialog<String>(context:context,
        builder:(ctx)=>AlertDialog(
          title:const Text('Request account deletion'),
          content:Column(mainAxisSize:MainAxisSize.min,crossAxisAlignment:CrossAxisAlignment.start,
            children:[
              const Text('Your account enters a 30-day recovery period. Some financial, certificate and audit records follow the published retention policy.'),
              const SizedBox(height:16),
              const Text('Type DELETE MY ACCOUNT to confirm.'),
              TextField(controller:confirmation,autocorrect:false,
                enableSuggestions:false,
                decoration:const InputDecoration(
                  labelText:'Confirmation phrase',
                  hintText:'DELETE MY ACCOUNT')),
            ]),
          actions:[
            TextButton(onPressed:()=>Navigator.pop(ctx),
              child:const Text('Keep account')),
            FilledButton(onPressed:()=>Navigator.pop(ctx,confirmation.text),
              child:const Text('Request deletion')),
          ]));
      if(text==null||!mounted)return;
      if(text!='DELETE MY ACCOUNT'){
        setState(()=>error='Type DELETE MY ACCOUNT exactly.');
        return;
      }
      if(!await _confirmDeviceIdentity())return;
      await _perform(()async{
        deletion=await widget.api.requestAccountDeletion(text);
      },'Account deletion requested. You can cancel before the scheduled date.');
    }finally{confirmation.dispose();}
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
      ListTile(contentPadding:EdgeInsets.zero,
        leading:const Icon(Icons.fingerprint),
        title:const Text('Biometric or screen-lock verification'),
        subtitle:const Text('Confirm your identity for sensitive actions.'),
        trailing:const Icon(Icons.chevron_right),
        onTap:_checkBiometrics),
      const Divider(),
      ListTile(contentPadding:EdgeInsets.zero,
        leading:const Icon(Icons.key_outlined),
        title:const Text('Passkeys'),
        subtitle:const Text('Sign in with your device lock, fingerprint or face.'),
        trailing:const Icon(Icons.add_circle_outline),
        enabled:!saving,onTap:_registerNativePasskey),
      if(passkeyError!=null)
        Text(passkeyError!,style:TextStyle(color:Theme.of(context).colorScheme.error)),
      ...passkeyItems.map((item)=>ListTile(
        contentPadding:EdgeInsets.zero,dense:true,
        title:Text((item['label']??'Passkey').toString()),
        subtitle:Text((item['createdAt']??'').toString()),
        trailing:IconButton(
          tooltip:'Remove passkey',icon:const Icon(Icons.delete_outline),
          onPressed:saving?null:()=>_removeNativePasskey(item)),
      )),
      const Divider(),
      if(security.isNotEmpty)...[
        if(security.containsKey('emailVerified'))...[
          ListTile(contentPadding:EdgeInsets.zero,
            leading:const Icon(Icons.verified_user_outlined),
            title:const Text('Email verification'),
            subtitle:Text(security['emailVerified']==true?'Verified':'Not verified')),
          if(security['emailVerified']!=true)
            TextButton.icon(onPressed:saving?null:()async{
                await _perform(()async{
                  final user=FirebaseAuth.instance.currentUser;
                  if(user==null)throw StateError('Sign in first.');
                  await user.sendEmailVerification();
                },'Verification email sent. Check your inbox.');
              },
              icon:const Icon(Icons.mark_email_unread_outlined),
              label:const Text('Send verification email')),
          TextButton.icon(onPressed:saving?null:()async{
              await _perform(()async{
                await FirebaseAuth.instance.currentUser?.reload();
                security=await widget.api.accountSecurityStatus();
              },'Email verification status refreshed.');
            },
            icon:const Icon(Icons.refresh_outlined),
            label:const Text('Refresh verification')),
        ],
        if((security['lastSignInAt']??'').toString().isNotEmpty)
          ListTile(contentPadding:EdgeInsets.zero,
            leading:const Icon(Icons.history),
            title:const Text('Last sign-in'),
            subtitle:Text((security['lastSignInAt']??'').toString())),
        ListTile(contentPadding:EdgeInsets.zero,
          leading:const Icon(Icons.link_outlined),
          title:const Text('Linked sign-in providers'),
          subtitle:Text((security['signInProviders'] is List &&
                (security['signInProviders'] as List).isNotEmpty)
            ?(security['signInProviders'] as List).join(', ')
            :'Email or supported sign-in')),
        const Divider(),
      ],
      const Divider(),
      ListTile(contentPadding:EdgeInsets.zero,
        leading:const Icon(Icons.history_outlined),
        title:const Text('Recent security activity'),
        subtitle:const Text('Recorded account and passkey events'),
        trailing:IconButton(tooltip:'Refresh activity',
          onPressed:securityActivityLoading?null:_loadSecurityActivity,
          icon:const Icon(Icons.refresh_outlined))),
      if(securityActivityLoading)
        const Padding(padding:EdgeInsets.symmetric(vertical:10),
          child:LinearProgressIndicator())
      else if(securityActivityError!=null)
        Padding(padding:const EdgeInsets.only(bottom:10),child:Column(
          crossAxisAlignment:CrossAxisAlignment.start,children:[
            Text(securityActivityError!,style:TextStyle(
              color:Theme.of(context).colorScheme.error)),
            TextButton.icon(onPressed:_loadSecurityActivity,
              icon:const Icon(Icons.refresh_outlined),label:const Text('Retry history')),
          ]))
      else if(securityActivity.isEmpty)
        const Padding(padding:EdgeInsets.only(bottom:10),
          child:Text('No recorded security actions yet.'))
      else
        ...securityActivity.take(30).map((event)=>ListTile(
          contentPadding:EdgeInsets.zero,
          dense:true,
          title:Text((event['title']??'Security activity').toString()),
          subtitle:Text(_activityTime(context,(event['occurredAt']??'').toString())))),
      const Text('This history is not an inventory of devices or all Google sign-ins.',
        style:TextStyle(fontSize:12)),
      const Divider(),
      ListTile(contentPadding:EdgeInsets.zero,
        leading:const Icon(Icons.devices_other_outlined),
        title:const Text('Sign out all devices'),
        subtitle:const Text('Revoke refresh tokens across devices. Requires recent sign-in.'),
        trailing:const Icon(Icons.chevron_right),
        enabled:!saving,onTap:_revokeSessions),
      const Divider(),
      _choose('Profile visibility','privacy','profileVisibility',[
        const DropdownMenuItem(value:'organization',child:Text('My organisation')),
        const DropdownMenuItem(value:'private',child:Text('Private')),
      ],(_map(preferences['privacy'])['profileVisibility']??'organization').toString()),
      FilledButton.icon(onPressed:saving||!preferencesReady||_settingsDelta().isEmpty
          ?null:_saveSettings,
        icon:const Icon(Icons.save_outlined),label:const Text('Save privacy')),
      const Divider(),
      ListTile(contentPadding:EdgeInsets.zero,
        leading:const Icon(Icons.download_outlined),
        title:const Text('Export my data'),
        subtitle:const Text('Create a JSON account export and choose where to save it.'),
        trailing:const Icon(Icons.chevron_right),
        enabled:!saving,onTap:_exportData),
    ]),
    _heading('Offline study','Manage encrypted downloads and pending changes.',Icons.download_outlined),
    _group([
      ListTile(contentPadding:EdgeInsets.zero,
        leading:const Icon(Icons.folder_outlined),
        title:const Text('Saved lessons and sync'),
        trailing:const Icon(Icons.chevron_right),
        onTap:()=>Navigator.push(context,MaterialPageRoute<void>(
          builder:(_)=>OfflineStudiesScreen(api:widget.api))),
      ),
      OutlinedButton.icon(
        onPressed:()async{
          final confirmed=await showDialog<bool>(context:context,
            builder:(ctx)=>AlertDialog(
              title:const Text('Clear offline data?'),
              content:const Text('This deletes downloaded lessons, quiz drafts and pending progress from this device.'),
              actions:[
                TextButton(onPressed:()=>Navigator.pop(ctx,false),child:const Text('Cancel')),
                FilledButton(onPressed:()=>Navigator.pop(ctx,true),child:const Text('Clear')),
              ]));
          if(confirmed==true){
            await widget.api.clearOfflineStudies();
            if(mounted)ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(content:Text('Offline data cleared.')));
          }
        },
        icon:const Icon(Icons.delete_outline),label:const Text('Clear downloads')),
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
          onPressed:saving?null:_requestDeletion,
          icon:const Icon(Icons.delete_outline),
          label:const Text('Request account deletion')),
    ]),
    const SizedBox(height:22),
    OutlinedButton.icon(
      onPressed:()=>FirebaseAuth.instance.signOut(),
      icon:const Icon(Icons.logout),label:const Text('Sign out')),
  ];
}
