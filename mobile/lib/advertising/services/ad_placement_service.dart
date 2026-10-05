import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/services/supabase_service.dart';

class AdCreativeModel {
  final String campaignId;
  final String title;
  final String headline;
  final String bodyText;
  final String imageUrl;
  final String targetUrl;
  final String ctaText;

  const AdCreativeModel({
    required this.campaignId,
    required this.title,
    required this.headline,
    required this.bodyText,
    required this.imageUrl,
    required this.targetUrl,
    required this.ctaText,
  });

  factory AdCreativeModel.fromMap(Map<String, dynamic> campaign, Map<String, dynamic> creative) {
    return AdCreativeModel(
      campaignId: campaign['id'] as String,
      title: campaign['title'] as String? ?? 'Sponsored',
      headline: creative['headline'] as String? ?? '',
      bodyText: creative['body_text'] as String? ?? '',
      imageUrl: creative['image_url'] as String? ?? '',
      targetUrl: creative['target_url'] as String? ?? '',
      ctaText: creative['cta_text'] as String? ?? 'Learn More',
    );
  }
}

class AdPlacementService {
  static final Set<String> _recordedImpressions = {};

  static Future<AdCreativeModel?> getActiveAdForPlacement(String placement) async {
    try {
      final now = DateTime.now().toIso8601String();
      final campaigns = await SupabaseService.client
          .from('ad_campaigns')
          .select('id, title, placement, start_date, end_date, status, ad_creatives(headline, body_text, image_url, target_url, cta_text)')
          .eq('status', 'active')
          .eq('placement', placement)
          .lte('start_date', now)
          .gte('end_date', now)
          .limit(1);

      final list = campaigns as List;
      if (list.isEmpty) return null;

      final campaign = list[0] as Map<String, dynamic>;
      final creatives = campaign['ad_creatives'] as List?;
      if (creatives == null || creatives.isEmpty) return null;

      final creative = creatives[0] as Map<String, dynamic>;
      return AdCreativeModel.fromMap(campaign, creative);
    } catch (_) {
      return null;
    }
  }

  static Future<void> recordImpression(String campaignId) async {
    // Frequency cap: record at most once per session per campaign
    if (_recordedImpressions.contains(campaignId)) return;
    _recordedImpressions.add(campaignId);

    try {
      await SupabaseService.client.rpc('track_ad_event', params: {
        'p_campaign_id': campaignId,
        'p_is_click': false,
      });
    } catch (_) {}
  }

  static Future<void> recordClick(String campaignId) async {
    try {
      await SupabaseService.client.rpc('track_ad_event', params: {
        'p_campaign_id': campaignId,
        'p_is_click': true,
      });
    } catch (_) {}
  }
}

final placementAdProvider = FutureProvider.family<AdCreativeModel?, String>((ref, placement) async {
  return AdPlacementService.getActiveAdForPlacement(placement);
});
