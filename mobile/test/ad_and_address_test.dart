import 'package:flutter_test/flutter_test.dart';
import 'package:store_marketplace/account/screens/saved_addresses_screen.dart';
import 'package:store_marketplace/advertising/services/ad_placement_service.dart';

void main() {
  group('AddressItem Model Tests', () {
    test('AddressItem fromMap correctly maps database columns', () {
      final map = {
        'id': 'addr-uuid-123',
        'label': 'Office',
        'street': 'Plot 54, Great East Road',
        'area': 'Northmead',
        'city': 'Lusaka',
        'province': 'Lusaka',
        'phone': '+260971234567',
        'is_default': true,
      };

      final item = AddressItem.fromMap(map);

      expect(item.id, 'addr-uuid-123');
      expect(item.label, 'Office');
      expect(item.street, 'Plot 54, Great East Road');
      expect(item.area, 'Northmead');
      expect(item.city, 'Lusaka');
      expect(item.province, 'Lusaka');
      expect(item.phone, '+260971234567');
      expect(item.isDefault, isTrue);
    });

    test('AddressItem handles default null fallback values safely', () {
      final map = {
        'id': 'addr-uuid-456',
      };

      final item = AddressItem.fromMap(map);

      expect(item.id, 'addr-uuid-456');
      expect(item.label, 'Home');
      expect(item.city, 'Lusaka');
      expect(item.province, 'Lusaka');
      expect(item.isDefault, isFalse);
    });
  });

  group('AdCreativeModel Tests', () {
    test('AdCreativeModel fromMap parses campaign and creative payload', () {
      final campaign = {
        'id': 'camp-001',
        'title': 'Mega Spring Sale',
      };
      final creative = {
        'headline': '50% Off Electronics',
        'body_text': 'Best deals on gadgets this week only.',
        'image_url': 'https://res.cloudinary.com/test/image.jpg',
        'target_url': '/search?category=electronics',
        'cta_text': 'Claim Deal',
      };

      final model = AdCreativeModel.fromMap(campaign, creative);

      expect(model.campaignId, 'camp-001');
      expect(model.title, 'Mega Spring Sale');
      expect(model.headline, '50% Off Electronics');
      expect(model.bodyText, 'Best deals on gadgets this week only.');
      expect(model.imageUrl, 'https://res.cloudinary.com/test/image.jpg');
      expect(model.targetUrl, '/search?category=electronics');
      expect(model.ctaText, 'Claim Deal');
    });
  });
}
