import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Stores only authenticated user's published lesson pages and short-lived
/// assessment drafts. No grading keys or privileged curriculum records.
class OfflineStudyStore {
  OfflineStudyStore(this.uid);
  final String uid;
  static const _secure=FlutterSecureStorage(aOptions:AndroidOptions(encryptedSharedPreferences:true));
  static const _schema=1;
  static const _maxLessonBytes=750000;
  static const _maxQuizBytes=170000;
  String _key(String type,String guide,String lesson,String language)=>
    'vop.offline.$_schema.$uid.$type.$language.$guide.$lesson';
  Future<void> savePublishedIndex(String id,Map<String,dynamic> data)async{
    if(id!='catalogue'&&!RegExp(r'^[A-Za-z0-9_-]{1,120}
    final preferences=await SharedPreferences.getInstance();
    return preferences.containsKey(_key('lesson',guide,lesson,language));
  }
  Future<void> saveLesson(String guide,String lesson,String language,
    Map<String,dynamic> response)async{
    final data=response['lesson'];
    if(data is! Map || data['pages'] is! List)throw StateError(
      'A verified published lesson is required for offline storage.');
    final serialized=jsonEncode(response);
    if(serialized.length>_maxLessonBytes)throw StateError(
      'This lesson exceeds the offline storage limit.');
    final preferences=await SharedPreferences.getInstance();
    await preferences.setString(_key('lesson',guide,lesson,language),serialized);
  }
  Future<Map<String,dynamic>?> lesson(String guide,String lesson,String language)async{
    final preferences=await SharedPreferences.getInstance();
    final raw=preferences.getString(_key('lesson',guide,lesson,language));
    if(raw==null)return null;
    try{
      final decoded=jsonDecode(raw);
      return decoded is Map ? Map<String,dynamic>.from(decoded):null;
    }catch(_){return null;}
  }
  Future<void> saveQuiz(String guide,String lesson,String language,
    Map<String,dynamic> response)async{
    if(response['sessionId'] is! String || response['questions'] is! List)return;
    // Assessment question sets contain NO answer keys. Store a short-lived
    // authorised attempt; the server still handles expiry, scores and retakes.
    final expiry=DateTime.tryParse((response['expiresAt']??'').toString());
    if(expiry==null || !expiry.isAfter(DateTime.now()))return;
    final data=jsonEncode(response);
    if(data.length>_maxQuizBytes)return;
    await _secure.write(key:_key('quiz',guide,lesson,language),value:data);
  }
  Future<Map<String,dynamic>?> quiz(String guide,String lesson,String language)async{
    final raw=await _secure.read(key:_key('quiz',guide,lesson,language));
    if(raw==null)return null;
    try{
      final decoded=jsonDecode(raw);
      if(decoded is! Map)return null;
      final data=Map<String,dynamic>.from(decoded);
      final expires=DateTime.tryParse((data['expiresAt']??'').toString());
      if(expires==null || !expires.isAfter(DateTime.now())){
        await _secure.delete(key:_key('quiz',guide,lesson,language));
        return null;
      }
      return data;
    }catch(_){return null;}
  }
  String get _queueKey=>'vop.offline.$_schema.$uid.pending';
  Future<List<Map<String,dynamic>>> pending()async{
    final raw=await _secure.read(key:_queueKey);
    if(raw==null)return [];
    try{
      final data=jsonDecode(raw);
      return data is List
        ?data.whereType<Map>().map((row)=>Map<String,dynamic>.from(row)).toList()
        :[];
    }catch(_){return [];}
  }
  Future<void> enqueue(String action,Map<String,dynamic> payload)async{
    if(!{'saveLessonResume','completeLesson','submitQuiz'}.contains(action)){
      throw ArgumentError('Unsupported queued action.');
    }
    final current=await pending();
    final id=[action,payload['language'],payload['guideId'],payload['lessonId'],
      if(action=='submitQuiz')payload['sessionId']].join(':');
    current.removeWhere((row)=>row['id']==id);
    current.add({'id':id,'action':action,'payload':payload});
    if(current.length>60)current.removeRange(0,current.length-60);
    await _secure.write(key:_queueKey,value:jsonEncode(current));
  }
  Future<void> remove(String id)async{
    final items=await pending();
    items.removeWhere((item)=>item['id']==id);
    await _secure.write(key:_queueKey,value:jsonEncode(items));
  }
}
).hasMatch(id)){
      throw ArgumentError('Invalid offline catalogue ID.');
    }
    final content=jsonEncode(data);
    if(content.length>900000)throw StateError('The catalogue is too large for offline storage.');
    final prefs=await SharedPreferences.getInstance();
    await prefs.setString('vop.offline.$_schema.$uid.index.$id',content);
  }
  Future<Map<String,dynamic>?> publishedIndex(String id)async{
    if(id!='catalogue'&&!RegExp(r'^[A-Za-z0-9_-]{1,120}
    final preferences=await SharedPreferences.getInstance();
    return preferences.containsKey(_key('lesson',guide,lesson,language));
  }
  Future<void> saveLesson(String guide,String lesson,String language,
    Map<String,dynamic> response)async{
    final data=response['lesson'];
    if(data is! Map || data['pages'] is! List)throw StateError(
      'A verified published lesson is required for offline storage.');
    final serialized=jsonEncode(response);
    if(serialized.length>_maxLessonBytes)throw StateError(
      'This lesson exceeds the offline storage limit.');
    final preferences=await SharedPreferences.getInstance();
    await preferences.setString(_key('lesson',guide,lesson,language),serialized);
  }
  Future<Map<String,dynamic>?> lesson(String guide,String lesson,String language)async{
    final preferences=await SharedPreferences.getInstance();
    final raw=preferences.getString(_key('lesson',guide,lesson,language));
    if(raw==null)return null;
    try{
      final decoded=jsonDecode(raw);
      return decoded is Map ? Map<String,dynamic>.from(decoded):null;
    }catch(_){return null;}
  }
  Future<void> saveQuiz(String guide,String lesson,String language,
    Map<String,dynamic> response)async{
    if(response['sessionId'] is! String || response['questions'] is! List)return;
    // Assessment question sets contain NO answer keys. Store a short-lived
    // authorised attempt; the server still handles expiry, scores and retakes.
    final expiry=DateTime.tryParse((response['expiresAt']??'').toString());
    if(expiry==null || !expiry.isAfter(DateTime.now()))return;
    final data=jsonEncode(response);
    if(data.length>_maxQuizBytes)return;
    await _secure.write(key:_key('quiz',guide,lesson,language),value:data);
  }
  Future<Map<String,dynamic>?> quiz(String guide,String lesson,String language)async{
    final raw=await _secure.read(key:_key('quiz',guide,lesson,language));
    if(raw==null)return null;
    try{
      final decoded=jsonDecode(raw);
      if(decoded is! Map)return null;
      final data=Map<String,dynamic>.from(decoded);
      final expires=DateTime.tryParse((data['expiresAt']??'').toString());
      if(expires==null || !expires.isAfter(DateTime.now())){
        await _secure.delete(key:_key('quiz',guide,lesson,language));
        return null;
      }
      return data;
    }catch(_){return null;}
  }
  String get _queueKey=>'vop.offline.$_schema.$uid.pending';
  Future<List<Map<String,dynamic>>> pending()async{
    final raw=await _secure.read(key:_queueKey);
    if(raw==null)return [];
    try{
      final data=jsonDecode(raw);
      return data is List
        ?data.whereType<Map>().map((row)=>Map<String,dynamic>.from(row)).toList()
        :[];
    }catch(_){return [];}
  }
  Future<void> enqueue(String action,Map<String,dynamic> payload)async{
    if(!{'saveLessonResume','completeLesson','submitQuiz'}.contains(action)){
      throw ArgumentError('Unsupported queued action.');
    }
    final current=await pending();
    final id=[action,payload['language'],payload['guideId'],payload['lessonId'],
      if(action=='submitQuiz')payload['sessionId']].join(':');
    current.removeWhere((row)=>row['id']==id);
    current.add({'id':id,'action':action,'payload':payload});
    if(current.length>60)current.removeRange(0,current.length-60);
    await _secure.write(key:_queueKey,value:jsonEncode(current));
  }
  Future<void> remove(String id)async{
    final items=await pending();
    items.removeWhere((item)=>item['id']==id);
    await _secure.write(key:_queueKey,value:jsonEncode(items));
  }
}
).hasMatch(id))return null;
    final prefs=await SharedPreferences.getInstance();
    final raw=prefs.getString('vop.offline.$_schema.$uid.index.$id');
    if(raw==null)return null;
    try{
      final data=jsonDecode(raw);
      return data is Map?Map<String,dynamic>.from(data):null;
    }catch(_){return null;}
  }
  Future<bool> hasLesson(String guide,String lesson,String language)async{
    final preferences=await SharedPreferences.getInstance();
    return preferences.containsKey(_key('lesson',guide,lesson,language));
  }
  Future<void> saveLesson(String guide,String lesson,String language,
    Map<String,dynamic> response)async{
    final data=response['lesson'];
    if(data is! Map || data['pages'] is! List)throw StateError(
      'A verified published lesson is required for offline storage.');
    final serialized=jsonEncode(response);
    if(serialized.length>_maxLessonBytes)throw StateError(
      'This lesson exceeds the offline storage limit.');
    final preferences=await SharedPreferences.getInstance();
    await preferences.setString(_key('lesson',guide,lesson,language),serialized);
  }
  Future<Map<String,dynamic>?> lesson(String guide,String lesson,String language)async{
    final preferences=await SharedPreferences.getInstance();
    final raw=preferences.getString(_key('lesson',guide,lesson,language));
    if(raw==null)return null;
    try{
      final decoded=jsonDecode(raw);
      return decoded is Map ? Map<String,dynamic>.from(decoded):null;
    }catch(_){return null;}
  }
  Future<void> saveQuiz(String guide,String lesson,String language,
    Map<String,dynamic> response)async{
    if(response['sessionId'] is! String || response['questions'] is! List)return;
    // Assessment question sets contain NO answer keys. Store a short-lived
    // authorised attempt; the server still handles expiry, scores and retakes.
    final expiry=DateTime.tryParse((response['expiresAt']??'').toString());
    if(expiry==null || !expiry.isAfter(DateTime.now()))return;
    final data=jsonEncode(response);
    if(data.length>_maxQuizBytes)return;
    await _secure.write(key:_key('quiz',guide,lesson,language),value:data);
  }
  Future<Map<String,dynamic>?> quiz(String guide,String lesson,String language)async{
    final raw=await _secure.read(key:_key('quiz',guide,lesson,language));
    if(raw==null)return null;
    try{
      final decoded=jsonDecode(raw);
      if(decoded is! Map)return null;
      final data=Map<String,dynamic>.from(decoded);
      final expires=DateTime.tryParse((data['expiresAt']??'').toString());
      if(expires==null || !expires.isAfter(DateTime.now())){
        await _secure.delete(key:_key('quiz',guide,lesson,language));
        return null;
      }
      return data;
    }catch(_){return null;}
  }
  String get _queueKey=>'vop.offline.$_schema.$uid.pending';
  Future<List<Map<String,dynamic>>> pending()async{
    final raw=await _secure.read(key:_queueKey);
    if(raw==null)return [];
    try{
      final data=jsonDecode(raw);
      return data is List
        ?data.whereType<Map>().map((row)=>Map<String,dynamic>.from(row)).toList()
        :[];
    }catch(_){return [];}
  }
  Future<void> enqueue(String action,Map<String,dynamic> payload)async{
    if(!{'saveLessonResume','completeLesson','submitQuiz'}.contains(action)){
      throw ArgumentError('Unsupported queued action.');
    }
    final current=await pending();
    final id=[action,payload['language'],payload['guideId'],payload['lessonId'],
      if(action=='submitQuiz')payload['sessionId']].join(':');
    current.removeWhere((row)=>row['id']==id);
    current.add({'id':id,'action':action,'payload':payload});
    if(current.length>60)current.removeRange(0,current.length-60);
    await _secure.write(key:_queueKey,value:jsonEncode(current));
  }
  Future<void> remove(String id)async{
    final items=await pending();
    items.removeWhere((item)=>item['id']==id);
    await _secure.write(key:_queueKey,value:jsonEncode(items));
  }
}
