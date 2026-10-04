import 'dart:convert';
import 'package:crypto/crypto.dart';
import 'supabase_service.dart';

/// Representation of an intercepted and processed media link.
class InterceptedMediaResult {
  final String shortCode;
  final String directDisplayUrl;
  final String sourcePlatform;
  final String originalUrl;

  const InterceptedMediaResult({
    required this.shortCode,
    required this.directDisplayUrl,
    required this.sourcePlatform,
    required this.originalUrl,
  });
}

/// Core media interception and internal URL shortening layer.
/// Handles Cloudinary, Google Drive, Dropbox, and direct media URLs.
class MediaLinkInterceptor {
  static final Map<String, String> _shortCodeToUrlCache = {};

  /// Characters used for Base62 encoding.
  static const String _base62Chars =
      '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

  /// Deterministically converts an MD5 hash of any string into a stable 7-character Base62 string.
  static String generateBase62FromMd5(String input) {
    final bytes = md5.convert(utf8.encode(input)).bytes;
    // Take the first 6 bytes (48 bits) to generate exactly 7 Base62 characters.
    int value = 0;
    for (int i = 0; i < 6; i++) {
      value = (value << 8) | bytes[i];
    }

    String result = '';
    for (int i = 0; i < 7; i++) {
      result = _base62Chars[value % 62] + result;
      value = value ~/ 62;
    }
    return result;
  }

  /// Parses input URL and extracts metadata, platform, direct embed URL, and clean short code.
  static InterceptedMediaResult parse(String rawUrl) {
    final trimmed = rawUrl.trim();
    if (trimmed.isEmpty) {
      return const InterceptedMediaResult(
        shortCode: '',
        directDisplayUrl: '',
        sourcePlatform: 'custom',
        originalUrl: '',
      );
    }

    // 1. Google Drive
    final driveFileMatch =
        RegExp(r'drive\.google\.com/file/d/([a-zA-Z0-9_-]+)').firstMatch(trimmed);
    final driveIdMatch =
        RegExp(r'drive\.google\.com/(?:open|uc)\?.*id=([a-zA-Z0-9_-]+)').firstMatch(trimmed);

    if (driveFileMatch != null || driveIdMatch != null) {
      final fileId = driveFileMatch?.group(1) ?? driveIdMatch!.group(1)!;
      final directUrl = 'https://lh3.googleusercontent.com/d/$fileId';
      // If resource string <= 10 characters, use directly; otherwise generate deterministic 7-char code
      final code = fileId.length <= 10 ? fileId : generateBase62FromMd5(fileId);

      return InterceptedMediaResult(
        shortCode: code,
        directDisplayUrl: directUrl,
        sourcePlatform: 'google_drive',
        originalUrl: trimmed,
      );
    }

    // 2. Dropbox
    final dropboxMatch =
        RegExp(r'dropbox\.com/(?:s|scl/fi)/([a-zA-Z0-9_-]+)').firstMatch(trimmed);
    if (dropboxMatch != null || trimmed.contains('dropbox.com')) {
      final resourceId = dropboxMatch?.group(1) ?? trimmed;
      // Replace dl=0 with raw=1 or append ?raw=1 for direct image streaming
      String directUrl = trimmed;
      if (directUrl.contains('dl=0')) {
        directUrl = directUrl.replaceAll('dl=0', 'raw=1');
      } else if (!directUrl.contains('raw=1')) {
        directUrl = directUrl.contains('?') ? '$directUrl&raw=1' : '$directUrl?raw=1';
      }

      final code = resourceId.length <= 10
          ? resourceId
          : generateBase62FromMd5(resourceId);

      return InterceptedMediaResult(
        shortCode: code,
        directDisplayUrl: directUrl,
        sourcePlatform: 'dropbox',
        originalUrl: trimmed,
      );
    }

    // 3. Cloudinary
    if (trimmed.contains('cloudinary.com') || trimmed.contains('res.cloudinary.com')) {
      final code = generateBase62FromMd5(trimmed);
      return InterceptedMediaResult(
        shortCode: code,
        directDisplayUrl: trimmed,
        sourcePlatform: 'cloudinary',
        originalUrl: trimmed,
      );
    }

    // 4. Custom / Direct URL
    final code = generateBase62FromMd5(trimmed);
    return InterceptedMediaResult(
      shortCode: code,
      directDisplayUrl: trimmed,
      sourcePlatform: 'custom',
      originalUrl: trimmed,
    );
  }

  /// Interception pipeline: triggered BEFORE saving media paths to the database.
  /// Generates short codes, formats direct links, and registers with PostgreSQL collision-safely.
  static Future<InterceptedMediaResult> interceptAndRegister(String rawUrl) async {
    final parsed = parse(rawUrl);
    if (parsed.shortCode.isEmpty) return parsed;

    // Cache locally
    _shortCodeToUrlCache[parsed.shortCode] = parsed.directDisplayUrl;

    try {
      // Execute collision-safe atomic register via RPC or direct upsert
      try {
        await SupabaseService.client.rpc(
          'register_shortened_media_link',
          params: {
            'p_short_code': parsed.shortCode,
            'p_long_url': parsed.directDisplayUrl,
            'p_source_platform': parsed.sourcePlatform,
          },
        );
      } catch (_) {
        // Fallback: direct table upsert with onConflict on short_code
        await SupabaseService.client.from('shortened_links').upsert(
          {
            'short_code': parsed.shortCode,
            'long_url': parsed.directDisplayUrl,
            'source_platform': parsed.sourcePlatform,
            'created_at': DateTime.now().toIso8601String(),
          },
          onConflict: 'short_code',
        );
      }
    } catch (_) {
      // Resilient: network failure will not block local UI flow
    }

    return parsed;
  }

  /// Synchronously returns direct URL if it is already an HTTP URL or in memory cache.
  static String? resolveSynchronous(String codeOrUrl) {
    final trimmed = codeOrUrl.trim();
    if (trimmed.isEmpty) return '';
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      return parse(trimmed).directDisplayUrl;
    }
    return _shortCodeToUrlCache[trimmed];
  }

  /// Resolves any stored short_code or raw URL back to a direct high-speed image embed URL.
  static Future<String> resolveToDirectUrl(String codeOrUrl) async {
    final trimmed = codeOrUrl.trim();
    if (trimmed.isEmpty) return '';
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      return parse(trimmed).directDisplayUrl;
    }

    // Check memory cache
    if (_shortCodeToUrlCache.containsKey(trimmed)) {
      return _shortCodeToUrlCache[trimmed]!;
    }

    try {
      // 1. Check primary shortened_links table
      final record = await SupabaseService.client
          .from('shortened_links')
          .select('long_url')
          .eq('short_code', trimmed)
          .maybeSingle();

      if (record != null && record['long_url'] != null) {
        final longUrl = record['long_url'] as String;
        _shortCodeToUrlCache[trimmed] = longUrl;
        return longUrl;
      }

      // 2. Check legacy short_links table as fallback
      final legacy = await SupabaseService.client
          .from('short_links')
          .select('external_url')
          .eq('short_code', trimmed)
          .maybeSingle();

      if (legacy != null && legacy['external_url'] != null) {
        final externalUrl = legacy['external_url'] as String;
        final resolved = parse(externalUrl).directDisplayUrl;
        _shortCodeToUrlCache[trimmed] = resolved;
        return resolved;
      }
    } catch (_) {}

    return trimmed;
  }
}
