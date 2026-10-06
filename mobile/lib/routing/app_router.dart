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
import '../account/screens/wishlist_screen.dart';
import '../delivery/screens/driver_console_screen.dart';
import '../orders/screens/order_tracking_screen.dart';
import '../messaging/screens/chat_screen.dart';
import '../subscriptions/screens/subscription_plans_screen.dart';
import '../services/screens/service_listings_screen.dart';
import '../services/screens/post_service_ad_screen.dart';
import '../account/screens/about_us_screen.dart';

final _routerKey = GlobalKey<NavigatorState>();

GoRouter buildAppRouter(Ref ref) {
  final authStream = ref.watch(authStateProvider.stream);

  return GoRouter(
    navigatorKey: _routerKey,
    initialLocation: '/',
    debugLogDiagnostics: false,
    refreshListenable: GoRouterRefreshStream(authStream),
    redirect: (context, state) {
      User? user;
      try {
        user = Supabase.instance.client.auth.currentUser;
      } catch (_) {
        user = null;
      }
      final isLoggedIn = user != null;
      final loc = state.matchedLocation;

      // Routes requiring authentication
      final requiresAuth = loc.startsWith('/checkout') ||
          loc.startsWith('/orders') ||
          loc.startsWith('/profile') ||
          loc.startsWith('/addresses') ||
          loc.startsWith('/notifications') ||
          loc.startsWith('/security') ||
          loc.startsWith('/wallet') ||
          loc.startsWith('/chat') ||
          loc.startsWith('/seller') ||
          loc.startsWith('/plans');

      final isAuthRoute = loc == '/login' || loc == '/register';

      if (!isLoggedIn && requiresAuth) {
        return '/login';
      }
      if (isLoggedIn && isAuthRoute) {
        return '/';
      }
      return null;
    },
    routes: [
      // ── Auth ──────────────────────────────────────────────────────────────
      GoRoute(path: '/login', builder: (_, __) => const LoginScreen()),
      GoRoute(path: '/register', builder: (_, __) => const RegisterScreen()),

      // ── Marketplace Public Discovery ──────────────────────────────────────
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
      GoRoute(path: '/cart', builder: (_, __) => const CartScreen()),
      GoRoute(path: '/wishlist', builder: (_, __) => const WishlistScreen()),

      // ── Protected Checkout & Orders ───────────────────────────────────────
      GoRoute(path: '/checkout', builder: (_, __) => const CheckoutScreen()),
      GoRoute(path: '/orders', builder: (_, __) => const OrdersScreen()),
      GoRoute(
        path: '/orders/:orderId',
        builder: (_, state) => OrderTrackingScreen(
          orderId: state.pathParameters['orderId'] ?? '',
        ),
      ),

      // ── Protected Messaging ───────────────────────────────────────────────
      GoRoute(
        path: '/chat/:storeId',
        builder: (_, state) => ChatScreen(
          storeId: state.pathParameters['storeId'] ?? '',
          productId: state.uri.queryParameters['productId'],
          orderId: state.uri.queryParameters['orderId'],
        ),
      ),

      // ── Protected Seller Centre ───────────────────────────────────────────
      GoRoute(path: '/seller', builder: (_, __) => const SellerCentreScreen()),
      GoRoute(path: '/seller/products', builder: (_, __) => const ManageProductsScreen()),
      GoRoute(path: '/seller/products/add', builder: (_, __) => const AddProductScreen()),
      GoRoute(path: '/plans', builder: (_, __) => const SubscriptionPlansScreen()),

      // ── Protected User Account & Wallet ───────────────────────────────────
      GoRoute(path: '/profile', builder: (_, __) => const AccountScreen()),
      GoRoute(path: '/addresses', builder: (_, __) => const SavedAddressesScreen()),
      GoRoute(path: '/notifications', builder: (_, __) => const NotificationsScreen()),
      GoRoute(path: '/security', builder: (_, __) => const SecurityScreen()),
      GoRoute(path: '/wallet', builder: (_, __) => const WalletLedgerScreen()),
      GoRoute(path: '/driver', builder: (_, __) => const DriverConsoleScreen()),
      GoRoute(path: '/services', builder: (_, __) => const ServiceListingsScreen()),
      GoRoute(path: '/services/add', builder: (_, __) => const PostServiceAdScreen()),
      GoRoute(path: '/about', builder: (_, __) => const AboutUsScreen()),
    ],
    errorBuilder: (context, state) => Scaffold(
      appBar: AppBar(title: const Text('Page Not Found')),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(24.0),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(Icons.error_outline, size: 64, color: Colors.amber),
              const SizedBox(height: 16),
              Text('Page not found: ${state.error}', textAlign: TextAlign.center),
              const SizedBox(height: 24),
              ElevatedButton(
                onPressed: () => context.go('/'),
                child: const Text('Back to Home'),
              ),
            ],
          ),
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
