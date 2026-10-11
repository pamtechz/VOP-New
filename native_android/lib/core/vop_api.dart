import 'dart:async';
import 'dart:convert';

import 'package:firebase_auth/firebase_auth.dart';
import 'package:http/http.dart' as http;

import 'config.dart';
import 'offline_study.dart';

class VopApiException implements Exception {
  const VopApiException(this.message, {this.status = 0, this.code = ''});
  final String message;
  final int status;
  final String code;
  @override
  String toString() => message;
}

/// Native clients MUST use the same session-aware mutation endpoints as web.
/// The mobile BFF is read-only; this class never touches a Firestore Admin key.
class VopApi {
  VopApi({FirebaseAuth? auth, http.Client? client})
      : _auth = auth ?? FirebaseAuth.instance,
        _client = client ?? http.Client();

  final FirebaseAuth _auth;
  final http.Client _client;
  static const _timeout = Duration(seconds: 25);

  Uri _url(String path, [Map<String, String>? query]) {
    if (!const {
      '/api/mobile',
      '/api/study/progress',
      '/api/mentorship',
      '/api/engagement',
      '/api/share',
      '/api/prayer',
      '/api/certificates',
      '/api/admin/notifications',
      '/api/admin/users',
      '/api/account',
      '/api/localization',
    }.contains(path)) {
      throw const VopApiException('Unsupported VOP API endpoint.');
    }
    final origin = Uri.parse(VopConfig.apiUrl);
    final uri = origin.replace(
      path: path,
      queryParameters: query?.isEmpty == true ? null : query,
    );
    if (uri.scheme != 'https' || uri.host != origin.host) {
      throw const VopApiException('Untrusted API destination.');
    }
    return uri;
  }

  Future<Map<String, dynamic>> _execute(
      String path, String method, Object? body, Map<String, String>? query,
      {bool retried = false}) async {
    final user = _auth.currentUser;
    if (user == null) {
      throw const VopApiException('Sign in to continue.', status: 401);
    }
    final token = await user.getIdToken(retried);
    if (token == null || token.isEmpty) {
      throw const VopApiException('Your sign-in session has expired.', status: 401);
    }
    final request = http.Request(method, _url(path, query))
      ..followRedirects = false
      ..headers.addAll({
        'Authorization': 'Bearer $token',
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      });
    if (body != null) request.body = jsonEncode(body);
    try {
      final streamed = await _client.send(request).timeout(_timeout);
      // Never forward Firebase bearer tokens to a redirected host.
      if (streamed.statusCode >= 300 && streamed.statusCode < 400) {
        throw const VopApiException('Unexpected API redirect.');
      }
      final response = await http.Response.fromStream(streamed).timeout(_timeout);
      final value = jsonDecode(response.body);
      final data = value is Map ? Map<String, dynamic>.from(value) : <String, dynamic>{};
      if (response.statusCode == 401 && !retried) {
        return await _execute(path, method, body, query, retried: true);
      }
      if (response.statusCode < 200 || response.statusCode >= 300 ||
          data['ok'] == false) {
        throw VopApiException(
          (data['error'] ?? 'VOP could not complete this request.').toString(),
          status: response.statusCode,
          code: (data['code'] ?? '').toString(),
        );
      }
      return data;
    } on TimeoutException {
      throw const VopApiException('The connection timed out. Retry when online.');
    } on FormatException {
      throw const VopApiException('VOP returned an invalid response.');
    } on http.ClientException {
      throw const VopApiException('Network unavailable. Check your connection.');
    }
  }

  Future<Map<String, dynamic>> read(String resource,
      [Map<String, String> params = const {}]) =>
      _execute('/api/mobile', 'GET', null, {'resource': resource, ...params});

  Future<Map<String, dynamic>> action(String path, Map<String, Object?> body) =>
      _execute(path, 'POST', body, null);

  Future<Map<String, dynamic>> bootstrap() => read('bootstrap');
  Future<Map<String,dynamic>> accountProfile() =>
      action('/api/admin/users',{'action':'profile'});
  Future<Map<String,dynamic>> saveProfile(Map<String,dynamic> profile) =>
      action('/api/admin/users',{'action':'updateOwnProfile','profile':profile});
  Future<Map<String,dynamic>> personalSettings() =>
      action('/api/admin/users',{'action':'personalSettings','operation':'get'});
  Future<Map<String,dynamic>> savePersonalSettings(Map<String,dynamic> settings) =>
      action('/api/admin/users',{'action':'personalSettings','settings':settings});
  Future<Map<String,dynamic>> accountLifecycle() =>
      _execute('/api/account','GET',null,{'action':'status'});
  Future<Map<String,dynamic>> requestAccountDeletion() =>
      action('/api/account',{'action':'request-deletion'});
  Future<Map<String,dynamic>> cancelAccountDeletion() =>
      action('/api/account',{'action':'cancel-deletion'});
  Future<Map<String,dynamic>> supportedLanguages() => read('languages');
  Future<Map<String,dynamic>> localizations(String locale) =>
      _execute('/api/localization','GET',null,{'locale':locale});

