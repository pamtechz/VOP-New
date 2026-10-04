import 'package:flutter_riverpod/flutter_riverpod.dart';

class CartItem {
  final String productId;
  final String title;
  final double price;
  final String? imageUrl;
  final String storeId;
  final String storeName;
  final int quantity;

  const CartItem({
    required this.productId,
    required this.title,
    required this.price,
    this.imageUrl,
    required this.storeId,
    required this.storeName,
    this.quantity = 1,
  });

  CartItem copyWith({
    String? productId,
    String? title,
    double? price,
    String? imageUrl,
    String? storeId,
    String? storeName,
    int? quantity,
  }) {
    return CartItem(
      productId: productId ?? this.productId,
      title: title ?? this.title,
      price: price ?? this.price,
      imageUrl: imageUrl ?? this.imageUrl,
      storeId: storeId ?? this.storeId,
      storeName: storeName ?? this.storeName,
      quantity: quantity ?? this.quantity,
    );
  }

  Map<String, dynamic> toJson() => {
    'product_id': productId,
    'title': title,
    'price': price,
    'image_url': imageUrl,
    'store_id': storeId,
    'store_name': storeName,
    'quantity': quantity,
  };
}

class CartNotifier extends StateNotifier<List<CartItem>> {
  CartNotifier() : super([]);

  void addItem({
    required String productId,
    required String title,
    required double price,
    String? imageUrl,
    required String storeId,
    required String storeName,
    int quantity = 1,
  }) {
    final existingIndex = state.indexWhere((i) => i.productId == productId);
    if (existingIndex >= 0) {
      final existing = state[existingIndex];
      final updated = existing.copyWith(quantity: existing.quantity + quantity);
      final list = [...state];
      list[existingIndex] = updated;
      state = list;
    } else {
      state = [
        ...state,
        CartItem(
          productId: productId,
          title: title,
          price: price,
          imageUrl: imageUrl,
          storeId: storeId,
          storeName: storeName,
          quantity: quantity,
        ),
      ];
    }
  }

  void updateQuantity(String productId, int quantity) {
    if (quantity <= 0) {
      removeItem(productId);
      return;
    }
    state = state.map((item) {
      if (item.productId == productId) {
        return item.copyWith(quantity: quantity);
      }
      return item;
    }).toList();
  }

  void removeItem(String productId) {
    state = state.where((item) => item.productId != productId).toList();
  }

  void clear() {
    state = [];
  }

  double get subtotal {
    return state.fold(0.0, (sum, item) => sum + (item.price * item.quantity));
  }

  int get totalItemCount {
    return state.fold(0, (sum, item) => sum + item.quantity);
  }

  Map<String, List<CartItem>> get itemsByStore {
    final Map<String, List<CartItem>> map = {};
    for (final item in state) {
      map.putIfAbsent(item.storeId, () => []).add(item);
    }
    return map;
  }
}

final cartProvider = StateNotifierProvider<CartNotifier, List<CartItem>>((ref) {
  return CartNotifier();
});
