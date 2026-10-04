import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../auth/providers/auth_provider.dart';
import '../../core/services/supabase_service.dart';
import '../../cart/providers/cart_provider.dart';

// ── Data providers (real Supabase queries) ─────────────────────────────────

final featuredProductsProvider = FutureProvider<List<Map<String, dynamic>>>((ref) async {
  final data = await SupabaseService.client
      .from('products')
      .select('''
        id, title, price, status,
        product_images(url, display_order),
        stores(name, slug)
      ''')
      .eq('status', 'active')
      .eq('is_featured', true)
      .order('created_at', ascending: false)
      .limit(10);
  return List<Map<String, dynamic>>.from(data as List);
});

final recentProductsProvider = FutureProvider<List<Map<String, dynamic>>>((ref) async {
  final data = await SupabaseService.client
      .from('products')
      .select('''
        id, title, price,
        product_images(url, display_order),
        stores(name, slug)
      ''')
      .eq('status', 'active')
      .order('created_at', ascending: false)
      .limit(20);
  return List<Map<String, dynamic>>.from(data as List);
});

final categoriesProvider = FutureProvider<List<Map<String, dynamic>>>((ref) async {
  final data = await SupabaseService.client
      .from('categories')
      .select('id, name, slug, icon_url')
      .eq('is_active', true)
      .order('display_order', ascending: true)
      .limit(12);
  return List<Map<String, dynamic>>.from(data as List);
});

// ── Home Screen ──────────────────────────────────────────────────────────────

class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final profile = ref.watch(profileProvider);
    final featured = ref.watch(featuredProductsProvider);
    final recent = ref.watch(recentProductsProvider);
    final categories = ref.watch(categoriesProvider);
    final scheme = Theme.of(context).colorScheme;

    return Scaffold(
      appBar: AppBar(
        title: Row(
          children: [
            Icon(Icons.storefront_rounded, color: scheme.primary),
            const SizedBox(width: 8),
            const Text('Ubuy - Store', style: TextStyle(fontWeight: FontWeight.bold)),
          ],
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.search),
            tooltip: 'Search',
            onPressed: () => context.push('/search'),
          ),
          IconButton(
            icon: Badge(
              isLabelVisible: ref.watch(cartProvider).isNotEmpty,
              label: Text('${ref.watch(cartProvider.notifier).totalItemCount}'),
              child: const Icon(Icons.shopping_cart_outlined),
            ),
            tooltip: 'Cart',
            onPressed: () => context.push('/cart'),
          ),
          profile.when(
            data: (p) => GestureDetector(
              onTap: () => context.push('/profile'),
              child: Padding(
                padding: const EdgeInsets.only(right: 12),
                child: CircleAvatar(
                  radius: 16,
                  backgroundColor: scheme.primaryContainer,
                  backgroundImage: (p?['avatar_url'] as String?)?.isNotEmpty == true
                      ? NetworkImage(p!['avatar_url'] as String)
                      : null,
                  child: (p?['avatar_url'] as String?)?.isNotEmpty != true
                      ? Text(
                          (p?['full_name'] as String? ?? 'U').substring(0, 1).toUpperCase(),
                          style: TextStyle(fontSize: 13, color: scheme.onPrimaryContainer),
                        )
                      : null,
                ),
              ),
            ),
            loading: () => const Padding(
              padding: EdgeInsets.only(right: 12),
              child: CircleAvatar(radius: 16, child: CircularProgressIndicator(strokeWidth: 2)),
            ),
            error: (_, __) => IconButton(
              icon: const Icon(Icons.person_outline),
              onPressed: () => context.push('/profile'),
            ),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(featuredProductsProvider);
          ref.invalidate(recentProductsProvider);
          ref.invalidate(categoriesProvider);
        },
        child: CustomScrollView(
          slivers: [
            // ── Categories ───────────────────────────────────────────────
            SliverToBoxAdapter(
              child: categories.when(
                data: (cats) => cats.isEmpty
                    ? const SizedBox.shrink()
                    : _CategoryRow(categories: cats),
                loading: () => const _SectionSkeleton(height: 90),
                error: (e, _) => _ErrorTile(message: e.toString()),
              ),
            ),

            // ── Featured Products ────────────────────────────────────────
            const SliverToBoxAdapter(child: _SectionHeader(title: 'Featured')),
            SliverToBoxAdapter(
              child: featured.when(
                data: (prods) => prods.isEmpty
                    ? const _EmptyState(message: 'No featured products yet')
                    : _HorizontalProductList(products: prods),
                loading: () => const _SectionSkeleton(height: 220),
                error: (e, _) => _ErrorTile(message: e.toString()),
              ),
            ),

            // ── Recently Added ───────────────────────────────────────────
            const SliverToBoxAdapter(child: _SectionHeader(title: 'Recently Added')),
            recent.when(
              data: (prods) => prods.isEmpty
                  ? const SliverToBoxAdapter(
                      child: _EmptyState(message: 'No products yet. Be the first to sell!'))
                  : _ProductGrid(products: prods),
              loading: () => const SliverToBoxAdapter(child: _SectionSkeleton(height: 400)),
              error: (e, _) => SliverToBoxAdapter(child: _ErrorTile(message: e.toString())),
            ),

            const SliverToBoxAdapter(child: SizedBox(height: 80)),
          ],
        ),
      ),
      bottomNavigationBar: NavigationBar(
        destinations: const [
          NavigationDestination(icon: Icon(Icons.home_outlined), selectedIcon: Icon(Icons.home), label: 'Home'),
          NavigationDestination(icon: Icon(Icons.search), label: 'Search'),
          NavigationDestination(icon: Icon(Icons.shopping_bag_outlined), selectedIcon: Icon(Icons.shopping_bag), label: 'Orders'),
          NavigationDestination(icon: Icon(Icons.storefront_outlined), selectedIcon: Icon(Icons.storefront), label: 'Sell'),
          NavigationDestination(icon: Icon(Icons.person_outline), selectedIcon: Icon(Icons.person), label: 'Profile'),
        ],
        selectedIndex: 0,
        onDestinationSelected: (i) {
          const routes = ['/search', '/orders', '/seller', '/profile'];
          if (i > 0) context.push(routes[i - 1]);
        },
      ),
    );
  }
}

