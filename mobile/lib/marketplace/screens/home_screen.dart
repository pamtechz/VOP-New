import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../auth/providers/auth_provider.dart';
import '../../core/services/supabase_service.dart';
import '../../cart/providers/cart_provider.dart';
import '../../core/widgets/app_network_image.dart';

// ── Category Icon & Visual Style Helper ─────────────────────────────────────

class CategoryVisual {
  final IconData icon;
  final Color primaryColor;
  final Color backgroundColor;

  const CategoryVisual({
    required this.icon,
    required this.primaryColor,
    required this.backgroundColor,
  });
}

CategoryVisual getCategoryVisual(String? slug, String? name) {
  final s = (slug ?? '').toLowerCase();
  final n = (name ?? '').toLowerCase();

  if (s.contains('electron') || n.contains('electron') || s.contains('gadget') || n.contains('phone')) {
    return const CategoryVisual(
      icon: Icons.devices_other_rounded,
      primaryColor: Color(0xFF2563EB),
      backgroundColor: Color(0xFFDBEAFE),
    );
  } else if (s.contains('fashion') || n.contains('fashion') || s.contains('cloth') || n.contains('wear')) {
    return const CategoryVisual(
      icon: Icons.checkroom_rounded,
      primaryColor: Color(0xFFE11D48),
      backgroundColor: Color(0xFFFFE4E6),
    );
  } else if (s.contains('home') || n.contains('home') || s.contains('garden') || n.contains('furnitur')) {
    return const CategoryVisual(
      icon: Icons.chair_rounded,
      primaryColor: Color(0xFFD97706),
      backgroundColor: Color(0xFFFEF3C7),
    );
  } else if (s.contains('food') || n.contains('food') || s.contains('produce') || n.contains('grocer') || s.contains('fresh')) {
    return const CategoryVisual(
      icon: Icons.eco_rounded,
      primaryColor: Color(0xFF059669),
      backgroundColor: Color(0xFFD1FAE5),
    );
  } else if (s.contains('beauty') || n.contains('beauty') || s.contains('wellness') || n.contains('health')) {
    return const CategoryVisual(
      icon: Icons.spa_rounded,
      primaryColor: Color(0xFF7C3AED),
      backgroundColor: Color(0xFFEDE9FE),
    );
  } else if (s.contains('service') || n.contains('service') || s.contains('craft') || n.contains('hand')) {
    return const CategoryVisual(
      icon: Icons.handyman_rounded,
      primaryColor: Color(0xFF0891B2),
      backgroundColor: Color(0xFFCFFAFE),
    );
  } else if (s.contains('car') || n.contains('motor') || s.contains('auto') || s.contains('vehicle')) {
    return const CategoryVisual(
      icon: Icons.directions_car_rounded,
      primaryColor: Color(0xFFEAB308),
      backgroundColor: Color(0xFFFEF9C3),
    );
  } else if (s.contains('sport') || n.contains('fitness') || s.contains('gym')) {
    return const CategoryVisual(
      icon: Icons.sports_soccer_rounded,
      primaryColor: Color(0xFF4F46E5),
      backgroundColor: Color(0xFFEEF2FF),
    );
  }

  return const CategoryVisual(
    icon: Icons.local_offer_outlined,
    primaryColor: Color(0xFF0D9488),
    backgroundColor: Color(0xFFCCFBF1),
  );
}

// ── Data Providers ──────────────────────────────────────────────────────────

final selectedHomeCategoryProvider = StateProvider<String?>((ref) => null);

final categoriesProvider = FutureProvider<List<Map<String, dynamic>>>((ref) async {
  final data = await SupabaseService.client
      .from('categories')
      .select('id, name, slug, icon_url, display_order')
      .eq('is_active', true)
      .order('display_order', ascending: true);
  return List<Map<String, dynamic>>.from(data as List);
});

