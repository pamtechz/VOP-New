import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Previously authorised content is user-scoped. Quiz sessions and pending
/// submissions stay encrypted; the server alone determines grades and access.
class OfflineStudyStore {
  OfflineStudyStore(this.uid);
  final String uid;
  static const int _schema=1;
  static const int _maxLessonBytes=750000;
  static const int _maxQuizBytes=170000;
  static const int _maxIndexBytes=900000;
  static const FlutterSecureStorage _secure=FlutterSecureStorage(
    aOptions:AndroidOptions(encryptedSharedPreferences:true));

  String _key(String type,String guide,String lesson,String language)=>
    'vop.offline.$_schema.$uid.$type.$language.$guide.$lesson';
  String _indexKey(String id)=>'vop.offline.$_schema.$uid.index.$id';
  String get _queueKey=>'vop.offline.$_schema.$uid.pending';

  bool _validId(String id)=>id=='catalogue' ||
    RegExp(r'^[A-Za-z0-9_-]{1,120}$').hasMatch(id);

  Future<void> savePublishedIndex(String id,Map<String,dynamic> data)async{
    if(!_validId(id))throw ArgumentError('Invalid offline catalogue ID.');
    final content=jsonEncode(data);
    if(content.length>_maxIndexBytes)throw StateError(
      'The catalogue is too large for offline storage.');
    final prefs=await SharedPreferences.getInstance();
    await prefs.setString(_indexKey(id),content);
  }
  Future<Map<String,dynamic>?> publishedIndex(String id)async{
    if(!_validId(id))return null;
    final prefs=await SharedPreferences.getInstance();
    final raw=prefs.getString(_indexKey(id));
    if(raw==null)return null;
    try{
      final decoded=jsonDecode(raw);
      return decoded is Map ? Map<String,dynamic>.from(decoded):null;
    }catch(_){return null;}
  }

  Future<bool> hasLesson(String guide,String lesson,String language)async{
    final prefs=await SharedPreferences.getInstance();
    return prefs.containsKey(_key('lesson',guide,lesson,language));
  }
  Future<void> saveLesson(String guide,String lesson,String language,
      Map<String,dynamic> response)async{
    final content=response['lesson'];
    if(content is! Map || content['pages'] is! List)throw StateError(
      'A verified published lesson is required for offline storage.');
    final encoded=jsonEncode(response);
    if(encoded.length>_maxLessonBytes)throw StateError(
      'This lesson exceeds the offline storage limit.');
    final prefs=await SharedPreferences.getInstance();
    await prefs.setString(_key('lesson',guide,lesson,language),encoded);
  }
  Future<Map<String,dynamic>?> lesson(
      String guide,String lesson,String language)async{
    final prefs=await SharedPreferences.getInstance();
    final raw=prefs.getString(_key('lesson',guide,lesson,language));
    if(raw==null)return null;
    try{
      final decoded=jsonDecode(raw);
      return decoded is Map ? Map<String,dynamic>.from(decoded):null;
    }catch(_){return null;}
  }

  Future<void> saveQuiz(String guide,String lesson,String language,
      Map<String,dynamic> response)async{
    if(response['sessionId'] is! String || response['questions'] is! List)return;
    final expires=DateTime.tryParse((response['expiresAt']??'').toString());
    if(expires==null||!expires.isAfter(DateTime.now()))return;
    final questions=response['questions'] as List;
    if(questions.any((question)=>question is Map && (
        question.containsKey('correctOptionIndex')||
        question.containsKey('correctAnswer')||
        question.containsKey('answerKey'))))return;
    final encoded=jsonEncode(response);
    if(encoded.length>_maxQuizBytes)return;
    await _secure.write(key:_key('quiz',guide,lesson,language),value:encoded);
  }
  Future<Map<String,dynamic>?> quiz(
      String guide,String lesson,String language)async{
    String? raw;
    try{raw=await _secure.read(key:_key('quiz',guide,lesson,language));}
    catch(_){return null;}
    if(raw==null)return null;
    try{
      final decoded=jsonDecode(raw);
      if(decoded is! Map)return null;
      final result=Map<String,dynamic>.from(decoded);
      final expires=DateTime.tryParse((result['expiresAt']??'').toString());
      if(expires==null||!expires.isAfter(DateTime.now())){
        await _secure.delete(key:_key('quiz',guide,lesson,language));
        return null;
      }
      return result;
    }catch(_){return null;}
  }

  Future<List<Map<String,dynamic>>> pending()async{
    String? raw;
    try{raw=await _secure.read(key:_queueKey);}
    catch(_){return [];}
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
    final items=await pending();
    final id=[action,payload['language'],payload['guideId'],payload['lessonId'],
      if(action=='submitQuiz')payload['sessionId']].join(':');
    items.removeWhere((row)=>row['id']==id);
    items.add({'id':id,'action':action,'payload':payload});
    if(items.length>60)items.removeRange(0,items.length-60);
    await _secure.write(key:_queueKey,value:jsonEncode(items));
  }
  Future<void> remove(String id)async{
    final items=await pending();
    items.removeWhere((row)=>row['id']==id);
    await _secure.write(key:_queueKey,value:jsonEncode(items));
  }
}
