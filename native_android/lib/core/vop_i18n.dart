import 'dart:convert';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'vop_api.dart';

class VopLocaleBundle {
  const VopLocaleBundle(this.code,this.values);
  final String code;
  final Map<String,String> values;
  String text(String key,String fallback) {
    final value=values[key];
    return value==null||value.trim().isEmpty?fallback:value;
  }
}
abstract final class VopI18n {
  static const _secure=FlutterSecureStorage();
  static final bundle=ValueNotifier<VopLocaleBundle>(
    const VopLocaleBundle('en',{}));
  static String t(String key,String fallback)=>bundle.value.text(key,fallback);

  static Future<void> load(VopApi api,String code)async{
    final clean=code.trim().toLowerCase();
    final locale=RegExp(r'^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$').hasMatch(clean)
      ?clean:'en';
    if(locale=='en'){
      bundle.value=const VopLocaleBundle('en',{});
      return;
    }
    final owner=FirebaseAuth.instance.currentUser?.uid;
    if(owner==null)return;
    final key='vop-ui-translations:$owner:$locale';
    try{
      final response=await api.translations(locale);
      final raw=response['translations'];
      if(raw is! Map)throw const FormatException('Invalid translation payload');
      final values=raw.map((name,text)=>
        MapEntry(name.toString(),text.toString()));
      if(FirebaseAuth.instance.currentUser?.uid!=owner)return;
      bundle.value=VopLocaleBundle(locale,values);
      await _secure.write(key:key,value:jsonEncode(values));
    }catch(_){
      if(FirebaseAuth.instance.currentUser?.uid!=owner)return;
      final cached=await _secure.read(key:key);
      if(cached!=null){
        final decoded=jsonDecode(cached);
        if(decoded is Map){
          bundle.value=VopLocaleBundle(locale,decoded.map(
            (key,value)=>MapEntry(key.toString(),value.toString())));
          return;
        }
      }
      bundle.value=VopLocaleBundle(locale,{});
    }
  }
}
