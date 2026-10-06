import 'package:flutter_test/flutter_test.dart';

void main() {
  group('Marketplace Recommendation & Cassini Ranking Logic Tests', () {
    test('Frequency capping restricts max items per seller', () {
      final rawItems = [
        {'id': 'p1', 'store_id': 'store-a', 'score': 100},
        {'id': 'p2', 'store_id': 'store-a', 'score': 95},
        {'id': 'p3', 'store_id': 'store-a', 'score': 90},
        {'id': 'p4', 'store_id': 'store-b', 'score': 85},
        {'id': 'p5', 'store_id': 'store-b', 'score': 80},
        {'id': 'p6', 'store_id': 'store-c', 'score': 75},
      ];

      const maxPerStore = 2;
      final storeCounts = <String, int>{};
      final cappedFeed = <Map<String, dynamic>>[];

      for (final item in rawItems) {
        final storeId = item['store_id'] as String;
        final currentCount = storeCounts[storeId] ?? 0;
        if (currentCount < maxPerStore) {
          cappedFeed.add(item);
          storeCounts[storeId] = currentCount + 1;
        }
      }

      // Should contain 2 from store-a, 2 from store-b, 1 from store-c = 5 items
      expect(cappedFeed.length, 5);
      expect(cappedFeed.where((e) => e['store_id'] == 'store-a').length, 2);
      expect(cappedFeed.where((e) => e['store_id'] == 'store-b').length, 2);
      expect(cappedFeed.where((e) => e['store_id'] == 'store-c').length, 1);
      // p3 from store-a should have been filtered out
      expect(cappedFeed.any((e) => e['id'] == 'p3'), isFalse);
    });

    test('Cassini badge assignment priority', () {
      String computeBadge({
        required double affinityScore,
        required double freshnessScore,
        required double qualityScore,
        required bool isFeatured,
      }) {
        if (affinityScore >= 40.0) return 'Best Match';
        if (freshnessScore >= 80.0) return 'Fresh Drop';
        if (qualityScore >= 80.0) return 'Top Rated Seller';
        if (isFeatured) return 'Featured';
        return 'Trending';
      }

      expect(computeBadge(affinityScore: 50, freshnessScore: 90, qualityScore: 90, isFeatured: true), 'Best Match');
      expect(computeBadge(affinityScore: 10, freshnessScore: 85, qualityScore: 70, isFeatured: false), 'Fresh Drop');
      expect(computeBadge(affinityScore: 0, freshnessScore: 50, qualityScore: 85, isFeatured: false), 'Top Rated Seller');
      expect(computeBadge(affinityScore: 0, freshnessScore: 40, qualityScore: 60, isFeatured: true), 'Featured');
      expect(computeBadge(affinityScore: 0, freshnessScore: 30, qualityScore: 50, isFeatured: false), 'Trending');
    });
  });
}
