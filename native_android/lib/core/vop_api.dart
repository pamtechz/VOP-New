import 'dart:async';
import 'dart:convert';
import 'network_error_web.dart' if (dart.library.io) 'network_error_io.dart';
import 'package:connectivity_plus/connectivity_plus.dart';

import 'package:firebase_auth/firebase_auth.dart';
import 'package:http/http.dart' as http;

import 'config.dart';
import 'offline_study_web.dart' if (dart.library.io) 'offline_study.dart';

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
  VopApi({FirebaseAuth? auth,http.Client? client,OfflineStudy? offline})
      : _auth=auth??FirebaseAuth.instance,
        _client=client??http.Client(),
        _offline=offline??OfflineStudy(){
    _connection=Connectivity().onConnectivityChanged.listen((states){
      if(states.any((state)=>state!=ConnectivityResult.none)){
        unawaited(syncPending().catchError((_) => <String, dynamic>{}));
      }
    });
  }
  final FirebaseAuth _auth;
  final http.Client _client;
  final OfflineStudy _offline;
  StreamSubscription<List<ConnectivityResult>>? _connection;
  bool _syncing=false;
  String get _uid=>_auth.currentUser?.uid??'';
  bool _networkFailure(Object error)=>isVopSocketError(error) ||
    (error is VopApiException && (error.status==0||
      error.status==502||error.status==503||error.status==504));
  static const _timeout = Duration(seconds: 25);

  Uri _url(String path, [Map<String, String>? query]) {
    const allowedPrefixes = [
      '/api/mobile',
      '/api/study/progress',
      '/api/mentorship',
      '/api/engagement',
      '/api/share',
      '/api/prayer',
      '/api/certificates',
      '/api/admin',
      '/api/account',
      '/api/localization',
      '/api/payments',
      '/api/quizzes',
      '/api/media',
      '/api/health',
    ];
    final isAllowed = allowedPrefixes.any((prefix) => path == prefix || path.startsWith('$prefix/') || path.startsWith('$prefix?'));
    if (!isAllowed) {
      throw const VopApiException('Unsupported VOP API endpoint.');
    }
    final origin = Uri.parse(VopConfig.apiUrl);
    final uri = origin.replace(
      path: path,
      queryParameters: query?.isEmpty == true ? null : query,
    );
    final isLocalhost = origin.host == 'localhost' || origin.host == '127.0.0.1';
    if ((uri.scheme != 'https' && !isLocalhost) || uri.host != origin.host) {
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
    try {
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
    } on FirebaseException catch (e) {
      if (e.code == 'network-request-failed' || isVopSocketError(e)) {
        throw const VopApiException('Network unavailable. Check your connection.');
      }
      throw VopApiException(e.message ?? 'Authentication error.', code: e.code);
    } catch (error) {
      if (isVopSocketError(error)) {
        throw const VopApiException('Network unavailable. Check your connection.');
      }
      rethrow;
    }
  }

  Future<Map<String, dynamic>> read(String resource,
      [Map<String, String> params = const {}]) =>
      _execute('/api/mobile', 'GET', null, {'resource': resource, ...params});

  Future<Map<String, dynamic>> action(String path, Map<String, Object?> body,
          {Map<String, String>? query}) =>
      _execute(path, 'POST', body, query);

  Future<Map<String,dynamic>> bootstrap()async{
    final response=await _cachedRead('bootstrap','bootstrap',()=>read('bootstrap'));
    if(response['offline']!=true)unawaited(syncPending().catchError((_) => <String, dynamic>{}));
    return response;
  }
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
  Future<Map<String,dynamic>> exportOwnAccount() =>
      _execute('/api/account','GET',null,{'action':'export'});
  Future<Map<String,dynamic>> requestAccountDeletion(String confirmation,{String reason=''}) =>
      action('/api/account',{'action':'request-deletion',
        'confirmation':confirmation,'reason':reason});
  Future<Map<String,dynamic>> accountSecurityStatus() =>
      _execute('/api/account','GET',null,{'action':'security-status'});
  Future<Map<String,dynamic>> accountSecurityActivity() =>
      _execute('/api/account','GET',null,{'action':'security-activity'});
  Future<Map<String,dynamic>> revokeAllSessions() =>
      action('/api/account',{'action':'revoke-sessions',
        'confirmation':'SIGN OUT ALL DEVICES'});
  Future<Map<String,dynamic>> cancelAccountDeletion() =>
      action('/api/account',{'action':'cancel-deletion'});
  Future<Map<String,dynamic>> supportedLanguages() => read('languages');
  Future<Map<String,dynamic>> languagePack(String code)=>
    _cachedRead('locale',code,
      ()=>_execute('/api/localization','GET',null,{'locale':code}));

  Future<Map<String,dynamic>> _cachedRead(String kind,String id,
      Future<Map<String,dynamic>> Function() request)async{
    try{
      final response=await request();
      if(_uid.isNotEmpty){
        try{await _offline.save(_uid,kind,id,response,
          title:id);}catch(_){}
      }
      return response;
    }catch(error){
      if(_networkFailure(error)&&_uid.isNotEmpty){
        final cached=await _offline.read(_uid,kind,id);
        if(cached!=null)return {...cached,'offline':true};
      }
      rethrow;
    }
  }
  Future<Map<String,dynamic>> catalogue()=>_cachedRead('catalog','catalog',
    ()=>read('catalog'));
  Future<Map<String, dynamic>> resources() => read('resources');
  Future<Map<String, dynamic>> events() => read('events');
  Future<Map<String, dynamic>> radio() => read('radio');
  Future<Map<String, dynamic>> announcements() => read('announcements');
  Future<Map<String,dynamic>> notificationCapabilities() =>
      _execute('/api/admin/notifications','GET',null,{'action':'capabilities'});
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
  Future<Map<String,dynamic>> editPrayer({
      required String id,required String requestText,required String category,
      required bool isPrivate}) =>
      action('/api/prayer',{'action':'edit','id':id,
        'requestText':requestText,'category':category,'isPrivate':isPrivate});
  Future<Map<String,dynamic>> markPrayerAnswered(String id) =>
      action('/api/prayer',{'action':'markAnswered','id':id});


  Future<Map<String,dynamic>> progress()=>_cachedRead('progress','progress',
    ()=>read('progress'));
  Future<Map<String,dynamic>> guide(String id)=>_cachedRead('guide',id,
    ()=>read('guide',{'guideId':id}));
  Future<Map<String,dynamic>> lesson(String guideId,String lessonId)=>
    _cachedRead('lesson','${guideId}_$lessonId',
      ()=>read('lesson',{'guideId':guideId,'lessonId':lessonId}));
  Future<int> downloadGuide(String guideId)async{
    final result=await read('guide',{'guideId':guideId});
    final rows=result['lessons'] is List?result['lessons'] as List:[];
    var downloaded=0;
    if(_uid.isEmpty)throw const VopApiException('Sign in before downloading.');
    await _offline.save(_uid,'guide',guideId,result,title:
      ((result['guide'] as Map?)?['title']??guideId).toString());
    for(final row in rows){
      if(row is! Map||row['type']=='Test'||row['locked']==true)continue;
      final id=(row['id']??'').toString();
      if(id.isEmpty)continue;
      final content=await read('lesson',{'guideId':guideId,'lessonId':id});
      await _offline.save(_uid,'lesson','${guideId}_$id',content,
        title:(row['title']??id).toString());
      downloaded++;
    }
    return downloaded;
  }

  // --- Admin & Executive APIs ---
  Future<Map<String, dynamic>> adminAnalytics({String? organizationId}) =>
      action('/api/admin', {
        'action': 'analytics',
        if (organizationId != null && organizationId.isNotEmpty)
          'organizationId': organizationId,
      }, query: {'__vopRoute': 'analytics'});

  Future<Map<String, dynamic>> adminCandidates({String? organizationId, String? search}) =>
      action('/api/admin', {
        'action': 'list',
        if (organizationId != null && organizationId.isNotEmpty)
          'organizationId': organizationId,
        if (search != null && search.isNotEmpty) 'search': search,
      }, query: {'__vopRoute': 'candidates'});

  Future<Map<String, dynamic>> enrollCandidate({
    required String displayName,
    required String email,
    required String guideId,
    String? organizationId,
    String? phoneNumber,
    String? password,
  }) =>
      action('/api/admin', {
        'action': 'enroll',
        'displayName': displayName,
        'email': email,
        'guideId': guideId,
        if (organizationId != null && organizationId.isNotEmpty)
          'organizationId': organizationId,
        if (phoneNumber != null && phoneNumber.isNotEmpty)
          'phoneNumber': phoneNumber,
        if (password != null && password.isNotEmpty)
          'password': password,
      }, query: {'__vopRoute': 'candidates'});

  Future<Map<String, dynamic>> updateCandidate({
    required String candidateId,
    String? displayName,
    String? email,
    String? phoneNumber,
    String? organizationId,
    String? churchName,
    String? churchId,
    bool? disabled,
  }) =>
      action('/api/admin', {
        'action': 'updateCandidate',
        'candidateId': candidateId,
        if (displayName != null) 'displayName': displayName,
        if (email != null) 'email': email,
        if (phoneNumber != null) 'phoneNumber': phoneNumber,
        if (organizationId != null) 'organizationId': organizationId,
        if (churchName != null) 'churchName': churchName,
        if (churchId != null) 'churchId': churchId,
        if (disabled != null) 'disabled': disabled,
      }, query: {'__vopRoute': 'candidates'});

  Future<Map<String, dynamic>> updateCandidateBaptism({
    required String candidateId,
    required String baptismStatus,
    String? organizationId,
    String? baptismDate,
  }) =>
      action('/api/admin', {
        'action': 'updateBaptism',
        'candidateId': candidateId,
        'baptismStatus': baptismStatus,
        if (organizationId != null) 'organizationId': organizationId,
        if (baptismDate != null) 'baptismDate': baptismDate,
      }, query: {'__vopRoute': 'candidates'});

  Future<Map<String, dynamic>> deleteCandidate(String candidateId, {String? organizationId}) =>
      action('/api/admin', {
        'action': 'deleteCandidate',
        'candidateId': candidateId,
        if (organizationId != null) 'organizationId': organizationId,
      }, query: {'__vopRoute': 'candidates'});

  // --- Organization & Hierarchy APIs ---
  Future<Map<String, dynamic>> adminOrganizations({String? status, String? organizationId}) =>
      action('/api/admin', {
        'action': 'list',
        if (status != null && status.isNotEmpty) 'status': status,
        if (organizationId != null && organizationId.isNotEmpty)
          'organizationId': organizationId,
      }, query: {'__vopRoute': 'organizations'});

  Future<Map<String, dynamic>> publicOrganizations({String? search}) =>
      action('/api/admin', {
        'action': 'publicDirectory',
        if (search != null && search.isNotEmpty) 'search': search,
      }, query: {'__vopRoute': 'organizations'});

  Future<Map<String, dynamic>> joinInstitution(String organizationId) =>
      action('/api/admin', {
        'action': 'joinInstitution',
        'organizationId': organizationId,
      }, query: {'__vopRoute': 'organizations'});

  Future<Map<String, dynamic>> setPublicMinistry({
    required String organizationId,
    required bool isPublicMinistry,
  }) =>
      action('/api/admin', {
        'action': 'setPublicMinistry',
        'organizationId': organizationId,
        'isPublicMinistry': isPublicMinistry,
      }, query: {'__vopRoute': 'organizations'});

  Future<Map<String, dynamic>> createOrganization({
    required String name,
    required String organizationType,
    String? id,
    String? customOrganizationType,
    String? billingCountry,
    bool? isPublicMinistry,
  }) =>
      action('/api/admin', {
        'action': 'create',
        'name': name,
        'organizationType': organizationType,
        if (id != null && id.isNotEmpty) 'id': id,
        if (customOrganizationType != null)
          'customOrganizationType': customOrganizationType,
        if (billingCountry != null) 'billingCountry': billingCountry,
        if (isPublicMinistry != null) 'isPublicMinistry': isPublicMinistry,
      }, query: {'__vopRoute': 'organizations'});

  Future<Map<String, dynamic>> updateOrganization(String organizationId, Map<String, dynamic> updates) =>
      action('/api/admin', {
        'action': 'update',
        'organizationId': organizationId,
        ...updates,
      }, query: {'__vopRoute': 'organizations'});

  // --- User Administration APIs ---
  Future<Map<String, dynamic>> adminUsers({String? search, String? role, int limit = 50}) =>
      action('/api/admin', {
        'action': 'list',
        if (search != null && search.isNotEmpty) 'search': search,
        if (role != null && role.isNotEmpty) 'role': role,
        'limit': limit,
      }, query: {'__vopRoute': 'users'});

  Future<Map<String, dynamic>> updateUserRole({
    required String targetUid,
    required String role,
    String? adminNodeType,
    String? adminNodeId,
    String? organizationId,
    String? organizationRole,
    Map<String, dynamic>? privileges,
  }) =>
      action('/api/admin', {
        'action': 'assignRole',
        'targetUid': targetUid,
        'role': role,
        if (adminNodeType != null) 'adminNodeType': adminNodeType,
        if (adminNodeId != null) 'adminNodeId': adminNodeId,
        if (organizationId != null) 'organizationId': organizationId,
        if (organizationRole != null) 'organizationRole': organizationRole,
        if (privileges != null) 'privileges': privileges,
      }, query: {'__vopRoute': 'users'});

  // --- Graduations & Approvals APIs ---
  Future<Map<String, dynamic>> adminGraduations({String? organizationId, String? status}) =>
      action('/api/admin', {
        'action': 'list',
        if (organizationId != null && organizationId.isNotEmpty)
          'organizationId': organizationId,
        if (status != null && status.isNotEmpty) 'status': status,
      }, query: {'__vopRoute': 'graduations'});

  Future<Map<String, dynamic>> reviewGraduation({
    required String requestId,
    required String decision,
    String? notes,
    String? organizationId,
  }) =>
      action('/api/admin', {
        'action': 'review',
        'requestId': requestId,
        'decision': decision,
        if (notes != null) 'notes': notes,
        if (organizationId != null) 'organizationId': organizationId,
      }, query: {'__vopRoute': 'graduations'});

  // --- Curriculum & Content Studio APIs ---
  Future<Map<String, dynamic>> adminContent(String collection, {
    String action = 'list',
    Map<String, dynamic>? payload,
  }) =>
      this.action('/api/admin', {
        'action': action,
        'collection': collection,
        ...?payload,
      }, query: {'__vopRoute': 'content'});

  // --- Subscriptions & Plans APIs ---
  Future<Map<String, dynamic>> adminPlans({String? organizationId, String? billingTenantType}) =>
      action('/api/admin', {
        'action': 'listAvailablePlans',
        if (organizationId != null && organizationId.isNotEmpty)
          'organizationId': organizationId,
        if (billingTenantType != null) 'billingTenantType': billingTenantType,
      }, query: {'__vopRoute': 'plans'});

  // --- Operational Health ---
  Future<Map<String, dynamic>> adminHealth({bool detail = false}) =>
      _execute('/api/admin', 'GET', null, {'__vopRoute': 'health', if (detail) 'detail': '1'});

  // --- Mentorship Workspace APIs ---
  Future<Map<String, dynamic>> mentorWorkspace({String? mentorUid}) =>
      action('/api/mentorship', {
        'action': 'workspace',
        if (mentorUid != null && mentorUid.isNotEmpty) 'mentorUid': mentorUid,
      });

  Future<Map<String, dynamic>> mentorCandidates({String? mentorUid}) =>
      action('/api/mentorship', {
        'action': 'candidates',
        if (mentorUid != null && mentorUid.isNotEmpty) 'mentorUid': mentorUid,
      });

  Future<Map<String, dynamic>> mentorAssignCandidate({
    required String studentId,
    required String mentorId,
    String? organizationId,
  }) =>
      action('/api/mentorship', {
        'action': 'assignMentor',
        'studentId': studentId,
        'mentorId': mentorId,
        if (organizationId != null) 'organizationId': organizationId,
      });

  Future<Map<String, dynamic>> mentorConversations() =>
      action('/api/mentorship', {'action': 'conversations'});

  Future<Map<String, dynamic>> mentorMessages(String conversationId) =>
      action('/api/mentorship', {
        'action': 'messages',
        'conversationId': conversationId,
      });

  Future<Map<String, dynamic>> mentorSendMessage(
    String conversationId,
    String content, {
    List<dynamic>? attachments,
  }) =>
      action('/api/mentorship', {
        'action': 'sendMessage',
        'conversationId': conversationId,
        'content': content,
        if (attachments != null) 'attachments': attachments,
      });
  Future<List<Map<String,dynamic>>> downloadedStudies()=>
    _offline.list(_uid);
  Future<List<Map<String,dynamic>>> pendingOfflineChanges()=>
    _offline.pending(_uid);
  Future<void> removeOfflineStudy(String kind,String id)=>
    _offline.delete(_uid,kind,id);
  Future<void> clearOfflineStudies()=>_offline.clear(_uid);
  Future<void> saveQuizDraft(String language,String guideId,String lessonId,
      String sessionId,Map<String,Object?> answers,
      {DateTime? expiresAt})async{
    if(_uid.isEmpty)return;
    await _offline.save(_uid,'draft',
      '${language}_${guideId}_$lessonId',{
        'sessionId':sessionId,'answers':answers,
      },expiresAt:expiresAt,title:'Assessment answers');
  }
  Future<Map<String,Object?>> quizDraft(String language,String guideId,
      String lessonId,String sessionId)async{
    if(_uid.isEmpty)return {};
    final payload=await _offline.read(_uid,'draft',
      '${language}_${guideId}_$lessonId');
    if(payload?['sessionId']!=sessionId)return {};
    return payload?['answers'] is Map
      ?Map<String,Object?>.from(payload!['answers'] as Map):{};
  }
  Future<Map<String,dynamic>> _offlineMutation(String action,
      Map<String,dynamic> body,{DateTime? expiresAt})async{
    try{
      final result=await this.action('/api/study/progress',body);
      unawaited(syncPending().catchError((_) => <String, dynamic>{}));
      return result;
    }catch(error){
      if(!_networkFailure(error)||_uid.isEmpty)rethrow;
      if(action=='submitQuiz'&&expiresAt==null){
        throw const VopApiException(
          'This attempt cannot be saved offline without a verified expiry. Reconnect and retry.');
      }
      if(expiresAt!=null&&!DateTime.now().toUtc().isBefore(expiresAt)){
        throw const VopApiException(
          'The assessment session has expired. Reconnect to request a new attempt.',
          code:'ASSESSMENT_EXPIRED');
      }
      await _offline.enqueue(_uid,action,body,expiresAt:expiresAt);
      return {'ok':true,'queued':true,'pendingSync':true};
    }
  }
  Future<Map<String,dynamic>> saveResume(
      String guideId,String lessonId,String language,int pageIndex)=>
    _offlineMutation('saveLessonResume',{
      'action':'saveLessonResume','guideId':guideId,
      'lessonId':lessonId,'language':language,'pageIndex':pageIndex,
    });
  Future<Map<String,dynamic>> completeLesson(
      String guideId,String lessonId,String language)=>
    _offlineMutation('completeLesson',{
      'action':'completeLesson','guideId':guideId,
      'lessonId':lessonId,'language':language,
    });
  Future<Map<String,dynamic>> resetLessonProgress(
      String guideId,String lessonId,String language) async {
    final cleanLang = language.trim().toLowerCase();
    final effectiveLang = cleanLang.isNotEmpty && cleanLang != 'null' ? cleanLang : 'en';
    final key = '${effectiveLang}_${guideId}_$lessonId';
    if (_uid.isNotEmpty) {
      await _offline.delete(_uid, 'quiz', key);
      await _offline.delete(_uid, 'draft', key);
    }
    return action('/api/study/progress',{
      'action':'resetLessonProgress','guideId':guideId,
      'lessonId':lessonId,'language':effectiveLang,
    });
  }
  Future<Map<String,dynamic>> startQuiz(
      String guideId,String lessonId,String language,
      {bool confirmRetake=false})async{
    final key='${language}_${guideId}_$lessonId';
    try{
      final result=await action('/api/study/progress',{
        'action':'startQuiz','guideId':guideId,'lessonId':lessonId,
        'language':language,'confirmRetake':confirmRetake,
      });
      if(_uid.isNotEmpty&&result['sessionId'] is String){
        final deadline=DateTime.tryParse((result['expiresAt']??'').toString());
        if(deadline!=null&&DateTime.now().toUtc().isBefore(deadline)){
          await _offline.save(_uid,'quiz',key,result,
            title:'Assessment',expiresAt:deadline);
        }
      }
      return result;
    }catch(error){
      if(_networkFailure(error)&&_uid.isNotEmpty){
        final cached=await _offline.read(_uid,'quiz',key);
        if(cached!=null)return {...cached,'offline':true};
      }
      rethrow;
    }
  }
  Future<Map<String,dynamic>> submitQuiz(
      String guideId,String lessonId,String language,
      String sessionId,Map<String,Object?> answers)async{
    final cache=await _offline.read(_uid,'quiz',
      '${language}_${guideId}_$lessonId');
    final deadline=DateTime.tryParse((cache?['expiresAt']??'').toString());
    final body=<String,dynamic>{
      'action':'submitQuiz','guideId':guideId,'lessonId':lessonId,
      'language':language,'sessionId':sessionId,'answers':answers,
    };
    final result=await _offlineMutation('submitQuiz',body,expiresAt:deadline);
    if(result['queued']!=true&&_uid.isNotEmpty){
      await _offline.delete(_uid,'quiz','${language}_${guideId}_$lessonId');
      await _offline.delete(_uid,'draft','${language}_${guideId}_$lessonId');
    }
    return result;
  }
  Future<Map<String,dynamic>> syncPending()async{
    if(_syncing||_uid.isEmpty)return {'ok':true,'synced':0,'pending':0};
    _syncing=true;
    var count=0;
    try{
      final uid=_uid;
      for(final entry in await _offline.pending(uid)){
        if(uid!=_uid)break;
        final expires=DateTime.tryParse((entry['expiresAt']??'').toString());
        if(expires!=null&&!DateTime.now().toUtc().isBefore(expires)){
          continue;
        }
        final body=entry['body'];
        if(body is! Map)break;
        try{
          await action('/api/study/progress',Map<String,Object?>.from(body));
          await _offline.resolvePending(uid,(entry['id']??'').toString());
          count++;
        }catch(_){break;}
      }
      return {'ok':true,'synced':count,
        'pending':(await _offline.pending(uid)).length};
    }finally{_syncing=false;}
  }
  void dispose(){_connection?.cancel();_client.close();}
}
