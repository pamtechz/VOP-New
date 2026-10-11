import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'vop_api.dart';

/// Uses the same published locale registry as web.
/// Fallback strings remain UI labels, never curriculum data.
abstract final class VopLocalizations {
  static final revision=ValueNotifier<int>(0);
  static final studyLanguage=ValueNotifier<String>('');
  static String locale='en';
  static Map<String,String> _entries={};
  static bool _languageCode(String value)=>RegExp(
    r'^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$').hasMatch(value);

  static String t(String key,String fallback){
    final translation=_entries[key];
    return translation!=null&&translation.trim().isNotEmpty
      ?translation:fallback;
  }
  static void updateStudyLanguage(String selected){
    final code=selected.toLowerCase().trim();
    studyLanguage.value=_languageCode(code)?code:'';
  }
  static Future<void> load(VopApi api,String selected)async{
    final code=selected.toLowerCase().trim();
    if(!_languageCode(code))return;
    final prefs=await SharedPreferences.getInstance();
    final cacheKey='vop.ui.published.$code';
    final cached=prefs.getStringList(cacheKey)??[];
    if(cached.length.isEven){
      final fallback=<String,String>{};
      for(var i=0;i+1<cached.length;i+=2){
        fallback[cached[i]]=cached[i+1];
      }
      locale=code;_entries=fallback;revision.value++;
    }
    try{
      final response=await api.localizations(code);
      final data=response['translations'];
      if(data is! Map)return;
      final next=<String,String>{};
      for(final item in data.entries){
        final key=item.key.toString(),value=item.value.toString();
        if(key.isNotEmpty&&value.trim().isNotEmpty)next[key]=value;
      }
      locale=code;_entries=next;revision.value++;
      final flattened=<String>[];
      for(final item in next.entries){
        flattened..add(item.key)..add(item.value);
      }
      await prefs.setStringList(cacheKey,flattened);
    }catch(_){
      // Cached translations remain available offline.
    }
  }
}
