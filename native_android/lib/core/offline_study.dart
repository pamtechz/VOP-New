import 'dart:convert';

import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'vop_api.dart';

/// Per-account offline copies of public, permission-filtered lesson payloads.
/// Never caches administrator documents, answers, scoring secrets or tokens.
/// Quiz sessions and draft answers use Android-keystore-backed secure storage.
class OfflineStudyStore {
  OfflineStudyStore({FirebaseAuth? auth})
      : _auth=auth??FirebaseAuth.instance;
  final FirebaseAuth _auth;
  static const _secret=FlutterSecureStorage();
  static const _prefix='vop_offline_v2';
  static const maxLessonBytes=450000;
  String get uid {
    final id=_auth.currentUser?.uid;
    if(id==null||id.isEmpty)throw const VopApiException('Sign in to access downloaded studies.');
    return id;
  }
  String _key(String kind,String id)=>'$_prefix:$uid:$kind:$id';
  String _lessonId(String guide,String lesson)=>'$guide:$lesson';
  Future<Map<String,dynamic>?> _get(String key)async{
    final prefs=await SharedPreferences.getInstance();
    final text=prefs.getString(key);
    if(text==null)return null;
    try{
      final value=jsonDecode(text);
      return value is Map?Map<String,dynamic>.from(value):null;
    }catch(_){return null;}
  }
  Future<void> _save(String key,Map<String,dynamic> value)async{
    final raw=jsonEncode(value);
    if(raw.length>maxLessonBytes){
      throw const VopApiException('Lesson exceeds offline storage limit. It remains available online.');
    }
    final prefs=await SharedPreferences.getInstance();
    await prefs.setString(key,raw);
  }
  Future<void> saveGuide(String guideId,Map<String,dynamic> result)=>
      _save(_key('guide',guideId),result);
  Future<Map<String,dynamic>?> guide(String guideId)=>
      _get(_key('guide',guideId));
  Future<void> saveLesson(String guideId,String lessonId,Map<String,dynamic> result)=>
      _save(_key('lesson',_lessonId(guideId,lessonId)),result);
  Future<Map<String,dynamic>?> lesson(String guideId,String lessonId)=>
      _get(_key('lesson',_lessonId(guideId,lessonId)));
  Future<int> clearDownloadedLessons()async{
    final prefs=await SharedPreferences.getInstance();
    final prefix='$_prefix:$uid:';
    final keys=prefs.getKeys().where((key)=>key.startsWith(prefix)&&
      (key.contains(':lesson:')||key.contains(':guide:'))).toList();
    for(final key in keys){await prefs.remove(key);}
    return keys.length;
  }
  Future<bool> hasLesson(String guideId,String lessonId)async=>
      await lesson(guideId,lessonId)!=null;
  Future<int> downloadGuide(VopApi api,String guideId)async{
    final result=await api.guide(guideId); // Server scope and publication checked.
    final rows=result['lessons'] is List?result['lessons'] as List:[];
    // Do not store a guide until all available reading lessons have downloaded.
    // Assessments cannot be downloaded as answer banks.
    var count=0;
    for(final row in rows.whereType<Map>()){
      if(row['type']=='Test'||row['unlocked']==false)continue;
      final lessonId=(row['id']??'').toString();
      if(lessonId.isEmpty)continue;
      final payload=await api.lesson(guideId,lessonId);
      await saveLesson(guideId,lessonId,payload);
      count++;
    }
    await saveGuide(guideId,result);
    return count;
  }
  Future<Map<String,dynamic>> loadGuide(VopApi api,String guideId)async{
    try{
      final result=await api.guide(guideId);
      await saveGuide(guideId,result);
      return result;
    }catch(error){
      if(error is VopApiException && error.status>=400 && error.status<500)rethrow;
      final cached=await guide(guideId);
      if(cached!=null)return {...cached,'offlineCopy':true};
      rethrow;
    }
  }
  Future<Map<String,dynamic>> loadLesson(VopApi api,String guideId,String lessonId)async{
    try{
      final result=await api.lesson(guideId,lessonId);
      await saveLesson(guideId,lessonId,result);
      return result;
    }catch(error){
      if(error is VopApiException && error.status>=400 && error.status<500)rethrow;
      final cached=await lesson(guideId,lessonId);
      if(cached!=null)return {...cached,'offlineCopy':true};
      rethrow;
    }
  }
  Future<void> queueResume(String guideId,String lessonId,String lang,int page)async{
    await _queue('resume',guideId,lessonId,lang,{'pageIndex':page});
  }
  Future<void> queueCompletion(String guideId,String lessonId,String lang)async{
    await _queue('complete',guideId,lessonId,lang,{});
  }
  Future<void> _queue(String kind,String guideId,String lessonId,
      String lang,Map<String,dynamic> data)async{
    final key=_key('pending','study');
    final rows=(await _get(key))?['entries'];
    final existing=rows is List?rows.whereType<Map>().map((e)=>Map<String,dynamic>.from(e)).toList():<Map<String,dynamic>>[];
    // Deduplicate: last resume position wins; a completion stays until verified.
    existing.removeWhere((row)=>row['kind']==kind&&
      row['guideId']==guideId&&row['lessonId']==lessonId&&row['language']==lang);
    existing.add({'kind':kind,'guideId':guideId,'lessonId':lessonId,'language':lang,
      ...data,'createdAt':DateTime.now().toUtc().toIso8601String()});
    await _save(key,{'entries':existing.take(200).toList()});
  }
  Future<int> pendingCount()async{
    final obj=await _get(_key('pending','study'));
    return obj?['entries'] is List?(obj!['entries'] as List).length:0;
  }
  Future<int> sync(VopApi api)async{
    final key=_key('pending','study');
    final obj=await _get(key);
    final entries=obj?['entries'] is List
      ?(obj!['entries'] as List).whereType<Map>().map((v)=>Map<String,dynamic>.from(v)).toList()
      :<Map<String,dynamic>>[];
    if(entries.isEmpty)return 0;
    var synced=0;
    final remaining=<Map<String,dynamic>>[];
    for(var i=0;i<entries.length;i++){
      final entry=entries[i];
      try{
        final guide=(entry['guideId']??'').toString();
        final lesson=(entry['lessonId']??'').toString();
        final lang=(entry['language']??'').toString();
        if(entry['kind']=='resume'){
          await api.saveResume(guide,lesson,lang,(entry['pageIndex'] as num).toInt());
        }else if(entry['kind']=='complete'){
          await api.completeLesson(guide,lesson,lang);
        }else{
          continue;
        }
        synced++;
      }catch(_){
        // Retain failed writes for a later authenticated retry; no fake success.
        remaining.addAll(entries.skip(i));
        break;
      }
    }
    await _save(key,{'entries':remaining});
    await syncPendingQuiz(api);
    return synced;
  }

