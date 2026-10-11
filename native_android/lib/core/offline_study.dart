import 'dart:convert';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'vop_api.dart';

/// All downloaded content is private to the signed-in Firebase user and
/// encrypted at rest by Android Keystore-backed secure storage.
class OfflineStudy {
  OfflineStudy._();
  static final instance=OfflineStudy._();
  static const storage=FlutterSecureStorage();
  static const maxItems=24,maxPackageBytes=180000,maxPending=120;
  Future<void>? _sync;

  String get uid {
    final current=FirebaseAuth.instance.currentUser;
    if(current==null)throw const VopApiException('Sign in to access downloaded lessons.');
    return current.uid;
  }
  String _key(String owner,String suffix)=>'vop_offline_v2:$owner:$suffix';
  String _itemKey(String owner,String kind,String language,String guide,String lesson)=>
    _key(owner,'$kind:$language:$guide:$lesson');
  Future<List<String>> _list(String owner)async{
    final raw=await storage.read(key:_key(owner,'index'));
    final decoded=raw==null?null:jsonDecode(raw);
    return decoded is List?decoded.whereType<String>().take(maxItems).toList():[];
  }
  Future<Map<String,dynamic>?> _get(String key)async{
    final raw=await storage.read(key:key);
    if(raw==null)return null;
    final decoded=jsonDecode(raw);
    return decoded is Map?Map<String,dynamic>.from(decoded):null;
  }
  Future<void> _save(String key,Map<String,dynamic> payload)async{
    final owner=uid;
    final encoded=jsonEncode(payload);
    if(encoded.length>maxPackageBytes)throw const VopApiException(
      'This lesson is too large for a secure offline package.');
    var index=await _list(owner);
    index.remove(key);
    while(index.length>=maxItems){
      final oldest=index.removeAt(0);
      await storage.delete(key:oldest);
    }
    await storage.write(key:key,value:encoded);
    index.add(key);
    await storage.write(key:_key(owner,'index'),value:jsonEncode(index));
  }
  Future<void> saveLesson(String guideId,String lessonId,
      String language,Map<String,dynamic> payload)async{
    final lesson=payload['lesson'];
    if(lesson is! Map || lesson['pages'] is! List)throw const VopApiException(
      'This lesson has no downloadable pages.');
    final key=_itemKey(uid,'lesson',language,guideId,lessonId);
    await _save(key,{
      'kind':'lesson','language':language,'guideId':guideId,'lessonId':lessonId,
      'savedAt':DateTime.now().toUtc().toIso8601String(),
      'title':(lesson['title']??'Lesson').toString(),
      'lesson':lesson,'guide':payload['guide'],
    });
  }
  Future<Map<String,dynamic>?> lesson(String guideId,String lessonId,
      String language)async{
    final record=await _get(_itemKey(uid,'lesson',language,guideId,lessonId));
    if(record==null)return null;
    return {'ok':true,'lesson':record['lesson'],'guide':record['guide'],
      'offline':true};
  }
  Future<bool> hasLesson(String guideId,String lessonId,String language)async=>
      await lesson(guideId,lessonId,language)!=null;

  /// A downloaded quiz MUST be a real server-issued session. Only the fields
  /// needed to answer are persisted, never answer keys, scores or tokens.
  Future<void> saveQuiz(String guideId,String lessonId,
      String language,Map<String,dynamic> issued,{String title=''})async{
    final sessionId=(issued['sessionId']??'').toString();
    final expires=DateTime.tryParse((issued['expiresAt']??'').toString());
    if(sessionId.isEmpty||expires==null||!expires.isAfter(DateTime.now().toUtc()))
      throw const VopApiException('The server did not issue a valid offline quiz session.');
    final questions=issued['questions'];
    if(questions is! List||questions.isEmpty)throw const VopApiException(
      'There are no downloadable quiz questions.');
    final safe=questions.whereType<Map>().map((q)=>({
      'id':q['id'],'prompt':q['prompt'],'question':q['question'],
      'type':q['type'],'options':q['options'],
    })).toList();
    await _save(_itemKey(uid,'quiz',language,guideId,lessonId),{
      'kind':'quiz','language':language,'guideId':guideId,'lessonId':lessonId,
      'sessionId':sessionId,'expiresAt':expires.toUtc().toIso8601String(),
      'title':title,
      'questions':safe,'assessmentPolicy':issued['assessmentPolicy'],
    });
  }
  Future<Map<String,dynamic>?> quiz(String guideId,String lessonId,
      String language)async{
    final record=await _get(_itemKey(uid,'quiz',language,guideId,lessonId));
    if(record==null)return null;
    final expires=DateTime.tryParse((record['expiresAt']??'').toString());
    if(expires==null||!expires.isAfter(DateTime.now().toUtc()))return null;
    return {...record,'ok':true,'offline':true};
  }
  Future<List<Map<String,dynamic>>> downloaded()async{
    final results=<Map<String,dynamic>>[];
    for(final key in await _list(uid)){
      final entry=await _get(key);
      if(entry!=null)results.add(entry);
    }
    return results.reversed.toList();
  }
  Future<int> downloadedCount()async=> (await _list(uid)).length;
  Future<void> clearDownloads()async{
    final owner=uid;
    for(final key in await _list(owner)){await storage.delete(key:key);}
    await storage.delete(key:_key(owner,'index'));
  }

