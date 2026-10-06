import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../../core/services/supabase_service.dart';

// ── Auth State ────────────────────────────────────────────────────────────────

/// Stream of Supabase auth state changes.
final authStateProvider = StreamProvider<AuthState>((ref) {
  try {
    return SupabaseService.client.auth.onAuthStateChange;
  } catch (_) {
    return const Stream.empty();
  }
});

/// Current session (null when signed out).
final sessionProvider = Provider<Session?>((ref) {
  try {
    return SupabaseService.client.auth.currentSession;
  } catch (_) {
    return null;
  }
});

/// Current user (null when signed out).
final currentUserProvider = Provider<User?>((ref) {
  try {
    return SupabaseService.client.auth.currentUser;
  } catch (_) {
    return null;
  }
});

// ── Profile Data ──────────────────────────────────────────────────────────────

/// Logged-in user's profile from the `profiles` table.
final profileProvider = FutureProvider<Map<String, dynamic>?>((ref) async {
  final user = ref.watch(currentUserProvider);
  if (user == null) return null;

  final data = await SupabaseService.client
      .from('profiles')
      .select('id, full_name, avatar_url, phone, role')
      .eq('id', user.id)
      .maybeSingle();
  return data;
});

// ── Auth Notifier ─────────────────────────────────────────────────────────────

class AuthNotifier extends StateNotifier<AsyncValue<void>> {
  AuthNotifier() : super(const AsyncValue.data(null));

  Future<void> signIn({required String email, required String password}) async {
    state = const AsyncValue.loading();
    state = await AsyncValue.guard(() async {
      await SupabaseService.client.auth.signInWithPassword(
        email: email,
        password: password,
      );
    });
  }

  Future<void> signUp({
    required String email,
    required String password,
    required String displayName,
    required String phone,
    required String accountType, // 'buyer' | 'seller'
  }) async {
    state = const AsyncValue.loading();
    state = await AsyncValue.guard(() async {
      final response = await SupabaseService.client.auth.signUp(
        email: email,
        password: password,
        data: {
          'display_name': displayName,
          'phone': phone,
          'account_type': accountType,
        },
      );
      if (response.user == null) {
        throw Exception('Sign-up failed. Please try again.');
      }
    });
  }

  Future<void> signOut() async {
    state = const AsyncValue.loading();
    state = await AsyncValue.guard(() async {
      await SupabaseService.client.auth.signOut();
    });
  }

  Future<void> sendPasswordReset(String email) async {
    state = const AsyncValue.loading();
    state = await AsyncValue.guard(() async {
      await SupabaseService.client.auth.resetPasswordForEmail(email);
    });
  }
}

final authNotifierProvider =
    StateNotifierProvider<AuthNotifier, AsyncValue<void>>(
  (_) => AuthNotifier(),
);