final featuredProductsProvider = FutureProvider<List<Map<String, dynamic>>>((ref) async {
  // Try querying explicit featured items first
  var data = await SupabaseService.client
      .from('products')
      .select('''
        id, title, price, compare_at_price, status, is_featured,
        product_images(url, display_order),
        stores(name, slug)
      ''')
      .eq('status', 'active')
      .eq('is_featured', true)
      .order('created_at', ascending: false)
      .limit(10);

  // If no featured flag is set, gracefully pull recent active products
  if ((data as List).isEmpty) {
    data = await SupabaseService.client
        .from('products')
        .select('''
          id, title, price, compare_at_price, status, is_featured,
          product_images(url, display_order),
          stores(name, slug)
        ''')
        .eq('status', 'active')
        .order('created_at', ascending: false)
        .limit(10);
  }

  return List<Map<String, dynamic>>.from(data as List);
});

final homeProductsProvider = FutureProvider<List<Map<String, dynamic>>>((ref) async {
  final selectedCatSlug = ref.watch(selectedHomeCategoryProvider);

  var builder = SupabaseService.client
      .from('products')
      .select('''
        id, title, price, compare_at_price, status,
        product_images(url, display_order),
        stores(name, slug),
        categories(id, name, slug)
      ''')
      .eq('status', 'active');

  if (selectedCatSlug != null && selectedCatSlug.isNotEmpty) {
    final cat = await SupabaseService.client
        .from('categories')
        .select('id')
        .eq('slug', selectedCatSlug)
        .maybeSingle();

    if (cat != null) {
      builder = builder.eq('category_id', cat['id']);
    }
  }

  final data = await builder.order('created_at', ascending: false).limit(30);
  return List<Map<String, dynamic>>.from(data as List);
});

// ── Home Screen ─────────────────────────────────────────────────────────────

