import 'package:flutter/foundation.dart';

import 'vop_api.dart';

/// The native UI reads the same published translation keys as the web client.
/// An unknown/untranslated key displays its supplied English fallback.
abstract final class VopLocale {
  static final language=ValueNotifier<String>('en');
  static final version=ValueNotifier<int>(0);
  static Map<String,String> _dictionary={};
  static String tr(String key,String fallback){
    final value=_dictionary[key];
    return value!=null&&value.trim().isNotEmpty?value:fallback;
  }
  static Future<void> load(VopApi api,String locale)async{
    final normalized=locale.trim().toLowerCase();
    if(!RegExp(r'^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$').hasMatch(normalized)){
      _dictionary={};language.value='en';version.value++;return;
    }
    try{
      final result=await api.uiTranslations(normalized);
      final map=result['translations'];
      _dictionary=map is Map?map.map((k,v)=>MapEntry(k.toString(),v.toString())):{};
      language.value=normalized;
      version.value++;
    }catch(_){
      // Keep the last good dictionary while offline. Never invent a translation.
      if(language.value!=normalized){_dictionary={};language.value=normalized;version.value++;}
    }
  }
}
