import 'package:flutter/foundation.dart';

/// Uses the same published keys and locale records as the web i18n service.
class VopI18n {
  VopI18n._();
  static final revision=ValueNotifier<int>(0);
  static String locale='en';
  static String direction='ltr';
  static Map<String,String> translations={};

  static String text(String key,String english){
    final translated=translations[key]?.trim();
    return translated==null||translated.isEmpty?english:translated;
  }
  static void apply(String language,Map<String,dynamic> response){
    if(language.isEmpty)return;
    locale=language.toLowerCase();
    direction=response['direction']=='rtl'?'rtl':'ltr';
    final raw=response['translations'];
    translations=raw is Map
      ?raw.map((key,value)=>MapEntry(key.toString(),value.toString()))
      :<String,String>{};
    revision.value++;
  }
}