class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final profile = ref.watch(profileProvider);
    final featured = ref.watch(featuredProductsProvider);
    final catalogue = ref.watch(homeProductsProvider);
    final categories = ref.watch(categoriesProvider);
    final selectedCategory = ref.watch(selectedHomeCategoryProvider);
    final scheme = Theme.of(context).colorScheme;

    return Scaffold(
      appBar: AppBar(
        title: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(6),
              decoration: BoxDecoration(
                color: scheme.primary.withValues(alpha: 0.15),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Icon(Icons.storefront_rounded, color: scheme.primary, size: 22),
            ),
            const SizedBox(width: 10),
            Text(
              'Ubuy - Store',
              style: TextStyle(
                fontWeight: FontWeight.bold,
                letterSpacing: -0.5,
                color: scheme.onSurface,
              ),
            ),
          ],
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.search_rounded),
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
                padding: const EdgeInsets.only(right: 14),
                child: CircleAvatar(
                  radius: 16,
                  backgroundColor: scheme.primaryContainer,
                  backgroundImage: (p?['avatar_url'] as String?)?.isNotEmpty == true
                      ? NetworkImage(p!['avatar_url'] as String)
                      : null,
                  child: (p?['avatar_url'] as String?)?.isNotEmpty != true
                      ? Text(
                          (p?['full_name'] as String? ?? 'U').substring(0, 1).toUpperCase(),
                          style: TextStyle(fontSize: 13, color: scheme.onPrimaryContainer, fontWeight: FontWeight.bold),
                        )
                      : null,
                ),
              ),
            ),
            loading: () => const Padding(
              padding: EdgeInsets.only(right: 14),
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
          ref.invalidate(homeProductsProvider);
          ref.invalidate(categoriesProvider);
        },
        child: CustomScrollView(
          slivers: [
            // ── Hero Search Banner (DubiCars / Oliva Inspiration) ─────────
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Let\'s find your perfect product',
                      style: Theme.of(context).textTheme.titleLarge?.copyWith(
                            fontWeight: FontWeight.w800,
                            letterSpacing: -0.4,
                          ),
                    ),
                    const SizedBox(height: 12),
                    InkWell(
                      borderRadius: BorderRadius.circular(16),
                      onTap: () => context.push('/search'),
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                        decoration: BoxDecoration(
                          color: scheme.surfaceContainerHighest.withValues(alpha: 0.6),
                          borderRadius: BorderRadius.circular(16),
                          border: Border.all(color: scheme.outlineVariant.withValues(alpha: 0.35)),
                        ),
                        child: Row(
                          children: [
                            Icon(Icons.search_rounded, size: 22, color: scheme.primary),
                            const SizedBox(width: 10),
                            Expanded(
                              child: Text(
                                'Search electronics, clothing, vehicles, furniture...',
                                style: TextStyle(color: scheme.outline, fontSize: 13),
                              ),
                            ),
                            Container(
                              padding: const EdgeInsets.all(6),
                              decoration: BoxDecoration(
                                color: scheme.primary.withValues(alpha: 0.15),
                                borderRadius: BorderRadius.circular(10),
                              ),
                              child: Icon(Icons.tune_rounded, size: 16, color: scheme.primary),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),

            // ── Dynamic Categories with Distinct Visual Icons ─────────────
            SliverToBoxAdapter(
              child: categories.when(
                data: (cats) => cats.isEmpty
                    ? const SizedBox.shrink()
                    : _CategoryHorizontalRow(
                        categories: cats,
                        selectedSlug: selectedCategory,
                        onSelectCategory: (slug) {
                          ref.read(selectedHomeCategoryProvider.notifier).state =
                              selectedCategory == slug ? null : slug;
                        },
                      ),
                loading: () => const _SectionSkeleton(height: 100),
                error: (e, _) => _ErrorTile(message: e.toString()),
              ),
            ),

            // ── Featured Products Carousel ────────────────────────────────
            if (selectedCategory == null) ...[
              const SliverToBoxAdapter(
                child: _SectionHeader(
                  title: 'Featured Deals',
                  seeAllRoute: '/search',
                ),
              ),
              SliverToBoxAdapter(
                child: featured.when(
                  data: (prods) => prods.isEmpty
                      ? const _EmptyState(message: 'No featured products yet')
                      : _HorizontalProductList(products: prods),
                  loading: () => const _SectionSkeleton(height: 250),
                  error: (e, _) => _ErrorTile(message: e.toString()),
                ),
              ),
            ],

            // ── Catalogue / Category Filtered Products ────────────────────
            SliverToBoxAdapter(
              child: _SectionHeader(
                title: selectedCategory != null
                    ? 'Category: ${selectedCategory.replaceAll('-', ' ').toUpperCase()}'
                    : 'Explore Catalogue',
                seeAllRoute: selectedCategory != null ? '/search?category=$selectedCategory' : '/search',
              ),
            ),

            catalogue.when(
              data: (prods) => prods.isEmpty
                  ? const SliverToBoxAdapter(
                      child: _EmptyState(message: 'No active products found in this section.'),
                    )
                  : _ProductGrid(products: prods),
              loading: () => const SliverToBoxAdapter(child: _SectionSkeleton(height: 380)),
              error: (e, _) => SliverToBoxAdapter(child: _ErrorTile(message: e.toString())),
            ),

            const SliverToBoxAdapter(child: SizedBox(height: 80)),
          ],
        ),
      ),
      bottomNavigationBar: NavigationBar(
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.home_outlined),
            selectedIcon: Icon(Icons.home_rounded),
            label: 'Home',
          ),
          NavigationDestination(
            icon: Icon(Icons.search_rounded),
            selectedIcon: Icon(Icons.search),
            label: 'Search',
          ),
          NavigationDestination(
            icon: Icon(Icons.shopping_bag_outlined),
            selectedIcon: Icon(Icons.shopping_bag_rounded),
            label: 'Orders',
          ),
          NavigationDestination(
            icon: Icon(Icons.storefront_outlined),
            selectedIcon: Icon(Icons.storefront_rounded),
            label: 'Sell',
          ),
          NavigationDestination(
            icon: Icon(Icons.person_outline_rounded),
            selectedIcon: Icon(Icons.person_rounded),
            label: 'Profile',
          ),
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

// ── Sub-Widgets ─────────────────────────────────────────────────────────────

class _CategoryHorizontalRow extends StatelessWidget {
  final List<Map<String, dynamic>> categories;
  final String? selectedSlug;
  final void Function(String slug) onSelectCategory;