  String _quizKey(String guide,String lesson,String lang)=>
      _key('quiz', '$lang:$guide:$lesson');
  Future<void> saveQuizSession(String guide,String lesson,String lang,
      Map<String,dynamic> session)async{
    await _secret.write(key:_quizKey(guide,lesson,lang),value:jsonEncode({
      'session':session,
      'savedAt':DateTime.now().toUtc().toIso8601String(),
    }));
  }
  Future<Map<String,dynamic>?> quizSession(String guide,String lesson,String lang)async{
    final raw=await _secret.read(key:_quizKey(guide,lesson,lang));
    if(raw==null)return null;
    try{
      final data=jsonDecode(raw);
      if(data is! Map ||data['session'] is! Map)return null;
      final session=Map<String,dynamic>.from(data['session'] as Map);
      final expiry=DateTime.tryParse((session['expiresAt']??session['resumeUntil']??'').toString());
      // A session without an explicit expiry must not be used offline.
      if(expiry==null||!expiry.isAfter(DateTime.now().toUtc()))return null;
      return session;
    }catch(_){return null;}
  }
  Future<void> saveQuizAnswers(String guide,String lesson,String lang,
      String sessionId,Map<String,Object?> answers)async{
    await _secret.write(key:_quizKey(guide,lesson,lang)+':answers',
      value:jsonEncode({'sessionId':sessionId,'answers':answers}));
  }
  Future<Map<String,Object?>> quizAnswers(String guide,String lesson,String lang,
      String sessionId)async{
    final raw=await _secret.read(key:_quizKey(guide,lesson,lang)+':answers');
    if(raw==null)return {};
    try{
      final data=Map<String,dynamic>.from(jsonDecode(raw) as Map);
      if(data['sessionId']!=sessionId || data['answers'] is! Map)return {};
      return Map<String,Object?>.from(data['answers'] as Map);
    }catch(_){return {};}
  }
  Future<void> clearQuiz(String guide,String lesson,String lang)async{
    await _secret.delete(key:_quizKey(guide,lesson,lang));
    await _secret.delete(key:_quizKey(guide,lesson,lang)+':pending');
    await _secret.delete(key:_quizKey(guide,lesson,lang)+':answers');
  }
  Future<void> queueQuiz(String guide,String lesson,String lang,
      Map<String,dynamic> session,Map<String,Object?> answers)async{
    final expiry=DateTime.tryParse((session['expiresAt']??session['resumeUntil']??'').toString());
    if(expiry==null||!expiry.isAfter(DateTime.now().toUtc())){
      throw const VopApiException('The online assessment session expired. Reconnect to start a valid attempt.');
    }
    await _secret.write(key:_quizKey(guide,lesson,lang)+':pending',
      value:jsonEncode({'guideId':guide,'lessonId':lesson,'language':lang,
        'sessionId':session['sessionId'],'expiresAt':session['expiresAt']??session['resumeUntil'],
        'answers':answers}));
    final prefs=await SharedPreferences.getInstance();
    final key=_key('pendingQuizIndex','all');
    final saved=prefs.getString(key);
    List<Map<String,dynamic>> all=[];
    try{
      final data=saved==null?null:jsonDecode(saved);
      if(data is List)all=data.whereType<Map>().map((v)=>Map<String,dynamic>.from(v)).toList();
    }catch(_){}
    all.removeWhere((item)=>item['guideId']==guide && item['lessonId']==lesson
      && item['language']==lang);
    all.add({'guideId':guide,'lessonId':lesson,'language':lang});
    await prefs.setString(key,jsonEncode(all.take(30).toList()));
  }
  Future<int> syncPendingQuiz(VopApi api)async{
    final prefs=await SharedPreferences.getInstance();
    final key=_key('pendingQuizIndex','all');
    final raw=prefs.getString(key);
    if(raw==null)return 0;
    List<Map<String,dynamic>> keys=[];
    try{
      final value=jsonDecode(raw);
      if(value is List)keys=value.whereType<Map>()
        .map((e)=>Map<String,dynamic>.from(e)).toList();
    }catch(_){return 0;}
    final pending=<Map<String,dynamic>>[];
    var uploaded=0;
    for(final entry in keys){
      final guide=entry['guideId'].toString(),
        lesson=entry['lessonId'].toString(),
        lang=entry['language'].toString();
      final encrypted=await _secret.read(key:_quizKey(guide,lesson,lang)+':pending');
      if(encrypted==null)continue;
      try{
        final data=Map<String,dynamic>.from(jsonDecode(encrypted) as Map);
        final expiry=DateTime.tryParse((data['expiresAt']??'').toString());
        if(expiry==null||!expiry.isAfter(DateTime.now().toUtc())){
          pending.add(entry);
          continue;
        }
        await api.submitQuiz(guide,lesson,lang,data['sessionId'].toString(),
          Map<String,Object?>.from(data['answers'] as Map));
        await clearQuiz(guide,lesson,lang);
        uploaded++;
      }catch(_){pending.add(entry);}
    }
    await prefs.setString(key,jsonEncode(pending));
    return uploaded;
  }
}