  Future<Map<String,dynamic>> catalogue()async{
    try{
      final value=await read('catalog');
      try{await _offline.savePublishedIndex('catalogue',value);}catch(_){}
      return value;
    }catch(error){
      if(!_connectionFailure(error))rethrow;
      final cached=await _offline.publishedIndex('catalogue');
      if(cached==null)rethrow;
      return {...cached,'offline':true};
    }
  }
  Future<Map<String, dynamic>> resources() => read('resources');
  Future<Map<String, dynamic>> events() => read('events');
  Future<Map<String, dynamic>> radio() => read('radio');
  Future<Map<String, dynamic>> announcements() => read('announcements');
  Future<Map<String,dynamic>> notifications()=>
      _execute('/api/admin/notifications','GET',null,{'action':'list'});
  Future<Map<String,dynamic>> markNotificationRead(String id)=>
      action('/api/admin/notifications',
        {'action':'markRead','notificationId':id});
  Future<Map<String,dynamic>> markAllNotificationsRead()=>
      action('/api/admin/notifications',{'action':'markAllRead'});
  Future<Map<String,dynamic>> deleteNotification(String id)=>
      action('/api/admin/notifications',
        {'action':'delete','notificationId':id});
  Future<Map<String, dynamic>> certificates() =>
      _execute('/api/certificates', 'GET', null, {'action': 'mine'});
  Future<Map<String, dynamic>> prayers({bool mine = true}) =>
      _execute('/api/prayer','GET',null,{'mine': mine ? 'true' : 'false'});
  Future<Map<String,dynamic>> submitPrayer({
      required String requestText,required String category,
      required bool isPrivate}) =>
      action('/api/prayer',{'action':'create',
        'requestText':requestText,'category':category,'isPrivate':isPrivate});

  OfflineStudyStore get _offline {
    final uid=_auth.currentUser?.uid;
    if(uid==null || uid.isEmpty)throw const VopApiException('Sign in to view offline studies.');
    return OfflineStudyStore(uid);
  }
  bool _connectionFailure(Object error)=>
    error is VopApiException && error.status==0 &&
      (error.message.contains('Network unavailable')||
       error.message.contains('connection timed out'));

  Future<Map<String,dynamic>> progress()=>read('progress');
  Future<Map<String,dynamic>> guide(String id)async{
    try{
      final data=await read('guide',{'guideId':id});
      try{await _offline.savePublishedIndex(id,data);}catch(_){}
      return data;
    }catch(error){
      if(!_connectionFailure(error))rethrow;
      final cached=await _offline.publishedIndex(id);
      if(cached==null)rethrow;
      return {...cached,'offline':true};
    }
  }
  Future<bool> isLessonDownloaded(String guideId,String lessonId,
    String language)=>_offline.hasLesson(guideId,lessonId,language);
  Future<void> downloadLesson(String guideId,String lessonId,String language)async{
    final response=await read('lesson',{'guideId':guideId,'lessonId':lessonId});
    await _offline.saveLesson(guideId,lessonId,language,response);
  }
  Future<Map<String,dynamic>> lesson(String guideId,String lessonId,
      {String language='en'})async{
    try{
      return await read('lesson',{'guideId':guideId,'lessonId':lessonId});
    }catch(error){
      if(!_connectionFailure(error))rethrow;
      final saved=await _offline.lesson(guideId,lessonId,language);
      if(saved==null)rethrow;
      return {...saved,'offline':true};
    }
  }
  Future<Map<String,dynamic>> _pendingAction(
      String actionName,Map<String,Object?> request)async{
    try{
      return await action('/api/study/progress',request);
    }catch(error){
      if(!_connectionFailure(error))rethrow;
      await _offline.enqueue(actionName,Map<String,dynamic>.from(request));
      return {'ok':true,'queued':true};
    }
  }
  Future<Map<String,dynamic>> saveResume(
    String guideId,String lessonId,String language,int pageIndex)=>
      _pendingAction('saveLessonResume',{
        'action':'saveLessonResume','guideId':guideId,
        'lessonId':lessonId,'language':language,'pageIndex':pageIndex,
      });
  Future<Map<String,dynamic>> completeLesson(
    String guideId,String lessonId,String language)=>
      _pendingAction('completeLesson',{
        'action':'completeLesson','guideId':guideId,
        'lessonId':lessonId,'language':language,
      });
  Future<Map<String,dynamic>> startQuiz(
      String guideId,String lessonId,String language,
      {bool confirmRetake=false})async{
    try{
      final response=await action('/api/study/progress',{
        'action':'startQuiz','guideId':guideId,'lessonId':lessonId,
        'language':language,'confirmRetake':confirmRetake,
      });
      await _offline.saveQuiz(guideId,lessonId,language,response);
      return response;
    }catch(error){
      if(!_connectionFailure(error)||confirmRetake)rethrow;
      final cached=await _offline.quiz(guideId,lessonId,language);
      if(cached==null)rethrow;
      return {...cached,'offline':true};
    }
  }
  Future<Map<String,dynamic>> submitQuiz(
      String guideId,String lessonId,String language,
      String sessionId,Map<String,Object?> answers)=>
      _pendingAction('submitQuiz',{
        'action':'submitQuiz','guideId':guideId,'lessonId':lessonId,
        'language':language,'sessionId':sessionId,'answers':answers,
      });
  Future<int> pendingStudyActions()async=>(await _offline.pending()).length;
  /// Best-effort replay; the server may reject expired quizzes, conflicts or
  /// now-locked curricula. Rejected requests remain pending for review.
  Future<Map<String,int>> syncOfflineQueue()async{
    final pending=await _offline.pending();
    var synced=0,rejected=0;
    for(final row in pending){
      final actionName=(row['action']??'').toString();
      final payload=row['payload'];
      if(!{'completeLesson','saveLessonResume','submitQuiz'}.contains(actionName) ||
          payload is! Map){rejected++;continue;}
      try{
        await action('/api/study/progress',
          Map<String,Object?>.from(payload));
        await _offline.remove((row['id']??'').toString());
        synced++;
      }catch(error){
        if(_connectionFailure(error))break;
        rejected++;
      }
    }
    return {'synced':synced,'pending':(await _offline.pending()).length,
      'rejected':rejected};
  }
  void dispose() => _client.close();
}