  const _CategoryHorizontalRow({
    required this.categories,
    required this.selectedSlug,
    required this.onSelectCategory,
  });

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 108,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        itemCount: categories.length,
        separatorBuilder: (_, __) => const SizedBox(width: 14),
        itemBuilder: (ctx, i) {
          final cat = categories[i];
          final slug = cat['slug'] as String? ?? '';
          final name = cat['name'] as String? ?? '';
          final iconUrl = cat['icon_url'] as String?;
          final isSelected = selectedSlug == slug;

          final visual = getCategoryVisual(slug, name);

          return GestureDetector(
            onTap: () => onSelectCategory(slug),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                AnimatedContainer(
                  duration: const Duration(milliseconds: 200),
                  width: 58,
                  height: 58,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: isSelected
                        ? visual.primaryColor
                        : visual.backgroundColor,
                    border: Border.all(
                      color: isSelected
                          ? visual.primaryColor
                          : visual.primaryColor.withValues(alpha: 0.35),
                      width: isSelected ? 2.5 : 1.2,
                    ),
                    boxShadow: isSelected
                        ? [
                            BoxShadow(
                              color: visual.primaryColor.withValues(alpha: 0.4),
                              blurRadius: 8,
                              offset: const Offset(0, 3),
                            ),
                          ]
                        : [],
                  ),
                  child: Center(
                    child: iconUrl != null && iconUrl.isNotEmpty
                        ? ClipOval(
                            child: AppNetworkImage(
                              imageUrlOrCode: iconUrl,
                              width: 58,
                              height: 58,
                              fit: BoxFit.cover,
                              errorWidget: Icon(
                                visual.icon,
                                size: 26,
                                color: isSelected ? Colors.white : visual.primaryColor,
                              ),
                            ),
                          )
                        : Icon(
                            visual.icon,
                            size: 26,
                            color: isSelected ? Colors.white : visual.primaryColor,
                          ),
                  ),
                ),
                const SizedBox(height: 6),
                SizedBox(
                  width: 72,
                  child: Text(
                    name,
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: isSelected ? FontWeight.w800 : FontWeight.w600,
                      color: isSelected
                          ? Theme.of(ctx).colorScheme.primary
                          : Theme.of(ctx).colorScheme.onSurface,
                    ),
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
}

class _SectionHeader extends StatelessWidget {
  final String title;
  final String? seeAllRoute;

  const _SectionHeader({required this.title, this.seeAllRoute});

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(16, 18, 16, 8),
    child: Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(
          title,
          style: Theme.of(context).textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.bold,
                letterSpacing: -0.2,
              ),
        ),
        if (seeAllRoute != null)
          InkWell(
            onTap: () => context.push(seeAllRoute!),
            child: Text(
              'See All',
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.bold,
                color: Theme.of(context).colorScheme.primary,
              ),
            ),
          ),
      ],
    ),
  );
}

class _HorizontalProductList extends StatelessWidget {
  final List<Map<String, dynamic>> products;
  const _HorizontalProductList({required this.products});

  @override
  Widget build(BuildContext context) => SizedBox(
    height: 270,
    child: ListView.separated(
      scrollDirection: Axis.horizontal,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      itemCount: products.length,
      separatorBuilder: (_, __) => const SizedBox(width: 12),
      itemBuilder: (ctx, i) => _ProductCard(product: products[i], width: 170),
    ),
  );
}

class _ProductGrid extends StatelessWidget {
  final List<Map<String, dynamic>> products;
  const _ProductGrid({required this.products});

  @override
  Widget build(BuildContext context) => SliverPadding(
    padding: const EdgeInsets.symmetric(horizontal: 16),
    sliver: SliverGrid(
      delegate: SliverChildBuilderDelegate(
        (ctx, i) => _ProductCard(product: products[i]),
        childCount: products.length,
      ),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 2,
        crossAxisSpacing: 12,
        mainAxisSpacing: 12,
        childAspectRatio: 0.62,
      ),
    ),
  );
}

class _ProductCard extends ConsumerWidget {
  final Map<String, dynamic> product;
  final double? width;

  const _ProductCard({required this.product, this.width});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final scheme = Theme.of(context).colorScheme;
    final images = (product['product_images'] as List? ?? [])
      ..sort((a, b) =>
          ((a['display_order'] as int?) ?? 0)
              .compareTo((b['display_order'] as int?) ?? 0));
    final imageUrl = images.isNotEmpty ? images.first['url'] as String? : null;
    final title = product['title'] as String? ?? '';
    final price = (product['price'] as num?)?.toDouble() ?? 0.0;
    final compareAt = (product['compare_at_price'] as num?)?.toDouble();
    final store = product['stores'] as Map<String, dynamic>?;
    final storeName = store?['name'] as String? ?? '';
    final productId = product['id'] as String? ?? '';

