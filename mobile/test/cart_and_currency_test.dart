import 'package:flutter_test/flutter_test.dart';
import 'package:store_marketplace/cart/providers/cart_provider.dart';
import 'package:store_marketplace/core/providers/currency_provider.dart';

void main() {
  group('CurrencyConfig Tests', () {
    test('Default currency is ZMW with symbol K', () {
      const config = CurrencyConfig();
      expect(config.code, 'ZMW');
      expect(config.symbol, 'K');
      expect(config.format(125.50), 'K 125.50');
      expect(config.format(0), 'K 0.00');
    });

    test('Custom currency formats correctly', () {
      const usdConfig = CurrencyConfig(code: 'USD', symbol: '\$');
      expect(usdConfig.format(99.99), '\$ 99.99');

      const zarConfig = CurrencyConfig(code: 'ZAR', symbol: 'R');
      expect(zarConfig.format(1500), 'R 1500.00');
    });
  });

  group('CartNotifier & Multi-Store Split Tests', () {
    test('Empty cart has 0 subtotal and 0 item count', () {
      final notifier = CartNotifier();
      expect(notifier.subtotal, 0.0);
      expect(notifier.totalItemCount, 0);
      expect(notifier.itemsByStore.isEmpty, isTrue);
    });

    test('Adding items computes correct subtotal and groups by store', () {
      final notifier = CartNotifier();

      // Add item from Store A
      notifier.addItem(
        productId: 'prod-1',
        title: 'Wireless Earbuds',
        price: 250.0,
        storeId: 'store-a',
        storeName: 'Alpha Store',
        quantity: 2,
      );

      // Add item from Store B
      notifier.addItem(
        productId: 'prod-2',
        title: 'Handcrafted Wooden Bowl',
        price: 150.0,
        storeId: 'store-b',
        storeName: 'Beta Crafts',
        quantity: 1,
      );

      // Subtotal should be (250 * 2) + (150 * 1) = 650.0
      expect(notifier.subtotal, 650.0);
      expect(notifier.totalItemCount, 3);

      // Items grouped by store
      final split = notifier.itemsByStore;
      expect(split.length, 2);
      expect(split.containsKey('store-a'), isTrue);
      expect(split.containsKey('store-b'), isTrue);
      expect(split['store-a']!.length, 1);
      expect(split['store-a']!.first.quantity, 2);
      expect(split['store-b']!.length, 1);
      expect(split['store-b']!.first.quantity, 1);
    });

    test('Updating quantity and removing item updates totals atomically', () {
      final notifier = CartNotifier();

      notifier.addItem(
        productId: 'prod-1',
        title: 'T-Shirt',
        price: 100.0,
        storeId: 'store-a',
        storeName: 'Alpha Store',
        quantity: 1,
      );

      notifier.updateQuantity('prod-1', 4);
      expect(notifier.subtotal, 400.0);
      expect(notifier.totalItemCount, 4);

      notifier.removeItem('prod-1');
      expect(notifier.subtotal, 0.0);
      expect(notifier.totalItemCount, 0);
    });

    test('Clearing cart empties state', () {
      final notifier = CartNotifier();
      notifier.addItem(
        productId: 'p-1',
        title: 'Book',
        price: 50.0,
        storeId: 's-1',
        storeName: 'Store 1',
        quantity: 2,
      );
      notifier.clear();
      expect(notifier.subtotal, 0.0);
      expect(notifier.itemsByStore.isEmpty, isTrue);
    });
  });
}
