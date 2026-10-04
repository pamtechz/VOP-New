import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/services/supabase_service.dart';

// ── Provider ─────────────────────────────────────────────────────────────────
final searchResultsProvider =
    FutureProvider.family<List<Map<String, dynamic>>, String>((ref, query) async {
  if (query.trim().length < 2) return [];
  final data = await SupabaseService.client
      .from('products')
      .select('''
        id, title, price,
        product_images(url, display_order),
        stores(name, slug)
      ''')
      .eq('status', 'active')
      .ilike('title', '%$query%')
      .order('created_at', ascending: false)
      .limit(30);
  return List<Map<String, dynamic>>.from(data as List);
});

// ── Screen ───────────────────────────────────────────────────────────────────
class SearchScreen extends ConsumerStatefulWidget {
  const SearchScreen({super.key});

  @override
  ConsumerState<SearchScreen> createState() => _SearchScreenState();
}

class _SearchScreenState extends ConsumerState<SearchScreen> {
  final _searchController = TextEditingController();
  String _query = '';

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final results = ref.watch(searchResultsProvider(_query));

    return Scaffold(
      appBar: AppBar(
        title: TextField(
          controller: _searchController,
          autofocus: true,
          decoration: const InputDecoration(
            hintText: 'Search products...',
            border: InputBorder.none,
          ),
          onChanged: (val) {
            if (val.length >= 2 || val.isEmpty) {
              setState(() => _query = val);
            }
          },
        ),
        actions: [
          if (_query.isNotEmpty)
            IconButton(
              icon: const Icon(Icons.clear),
              onPressed: () {
                _searchController.clear();
                setState(() => _query = '');
              },
            ),
        ],
      ),
      body: _query.length < 2
          ? Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(Icons.search_rounded, size: 64, color: scheme.outline),
                  const SizedBox(height: 16),
                  Text('Type at least 2 characters to search',
                      style: TextStyle(color: scheme.outline)),
                ],
              ),
            )
          : results.when(
              loading: () =>
                  const Center(child: CircularProgressIndicator()),
              error: (e, _) => Center(
                child: Text('Error: $e',
                    style: const TextStyle(color: Colors.red)),
              ),
              data: (products) {
                if (products.isEmpty) {
                  return Center(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(Icons.search_off, size: 64, color: scheme.outline),
                        const SizedBox(height: 12),
                        Text('No results for "$_query"',
                            style: TextStyle(color: scheme.outline)),
                      ],
                    ),
                  );
                }
                return ListView.builder(
                  padding: const EdgeInsets.all(12),
                  itemCount: products.length,
                  itemBuilder: (ctx, i) {
                    final p = products[i];
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

                    return Card(
                      margin: const EdgeInsets.only(bottom: 8),
                      child: ListTile(
                        leading: ClipRRect(
                          borderRadius: BorderRadius.circular(8),
                          child: SizedBox(
                            width: 56,
                            height: 56,
                            child: imageUrl != null
                                ? Image.network(imageUrl,
                                    fit: BoxFit.cover,
                                    errorBuilder: (_, __, ___) =>
                                        Container(
                                          color: scheme.surfaceContainerHighest,
                                          child: Icon(Icons.image_outlined,
                                              color: scheme.outline),
                                        ))
                                : Container(
                                    color: scheme.surfaceContainerHighest,
                                    child: Icon(Icons.shopping_bag_outlined,
                                        color: scheme.outline),
                                  ),
                          ),
                        ),
                        title: Text(p['title'] as String? ?? '',
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style:
                                const TextStyle(fontWeight: FontWeight.w600)),
                        subtitle: Text(storeName,
                            style: TextStyle(
                                color: scheme.primary, fontSize: 12)),
                        trailing: Text(
                          'KES ${price.toStringAsFixed(0)}',
                          style: TextStyle(
                              fontWeight: FontWeight.bold,
                              color: scheme.primary),
                        ),
                        onTap: () => ctx.push('/product/${p['id']}'),
                      ),
                    );
                  },
                );
              },
            ),
    );
  }
}