// ── Sub-widgets ───────────────────────────────────────────────────────────────

class _SectionHeader extends StatelessWidget {
  final String title;
  const _SectionHeader({required this.title});

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(16, 20, 16, 8),
    child: Text(title, style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold)),
  );
}

class _CategoryRow extends StatelessWidget {
  final List<Map<String, dynamic>> categories;
  const _CategoryRow({required this.categories});

  @override
  Widget build(BuildContext context) => SizedBox(
    height: 105,
    child: ListView.separated(
      scrollDirection: Axis.horizontal,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
      itemCount: categories.length,
      separatorBuilder: (_, __) => const SizedBox(width: 16),
      itemBuilder: (ctx, i) {
        final cat = categories[i];
        return GestureDetector(
          onTap: () => ctx.push('/search?category=${cat['slug']}'),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              CircleAvatar(
                radius: 26,
                backgroundColor: Theme.of(ctx).colorScheme.primaryContainer,
                backgroundImage: (cat['icon_url'] as String?)?.isNotEmpty == true
                    ? NetworkImage(cat['icon_url'] as String) : null,
                child: (cat['icon_url'] as String?)?.isNotEmpty != true
                    ? const Icon(Icons.category_outlined, size: 20) : null,
              ),
              const SizedBox(height: 6),
              SizedBox(
                width: 68,
                child: Text(
                  cat['name'] as String? ?? '',
                  textAlign: TextAlign.center,
                  style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w500),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ],
          ),
        );
      },
    ),
  );
}

