import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';

class OfflineCacheService {
  static const String _keyPrefix = 'mkt_cache_';

  /// Caches a JSON response with a specific Time-To-Live (TTL) duration
  static Future<void> cacheData(String cacheKey, dynamic data, {Duration ttl = const Duration(hours: 4)}) async {
    final prefs = await SharedPreferences.getInstance();
    final cachePayload = {
      'expires_at': DateTime.now().add(ttl).toIso8601String(),
      'data': data,
    };
    await prefs.setString('$_keyPrefix$cacheKey', jsonEncode(cachePayload));
  }

  /// Retrieves cached data if valid and not expired (stale-while-revalidate pattern)
  static Future<dynamic> getCachedData(String cacheKey) async {
    final prefs = await SharedPreferences.getInstance();
    final rawString = prefs.getString('$_keyPrefix$cacheKey');
    if (rawString == null) return null;

    try {
      final Map<String, dynamic> decoded = jsonDecode(rawString);
      final DateTime expiresAt = DateTime.parse(decoded['expires_at']);

      if (DateTime.now().isAfter(expiresAt)) {
        // Expired cache
        return null;
      }
      return decoded['data'];
    } catch (e) {
      return null;
    }
  }

  /// Clears all local marketplace cache items
  static Future<void> clearCache() async {
    final prefs = await SharedPreferences.getInstance();
    final keys = prefs.getKeys().where((k) => k.startsWith(_keyPrefix));
    for (final k in keys) {
      await prefs.remove(k);
    }
  }
}
