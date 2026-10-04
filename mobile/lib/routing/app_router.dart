import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../auth/providers/auth_provider.dart';
import '../auth/screens/login_screen.dart';
import '../auth/screens/register_screen.dart';
import '../marketplace/screens/home_screen.dart';
import '../products/screens/product_detail_screen.dart';
import '../stores/screens/store_screen.dart';
import '../marketplace/screens/search_screen.dart';
import '../cart/screens/cart_screen.dart';
import '../checkout/screens/checkout_screen.dart';
import '../orders/screens/orders_screen.dart';
import '../stores/screens/seller_centre_screen.dart';
import '../products/screens/manage_products_screen.dart';
import '../products/screens/add_product_screen.dart';
import '../account/screens/account_screen.dart';
import '../wallet/screens/wallet_ledger_screen.dart';

import '../account/screens/saved_addresses_screen.dart';
import '../account/screens/notifications_screen.dart';
import '../account/screens/security_screen.dart';
import '../orders/screens/order_tracking_screen.dart';
import '../messaging/screens/chat_screen.dart';
import '../subscriptions/screens/subscription_plans_screen.dart';

final _routerKey = GlobalKey<NavigatorState>();

GoRouter buildAppRouter(Ref ref) {
  final authStream = ref.watch(authStateProvider.stream);

  return GoRouter(
    navigatorKey: _routerKey,
    initialLocation: '/',
    debugLogDiagnostics: false,
    refreshListenable: GoRouterRefreshStream(authStream),
    redirect: (context, state) {
      final user = Supabase.instance.client.auth.currentUser;
      final isLoggedIn = user != null;
      final isAuthRoute = state.matchedLocation == '/login' ||
          state.matchedLocation == '/register';

      if (!isLoggedIn && !isAuthRoute) return '/login';
      if (isLoggedIn && isAuthRoute) return '/';
      return null;
    },
    routes: [
      // ── Auth ──────────────────────────────────────────────────────────────
      GoRoute(path: '/login', builder: (_, __) => const LoginScreen()),
      GoRoute(path: '/register', builder: (_, __) => const RegisterScreen()),

      // ── Marketplace ───────────────────────────────────────────────────────
      GoRoute(path: '/', builder: (_, __) => const HomeScreen()),
      GoRoute(
        path: '/product/:productId',
        builder: (_, state) => ProductDetailScreen(
          productId: state.pathParameters['productId'] ?? '',
        ),
      ),
      GoRoute(
        path: '/store/:slug',
        builder: (_, state) => StoreScreen(
          slug: state.pathParameters['slug'] ?? '',
        ),
      ),
      GoRoute(
        path: '/search',
        builder: (_, state) => SearchScreen(
          initialCategory: state.uri.queryParameters['category'],
          initialQuery: state.uri.queryParameters['q'],
        ),
      ),

      // ── Cart & Checkout ───────────────────────────────────────────────────
      GoRoute(path: '/cart', builder: (_, __) => const CartScreen()),
      GoRoute(path: '/checkout', builder: (_, __) => const CheckoutScreen()),

      // ── Orders & Tracking ──────────────────────────────────────────────────
      GoRoute(path: '/orders', builder: (_, __) => const OrdersScreen()),
      GoRoute(
        path: '/orders/:orderId',
        builder: (_, state) => OrderTrackingScreen(
          orderId: state.pathParameters['orderId'] ?? '',
        ),
      ),

      // ── Messaging ─────────────────────────────────────────────────────────
      GoRoute(
        path: '/chat/:storeId',
        builder: (_, state) => ChatScreen(
          storeId: state.pathParameters['storeId'] ?? '',
        ),
      ),

      // ── Seller ────────────────────────────────────────────────────────────
      GoRoute(path: '/seller', builder: (_, __) => const SellerCentreScreen()),
      GoRoute(path: '/seller/products', builder: (_, __) => const ManageProductsScreen()),
      GoRoute(path: '/seller/products/add', builder: (_, __) => const AddProductScreen()),
      GoRoute(path: '/plans', builder: (_, __) => const SubscriptionPlansScreen()),

      // ── Profile & Wallet ──────────────────────────────────────────────────
      GoRoute(path: '/profile', builder: (_, __) => const AccountScreen()),
      GoRoute(path: '/addresses', builder: (_, __) => const SavedAddressesScreen()),
      GoRoute(path: '/notifications', builder: (_, __) => const NotificationsScreen()),
      GoRoute(path: '/security', builder: (_, __) => const SecurityScreen()),
      GoRoute(path: '/wallet', builder: (_, __) => const WalletLedgerScreen()),
    ],
    errorBuilder: (_, state) => Scaffold(
      appBar: AppBar(title: const Text('Page Not Found')),
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.error_outline, size: 64, color: Colors.amber),
            const SizedBox(height: 16),
            Text('Page not found: ${state.error}', textAlign: TextAlign.center),
            const SizedBox(height: 24),
            ElevatedButton(
              onPressed: () => appRouter.go('/'),
              child: const Text('Back to Home'),
            ),
          ],
        ),
      ),
    ),
  );
}

// Bridges a Dart Stream to GoRouter's Listenable interface.
class GoRouterRefreshStream extends ChangeNotifier {
  GoRouterRefreshStream(Stream<dynamic> stream) {
    stream.listen((_) => notifyListeners());
  }
}

// Provider that exposes the router
final routerProvider = Provider<GoRouter>((ref) => buildAppRouter(ref));

// Convenience accessor
GoRouter get appRouter => _cachedRouter!;
GoRouter? _cachedRouter;

void initRouter(Ref ref) {
  _cachedRouter = buildAppRouter(ref);
}