class _HorizontalProductList extends StatelessWidget {
  final List<Map<String, dynamic>> products;
  const _HorizontalProductList({required this.products});

  @override
  Widget build(BuildContext context) => SizedBox(
    height: 255,
    child: ListView.separated(
      scrollDirection: Axis.horizontal,
      padding: const EdgeInsets.symmetric(horizontal: 16),
      itemCount: products.length,
      separatorBuilder: (_, __) => const SizedBox(width: 12),
      itemBuilder: (ctx, i) => _ProductCard(product: products[i], width: 155),
    ),
  );
}

class _ProductGrid extends StatelessWidget {
  final List<Map<String, dynamic>> products;
  const _ProductGrid({required this.products});

  @override
  Widget build(BuildContext context) => SliverPadding(
    padding: const EdgeInsets.symmetric(horizontal: 16),
    child: SliverGrid(
      delegate: SliverChildBuilderDelegate(
        (ctx, i) => _ProductCard(product: products[i]),
        childCount: products.length,
      ),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 2,
        crossAxisSpacing: 12,
        mainAxisSpacing: 12,
        childAspectRatio: 0.65,
      ),
    ),
  );
}

class _ProductCard extends StatelessWidget {
  final Map<String, dynamic> product;
  final double? width;
  const _ProductCard({required this.product, this.width});

  String? get _firstImageUrl {
    final images = product['product_images'] as List?;
    if (images == null || images.isEmpty) return null;
    images.sort((a, b) =>
        ((a as Map)['display_order'] as int? ?? 0)
            .compareTo((b as Map)['display_order'] as int? ?? 0));
    return (images.first as Map)['url'] as String?;
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final price = product['price'] as num? ?? 0;
    final storeName = (product['stores'] as Map?)?['name'] as String? ?? '';

    return GestureDetector(
      onTap: () => context.push('/product/${product['id']}'),
      child: Container(
        width: width,
        decoration: BoxDecoration(
          color: scheme.surface,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: scheme.outlineVariant),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Image
            ClipRRect(
              borderRadius: const BorderRadius.vertical(top: Radius.circular(12)),
              child: AspectRatio(
                aspectRatio: 1,
                child: _firstImageUrl != null
                    ? Image.network(
                        _firstImageUrl!,
                        fit: BoxFit.cover,
                        errorBuilder: (_, __, ___) => _imagePlaceholder(scheme),
                      )
                    : _imagePlaceholder(scheme),
              ),
            ),
            // Info
            Padding(
              padding: const EdgeInsets.all(8),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    product['title'] as String? ?? '',
                    style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 2),
                  Text(
                    storeName,
                    style: TextStyle(fontSize: 11, color: scheme.primary),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 4),
                  Text(
                    'KES ${price.toStringAsFixed(0)}',
                    style: TextStyle(
                      fontWeight: FontWeight.bold,
                      fontSize: 14,
                      color: scheme.primary,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _imagePlaceholder(ColorScheme scheme) => Container(
    color: scheme.surfaceContainerHighest,
    child: Center(child: Icon(Icons.image_outlined, color: scheme.outline, size: 32)),
  );
}

class _SectionSkeleton extends StatelessWidget {
  final double height;
  const _SectionSkeleton({required this.height});

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.all(16),
    child: Container(
      height: height,
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(12),
      ),
    ),
  );
}

class _EmptyState extends StatelessWidget {
  final String message;
  const _EmptyState({required this.message});

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.all(32),
    child: Column(
      children: [
        const Icon(Icons.inbox_outlined, size: 40, color: Colors.grey),
        const SizedBox(height: 8),
        Text(message, textAlign: TextAlign.center, style: const TextStyle(color: Colors.grey)),
      ],
    ),
  );
}

class _ErrorTile extends StatelessWidget {
  final String message;
  const _ErrorTile({required this.message});

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.all(16),
    child: Text('Error loading data: $message', style: const TextStyle(color: Colors.red, fontSize: 12)),
  );
}
