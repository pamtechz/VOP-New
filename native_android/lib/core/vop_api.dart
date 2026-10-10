import 'dart:async';
import 'dart:convert';

import 'package:firebase_auth/firebase_auth.dart';
import 'package:http/http.dart' as http;

import 'config.dart';

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
  Future<Map<String, dynamic>> catalogue() => read('catalog');
  Future<Map<String, dynamic>> progress() => read('progress');
  Future<Map<String, dynamic>> guide(String id) => read('guide', {'guideId': id});
  Future<Map<String, dynamic>> lesson(String guideId, String lessonId) =>
      read('lesson', {'guideId': guideId, 'lessonId': lessonId});
  Future<Map<String, dynamic>> saveResume(
          String guideId, String lessonId, String language, int pageIndex) =>
      action('/api/study/progress', {
        'action': 'saveLessonResume', 'guideId': guideId,
        'lessonId': lessonId, 'language': language, 'pageIndex': pageIndex,
      });
  Future<Map<String, dynamic>> completeLesson(
          String guideId, String lessonId, String language) =>
      action('/api/study/progress', {
        'action': 'completeLesson', 'guideId': guideId,
        'lessonId': lessonId, 'language': language,
      });
  Future<Map<String, dynamic>> startQuiz(
          String guideId, String lessonId, String language,
          {bool confirmRetake = false}) =>
      action('/api/study/progress', {
        'action': 'startQuiz', 'guideId': guideId,
        'lessonId': lessonId, 'language': language, 'confirmRetake': confirmRetake,
      });
  Future<Map<String, dynamic>> submitQuiz(
          String guideId, String lessonId, String language,
          String sessionId, Map<String, Object?> answers) =>
      action('/api/study/progress', {
        'action': 'submitQuiz', 'guideId': guideId, 'lessonId': lessonId,
        'language': language, 'sessionId': sessionId, 'answers': answers,
      });
  void dispose() => _client.close();
}
