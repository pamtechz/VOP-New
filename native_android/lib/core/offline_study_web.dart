/// Browser preview intentionally does not cache protected learner records.
/// Native offline documents use device-bound encrypted storage; exposing
/// them through browser localStorage without the same guarantees is unsafe.
class OfflineStudy {
  OfflineStudy();
  static const maxCompressedBytes = 320000;
  static const maxRecords = 80;
  static const lifetime = Duration(days: 14);

  Future<void> save(String uid, String kind, String id,
      Map<String, dynamic> value, {String title = '', DateTime? expiresAt}) async {
    throw const OfflineStorageException(
        'Encrypted offline downloads are currently available in the Android app only.');
  }

  Future<Map<String, dynamic>?> read(String uid, String kind, String id) async => null;

  Future<List<Map<String, dynamic>>> list(String uid) async => [];

  Future<void> delete(String uid, String kind, String id) async {}

  Future<List<Map<String, dynamic>>> pending(String uid) async => [];

  Future<void> enqueue(String uid, String type, Map<String, dynamic> body,
      {DateTime? expiresAt}) async {
    throw const OfflineStorageException(
        'Offline changes cannot be queued securely in this browser preview.');
  }

  Future<void> resolvePending(String uid, String id) async {}

  Future<void> clear(String uid) async {}
}

class OfflineStorageException implements Exception {
  const OfflineStorageException(this.message);
  final String message;
  @override
  String toString() => message;
}
