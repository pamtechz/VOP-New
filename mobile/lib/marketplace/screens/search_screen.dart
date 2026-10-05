import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/services/supabase_service.dart';
import '../../core/widgets/app_network_image.dart';
import '../../core/providers/currency_provider.dart';
import '../../advertising/widgets/sponsored_ad_banner.dart';

// ── Search & Filter State ───────────────────────────────────────────────────

class SearchFilter {
  final String query;
  final String? categorySlug;
  final int page;
  final int pageSize;

  const SearchFilter({
    this.query = '',
    this.categorySlug,
    this.page = 0,
    this.pageSize = 20,
  });

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is SearchFilter &&
          runtimeType == other.runtimeType &&
          query == other.query &&
          categorySlug == other.categorySlug &&
          page == other.page &&
          pageSize == other.pageSize;

  @override
  int get hashCode =>
      query.hashCode ^ categorySlug.hashCode ^ page.hashCode ^ pageSize.hashCode;
}

// ── Providers ───────────────────────────────────────────────────────────────

final searchCategoriesProvider = FutureProvider<List<Map<String, dynamic>>>((ref) async {
  final data = await SupabaseService.client
      .from('categories')
      .select('id, name, slug, icon_url')
      .eq('is_active', true)
      .order('display_order', ascending: true);
  return List<Map<String, dynamic>>.from(data as List);
});

final searchResultsProvider =
    FutureProvider.family<List<Map<String, dynamic>>, SearchFilter>((ref, filter) async {
  final query = filter.query.trim();
  final catSlug = filter.categorySlug;

  if (query.length < 2 && (catSlug == null || catSlug.isEmpty)) {
    return [];
  }

  var builder = SupabaseService.client
      .from('products')
      .select('''
        id, title, price, compare_at_price, status,
        product_images(url, display_order),
        stores(name, slug),
        categories(id, name, slug)
      ''')
      .eq('status', 'active');

  if (catSlug != null && catSlug.isNotEmpty) {
    final cat = await SupabaseService.client
        .from('categories')
        .select('id')
        .eq('slug', catSlug)
        .maybeSingle();

    if (cat != null) {
      builder = builder.eq('category_id', cat['id']);
    }
  }

  if (query.isNotEmpty) {
    builder = builder.ilike('title', '%$query%');
  }

  final offset = filter.page * filter.pageSize;
  final data = await builder
      .order('created_at', ascending: false)
      .range(offset, offset + filter.pageSize - 1);

  return List<Map<String, dynamic>>.from(data as List);
});

// ── Screen ───────────────────────────────────────────────────────────────────

class SearchScreen extends ConsumerStatefulWidget {
  final String? initialCategory;
  final String? initialQuery;

  const SearchScreen({
    super.key,
    this.initialCategory,
    this.initialQuery,
  });

  @override
  ConsumerState<SearchScreen> createState() => _SearchScreenState();
}

class _SearchScreenState extends ConsumerState<SearchScreen> {
  late final TextEditingController _searchController;
  Timer? _debounceTimer;
  String? _selectedCategorySlug;
  String _debouncedQuery = '';
  int _page = 0;

  @override
  void initState() {
    super.initState();
    _searchController = TextEditingController(text: widget.initialQuery ?? '');
    _debouncedQuery = widget.initialQuery ?? '';
    _selectedCategorySlug = widget.initialCategory;
  }

  @override
  void dispose() {
    _debounceTimer?.cancel();
    _searchController.dispose();
    super.dispose();
  }

  void _onSearchChanged(String val) {
    _debounceTimer?.cancel();
    _debounceTimer = Timer(const Duration(milliseconds: 350), () {
      if (mounted) {
        setState(() {
          _debouncedQuery = val.trim();
          _page = 0;
        });
      }
    });
  }

  SearchFilter get _currentFilter => SearchFilter(
        query: _debouncedQuery,
        categorySlug: _selectedCategorySlug,
        page: _page,
        pageSize: 20,
      );

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final currency = ref.watch(currencyProvider).valueOrNull ?? const CurrencyConfig();
    final filter = _currentFilter;
    final results = ref.watch(searchResultsProvider(filter));
    final categoriesAsync = ref.watch(searchCategoriesProvider);

