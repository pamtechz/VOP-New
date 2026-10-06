import 'package:flutter/foundation.dart';
import '../../core/services/supabase_service.dart';

class RecommendationService {
  static final _supabase = SupabaseService.client;

  /// Records user interactions (views, clicks, searches) to feed the ML recommendation ranker
  static Future<void> recordInteraction({
    required String eventType,
    String? productId,
    String? categoryId,
    String? storeId,
    String? searchTerm,
  }) async {
    try {
      await _supabase.rpc('record_interaction', params: {
        'p_event_type': eventType,
        'p_product_id': productId,
        'p_category_id': categoryId,
        'p_store_id': storeId,
        'p_search_term': searchTerm,
      });
    } catch (e) {
      debugPrint('Interaction record warning: $e');
    }
  }

  /// Fetches a Cassini-inspired personalized and diversified "Best Match" marketplace feed
  static Future<List<Map<String, dynamic>>> getPersonalizedFeed({
    String? categoryId,
    String? search,
    int limit = 20,
    int offset = 0,
    int maxPerStore = 2,
    double exploreRatio = 0.20,
  }) async {
    try {
      final user = _supabase.auth.currentUser;
      final res = await _supabase.rpc('get_personalized_marketplace_feed', params: {
        'p_user_id': user?.id,
        'p_category_id': categoryId,
        'p_search': search,
        'p_limit': limit,
        'p_offset': offset,
        'p_max_per_store': maxPerStore,
        'p_explore_ratio': exploreRatio,
      });

      if (res is List) {
        return List<Map<String, dynamic>>.from(res);
      }
      return [];
    } catch (e) {
      debugPrint('Personalized feed RPC fallback: $e');
      // Graceful fallback to regular query if RPC fails
      var filterBuilder = _supabase
          .from('products')
          .select('*, store:stores(name, rating_avg), product_images(id, url, display_order)')
          .eq('status', 'active');

      if (categoryId != null) {
        filterBuilder = filterBuilder.eq('category_id', categoryId);
      }

      final fallbackData = await filterBuilder
          .order('created_at', ascending: false)
          .range(offset, offset + limit - 1);
      return List<Map<String, dynamic>>.from(fallbackData);
    }
  }
}
