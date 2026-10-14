import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/foundation.dart';

/// Public Firebase client values and API origin are injected at build time.
/// NEVER store private service-account keys, payment secrets, or tokens here.
class VopConfig {
  static const apiUrl = String.fromEnvironment('VOP_API_BASE_URL');
  static const apiKey = String.fromEnvironment('VOP_FIREBASE_API_KEY');
  static const appId = String.fromEnvironment('VOP_FIREBASE_ANDROID_APP_ID');
  static const webAppId = String.fromEnvironment('VOP_FIREBASE_WEB_APP_ID');
  static const webAuthDomain = String.fromEnvironment('VOP_FIREBASE_WEB_AUTH_DOMAIN');
  static const messagingSenderId = String.fromEnvironment('VOP_FIREBASE_SENDER_ID');
  static const projectId = String.fromEnvironment('VOP_FIREBASE_PROJECT_ID');
  static const googleWebClientId =
      String.fromEnvironment('VOP_GOOGLE_WEB_CLIENT_ID');

  static String? get error {
    final origin = Uri.tryParse(apiUrl);
    if (origin == null || origin.scheme != 'https' ||
        origin.host.isEmpty || origin.userInfo.isNotEmpty ||
        origin.path.isNotEmpty && origin.path != '/' ||
        origin.query.isNotEmpty || origin.fragment.isNotEmpty) {
      return 'Configure VOP_API_BASE_URL as a trusted HTTPS origin.';
    }
    if ([apiKey, kIsWeb ? webAppId : appId, messagingSenderId, projectId]
        .any((value) => value.trim().isEmpty)) {
      return kIsWeb ? 'Firebase web public client configuration is incomplete.' :
          'Firebase Android public client configuration is incomplete.';
    }
    if (kIsWeb && webAuthDomain.isEmpty) {
      return 'Firebase web auth domain is required for browser sign-in.';
    }
    if (kIsWeb && !RegExp(r'^1:[0-9]+:web:[A-Za-z0-9]+ get firebaseOptions => FirebaseOptions(
        apiKey: apiKey,
        appId: kIsWeb ? webAppId : appId,
        messagingSenderId: messagingSenderId,
        projectId: projectId,
        authDomain: kIsWeb ? webAuthDomain : null,
      );
}
).hasMatch(webAppId)) {
      return 'VOP_FIREBASE_WEB_APP_ID must identify the registered Firebase web app.';
    }
    return null;
  }

  static FirebaseOptions get firebaseOptions => FirebaseOptions(
        apiKey: apiKey,
        appId: kIsWeb ? webAppId : appId,
        messagingSenderId: messagingSenderId,
        projectId: projectId,
        authDomain: kIsWeb ? webAuthDomain : null,
      );
}