    return GestureDetector(
      onTap: () => context.push('/product/$productId'),
      child: Container(
        width: width,
        decoration: BoxDecoration(
          color: scheme.surfaceContainerHighest.withValues(alpha: 0.35),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: scheme.outlineVariant.withValues(alpha: 0.3)),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.04),
              blurRadius: 8,
              offset: const Offset(0, 2),
            ),
          ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Image
            ClipRRect(
              borderRadius: const BorderRadius.vertical(top: Radius.circular(16)),
              child: AspectRatio(
                aspectRatio: 1.05,
                child: AppNetworkImage(
                  imageUrlOrCode: imageUrl,
                  fit: BoxFit.cover,
                  errorWidget: _imagePlaceholder(scheme),
                ),
              ),
            ),
            // Info
            Expanded(
              child: Padding(
                padding: const EdgeInsets.all(10),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        if (storeName.isNotEmpty) ...[
                          Text(
                            storeName,
                            style: TextStyle(
                              fontSize: 10,
                              color: scheme.outline,
                              fontWeight: FontWeight.w500,
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                          const SizedBox(height: 2),
                        ],
                        Text(
                          title,
                          style: const TextStyle(
                            fontWeight: FontWeight.w600,
                            fontSize: 12,
                            height: 1.2,
                          ),
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ],
                    ),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      crossAxisAlignment: CrossAxisAlignment.center,
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                'K ${price.toStringAsFixed(2)}',
                                style: TextStyle(
                                  fontWeight: FontWeight.bold,
                                  fontSize: 13,
                                  color: scheme.primary,
                                ),
                              ),
                              if (compareAt != null && compareAt > price)
                                Text(
                                  'K ${compareAt.toStringAsFixed(2)}',
                                  style: TextStyle(
                                    decoration: TextDecoration.lineThrough,
                                    fontSize: 10,
                                    color: scheme.outline,
                                  ),
                                ),
                            ],
                          ),
                        ),
                        InkWell(
                          onTap: () {
                            ref.read(cartProvider.notifier).addItem(
                                  productId: productId,
                                  title: title,
                                  price: price,
                                  imageUrl: imageUrl,
                                  storeId: store?['id'] as String? ?? 'store',
                                  storeName: storeName.isNotEmpty ? storeName : 'Store',
                                );
                            ScaffoldMessenger.of(context).showSnackBar(
                              SnackBar(
                                content: Text('$title added to cart!'),
                                duration: const Duration(seconds: 1),
                                behavior: SnackBarBehavior.floating,
                                backgroundColor: const Color(0xFF10B981),
                              ),
                            );
                          },
                          borderRadius: BorderRadius.circular(20),
                          child: Container(
                            padding: const EdgeInsets.all(7),
                            decoration: BoxDecoration(
                              color: scheme.primary,
                              shape: BoxShape.circle,
                            ),
                            child: const Icon(
                              Icons.add_shopping_cart_rounded,
                              size: 14,
                              color: Colors.white,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _imagePlaceholder(ColorScheme scheme) => Container(
    color: scheme.surfaceContainerHighest,
    child: Center(
      child: Icon(Icons.shopping_bag_outlined, size: 36, color: scheme.outline),
    ),
  );
}

class _SectionSkeleton extends StatelessWidget {
  final double height;
  const _SectionSkeleton({required this.height});

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(horizontal: 16),
    child: Container(
      height: height,
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surfaceContainerHighest.withValues(alpha: 0.4),
        borderRadius: BorderRadius.circular(16),
      ),
    ),
  );
}

class _EmptyState extends StatelessWidget {
  final String message;
  const _EmptyState({required this.message});

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.all(24),
    child: Center(
      child: Text(
        message,
        style: TextStyle(color: Theme.of(context).colorScheme.outline, fontSize: 13),
      ),
    ),
  );
}

class _ErrorTile extends StatelessWidget {
  final String message;
  const _ErrorTile({required this.message});

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.all(16),
    child: Text(
      'Could not load data: $message',
      style: TextStyle(color: Theme.of(context).colorScheme.error, fontSize: 12),
    ),
  );
}
