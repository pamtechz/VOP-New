import 'package:firebase_core/firebase_core.dart';

/// Public Firebase client values and API origin are injected at build time.
/// NEVER store private service-account keys, payment secrets, or tokens here.
class VopConfig {
  static const apiUrl = String.fromEnvironment('VOP_API_BASE_URL');
  static const apiKey = String.fromEnvironment('VOP_FIREBASE_API_KEY');
  static const appId = String.fromEnvironment('VOP_FIREBASE_ANDROID_APP_ID');
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
    if ([apiKey, appId, messagingSenderId, projectId]
        .any((value) => value.trim().isEmpty)) {
      return 'Firebase Android public client configuration is incomplete.';
    }
    return null;
  }

  static FirebaseOptions get firebaseOptions => const FirebaseOptions(
        apiKey: apiKey,
        appId: appId,
        messagingSenderId: messagingSenderId,
        projectId: projectId,
      );
}