    final isSearching = filter.query.length >= 2 || (filter.categorySlug != null && filter.categorySlug!.isNotEmpty);

    return Scaffold(
      appBar: AppBar(
        title: TextField(
          controller: _searchController,
          autofocus: widget.initialQuery == null && widget.initialCategory == null,
          decoration: const InputDecoration(
            hintText: 'Search products, tech, fashion...',
            border: InputBorder.none,
          ),
          onChanged: _onSearchChanged,
        ),
        actions: [
          if (_searchController.text.isNotEmpty || _selectedCategorySlug != null)
            IconButton(
              icon: const Icon(Icons.clear),
              onPressed: () {
                _debounceTimer?.cancel();
                setState(() {
                  _searchController.clear();
                  _debouncedQuery = '';
                  _selectedCategorySlug = null;
                  _page = 0;
                });
              },
            ),
        ],
      ),
      body: Column(
        children: [
          // Dynamic category filter horizontal chips from Database
          categoriesAsync.when(
            data: (cats) {
              if (cats.isEmpty) return const SizedBox.shrink();
              return Container(
                height: 48,
                padding: const EdgeInsets.symmetric(vertical: 6),
                child: ListView.separated(
                  scrollDirection: Axis.horizontal,
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  itemCount: cats.length + 1,
                  separatorBuilder: (_, __) => const SizedBox(width: 8),
                  itemBuilder: (ctx, i) {
                    if (i == 0) {
                      final isSelected = _selectedCategorySlug == null;
                      return ChoiceChip(
                        label: const Text('All'),
                        selected: isSelected,
                        onSelected: (selected) {
                          if (selected) {
                            setState(() {
                              _selectedCategorySlug = null;
                              _page = 0;
                            });
                          }
                        },
                      );
                    }
                    final cat = cats[i - 1];
                    final slug = cat['slug'] as String? ?? '';
                    final name = cat['name'] as String? ?? '';
                    final isSelected = _selectedCategorySlug == slug;

                    return ChoiceChip(
                      label: Text(name),
                      selected: isSelected,
                      onSelected: (selected) {
                        setState(() {
                          _selectedCategorySlug = selected ? slug : null;
                          _page = 0;
                        });
                      },
                    );
                  },
                ),
              );
            },
            loading: () => const SizedBox(height: 48),
            error: (_, __) => const SizedBox.shrink(),
          ),

          const Divider(height: 1),

          // Main body: search results or dynamic popular categories explore view
          Expanded(
            child: !isSearching
                ? _buildEmptyStateExplore(context, scheme, categoriesAsync)
                : results.when(
                    loading: () => const Center(child: CircularProgressIndicator()),
                    error: (e, _) => Center(
                      child: Padding(
                        padding: const EdgeInsets.all(24),
                        child: Text('Error loading results: $e',
                            textAlign: TextAlign.center,
                            style: const TextStyle(color: Colors.red)),
                      ),
                    ),
                    data: (products) {
                      if (products.isEmpty) {
                        return Center(
                          child: Padding(
                            padding: const EdgeInsets.all(24),
                            child: Column(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                Icon(Icons.search_off_rounded, size: 64, color: scheme.outline),
                                const SizedBox(height: 14),
                                Text(
                                  'No products found matching your filter.',
                                  textAlign: TextAlign.center,
                                  style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold),
                                ),
                                const SizedBox(height: 6),
                                const Text(
                                  'Try adjusting your search terms or picking another category.',
                                  textAlign: TextAlign.center,
                                  style: TextStyle(color: Colors.grey, fontSize: 13),
                                ),
                              ],
                            ),
                          ),
                        );
                      }

                      return ListView.builder(
                        padding: const EdgeInsets.all(12),
                        itemCount: products.length + 1,
                        itemBuilder: (ctx, i) {
                          if (i == 0) {
                            return const SponsoredAdBanner(
                              placement: 'explore_inline',
                              padding: EdgeInsets.only(bottom: 12),
                            );
                          }

                          final p = products[i - 1];
                          final images = (p['product_images'] as List? ?? [])
                            ..sort((a, b) =>
                                ((a['display_order'] as int?) ?? 0)
                                    .compareTo((b['display_order'] as int?) ?? 0));
                          final imageUrl = images.isNotEmpty
                              ? images.first['url'] as String?
                              : null;
                          final storeName =
                              (p['stores'] as Map?)?['name'] as String? ?? '';
                          final price = (p['price'] as num?)?.toDouble() ?? 0.0;
                          final compareAt = (p['compare_at_price'] as num?)?.toDouble();

                          return Card(
                            margin: const EdgeInsets.only(bottom: 10),
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                            child: ListTile(
                              contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                              leading: AppNetworkImage(
                                imageUrlOrCode: imageUrl,
                                width: 64,
                                height: 64,
                                borderRadius: BorderRadius.circular(10),
                                fit: BoxFit.cover,
                                errorWidget: Container(
                                  width: 64,
                                  height: 64,
                                  decoration: BoxDecoration(
                                    color: scheme.surfaceContainerHighest,
                                    borderRadius: BorderRadius.circular(10),
                                  ),
                                  child: Icon(Icons.shopping_bag_outlined, color: scheme.outline),
                                ),
                              ),
                              title: Text(
                                p['title'] as String? ?? '',
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14),
                              ),
                              subtitle: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  if (storeName.isNotEmpty) ...[
                                    const SizedBox(height: 2),
                                    Text(storeName, style: TextStyle(fontSize: 11, color: scheme.outline)),
                                  ],
                                  const SizedBox(height: 4),
                                  Row(
                                    children: [
                                      Text(
                                        currency.format(price),
                                        style: TextStyle(
                                          fontWeight: FontWeight.bold,
                                          fontSize: 13,
                                          color: scheme.primary,
                                        ),
                                      ),
                                      if (compareAt != null && compareAt > price) ...[
                                        const SizedBox(width: 8),
                                        Text(
                                          currency.format(compareAt),
                                          style: TextStyle(
                                            decoration: TextDecoration.lineThrough,
                                            fontSize: 11,
                                            color: scheme.outline,
                                          ),
                                        ),
                                      ],
                                    ],
                                  ),
                                ],
                              ),
                              trailing: const Icon(Icons.chevron_right),
                              onTap: () => context.push('/product/${p['id']}'),
                            ),
                          );
                        },
                      );
                    },
                  ),
          ),
        ],
      ),
    );
  }

  Widget _buildEmptyStateExplore(
    BuildContext context,
    ColorScheme scheme,
    AsyncValue<List<Map<String, dynamic>>> categoriesAsync,
  ) {
    final theme = Theme.of(context);

    return SingleChildScrollView(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const SponsoredAdBanner(
            placement: 'explore_inline',
            padding: EdgeInsets.only(bottom: 20),
          ),

          Center(
            child: Column(
              children: [
                Container(
                  width: 68,
                  height: 68,
                  decoration: BoxDecoration(
                    color: scheme.primary.withValues(alpha: 0.1),
                    shape: BoxShape.circle,
                  ),
                  child: Icon(Icons.search_rounded, size: 36, color: scheme.primary),
                ),
                const SizedBox(height: 14),
                Text(
                  'Explore products across all verified stores',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: scheme.outline, fontWeight: FontWeight.w500, fontSize: 13),
                ),
              ],
            ),
          ),
          const SizedBox(height: 28),

          Text('Browse by Category', style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.bold)),
          const SizedBox(height: 12),

          categoriesAsync.when(
            data: (cats) {
              if (cats.isEmpty) {
                return const Text('No categories available.', style: TextStyle(color: Colors.grey));
              }
              return Wrap(
                spacing: 8,
                runSpacing: 8,
                children: cats.map((cat) {
                  final name = cat['name'] as String? ?? '';
                  final slug = cat['slug'] as String? ?? '';
                  return ActionChip(
                    avatar: const Icon(Icons.explore_outlined, size: 14),
                    label: Text(name),
                    onPressed: () {
                      setState(() {
                        _selectedCategorySlug = slug;
                        _page = 0;
                      });
                    },
                  );
                }).toList(),
              );
            },
            loading: () => const CircularProgressIndicator(),
            error: (e, _) => Text('Failed to load categories: $e'),
          ),
        ],
      ),
    );
  }
}