  Future<List<Map<String,dynamic>>> pending()async{
    final raw=await storage.read(key:_key(uid,'pending'));
    if(raw==null)return [];
    final decoded=jsonDecode(raw);
    return decoded is List
      ?decoded.whereType<Map>().map((row)=>Map<String,dynamic>.from(row)).toList()
      :[];
  }
  Future<void> queue(String type,String guideId,String lessonId,
      String language,{int pageIndex=0,String? sessionId,
      Map<String,Object?>? answers,String? expiresAt})async{
    final owner=uid,queue=await pending();
    if(queue.length>=maxPending)throw const VopApiException(
      'Your offline sync queue is full. Connect to the internet to sync.');
    final entry={
      'type':type,'owner':owner,'guideId':guideId,'lessonId':lessonId,
      'language':language,'pageIndex':pageIndex,
      'sessionId':sessionId,'answers':answers,'expiresAt':expiresAt,
    };
    final existing=queue.indexWhere((row)=>
      row['type']==type&&row['language']==language&&
      row['guideId']==guideId&&row['lessonId']==lessonId);
    if(existing>=0){queue[existing]=entry;}else{queue.add(entry);}
    await storage.write(key:_key(owner,'pending'),value:jsonEncode(queue));
  }
  Future<int> pendingCount()async=>(await pending()).length;
  Future<void> clearPending()async=>
    storage.delete(key:_key(uid,'pending'));


  /// Replay only against canonical server endpoints. A failed or expired quiz
  /// remains pending and never receives a locally manufactured result.
  Future<void> sync(VopApi api)async{
    if(_sync!=null)return _sync;
    final owner=uid;
    final future=_syncNow(api,owner);
    _sync=future;
    try{await future;}finally{_sync=null;}
  }
  Future<void> _syncNow(VopApi api,String owner)async{
    final items=await pending();
    final remaining=<Map<String,dynamic>>[];
    for(var index=0;index<items.length;index++){
      final item=items[index];
      if(FirebaseAuth.instance.currentUser?.uid!=owner){
        remaining.addAll(items.skip(index));
        break;
      }
      try{
        final kind=(item['type']??'').toString();
        final guide=(item['guideId']??'').toString();
        final lesson=(item['lessonId']??'').toString();
        final lang=(item['language']??'').toString();
        if(kind=='completion'){
          await api.completeLesson(guide,lesson,lang);
        }else if(kind=='resume'){
          await api.saveResume(guide,lesson,lang,(item['pageIndex'] as num).toInt());
        }else if(kind=='quiz'){
          final expires=DateTime.tryParse((item['expiresAt']??'').toString());
          if(expires==null||!expires.isAfter(DateTime.now().toUtc())){
            remaining.add(item);continue;
          }
          await api.submitQuiz(guide,lesson,lang,
            (item['sessionId']??'').toString(),
            Map<String,Object?>.from(item['answers'] as Map? ?? {}));
        }else{remaining.add(item);}
      }catch(error){
        remaining.add(item);
        if(error is VopApiException&&(error.status>=400&&error.status<500)){
          continue;
        }
        remaining.addAll(items.skip(index+1));
        break;
      }
    }
    if(FirebaseAuth.instance.currentUser?.uid==owner){
      // A new page position or quiz answer may be queued while requests are
      // in flight. Remove only the exact submissions the server accepted.
      final waiting=remaining.map(jsonEncode).toSet();
      final accepted=items.map(jsonEncode).where(
        (entry)=>!waiting.contains(entry)).toSet();
      final latest=await pending();
      final updated=latest.where((item)=>
        !accepted.contains(jsonEncode(item))).toList();
      await storage.write(key:_key(owner,'pending'),value:jsonEncode(updated));
    }
  }
}
