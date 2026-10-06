import 'package:supabase_flutter/supabase_flutter.dart';
import '../../config/app_config.dart';

// ⚠️  This service reads credentials ONLY from AppConfig which itself
//     reads them from compile-time --dart-define flags.
//     No credentials are stored or referenced in this file.

class SupabaseService {
  static SupabaseClient get client => Supabase.instance.client;

  static Future<void> initialize() async {
    assert(
      AppConfig.supabaseUrl.isNotEmpty,
      'SUPABASE_URL is missing. Pass --dart-define=SUPABASE_URL=<value> at build time.',
    );
    assert(
      AppConfig.supabaseAnonKey.isNotEmpty,
      'SUPABASE_ANON_KEY is missing. Pass --dart-define=SUPABASE_ANON_KEY=<value> at build time.',
    );

    await Supabase.initialize(
      url: AppConfig.supabaseUrl,
      anonKey: AppConfig.supabaseAnonKey,
      authOptions: const FlutterAuthClientOptions(
        authFlowType: AuthFlowType.pkce,
      ),
    );
  }

  /// Throttled activity touch — prevents write explosion (at most once/day).
  static Future<void> touchActivity() async {
    final user = client.auth.currentUser;
    if (user != null) {
      try {
        await client.rpc('touch_current_user_activity');
      } catch (_) {
        // Non-blocking; user experience is unaffected.
      }
    }
  }

  /// Subscribe to a single conversation's messages via Realtime.
  /// Call channel.unsubscribe() when the conversation screen is disposed.
  static RealtimeChannel subscribeToConversation({
    required String conversationId,
    required void Function(Map<String, dynamic> messagePayload) onNewMessage,
    void Function(Map<String, dynamic> messagePayload)? onUpdatedMessage,
  }) {
    final filter = PostgresChangeFilter(
      type: PostgresChangeFilterType.eq,
      column: 'conversation_id',
      value: conversationId,
    );
    final channel = client.channel('public:messages:conversation_id=eq.$conversationId');
    channel
        .onPostgresChanges(
          event: PostgresChangeEvent.insert,
          schema: 'public',
          table: 'messages',
          filter: filter,
          callback: (payload) => onNewMessage(payload.newRecord),
        )
        .onPostgresChanges(
          event: PostgresChangeEvent.update,
          schema: 'public',
          table: 'messages',
          filter: filter,
          callback: (payload) {
            final handler = onUpdatedMessage;
            if (handler != null) handler(payload.newRecord);
          },
        )
        .subscribe();
    return channel;
  }
}
