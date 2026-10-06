import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class ServiceListingsScreen extends ConsumerStatefulWidget {
  const ServiceListingsScreen({super.key});

  @override
  ConsumerState<ServiceListingsScreen> createState() => _ServiceListingsScreenState();
}

class _ServiceListingsScreenState extends ConsumerState<ServiceListingsScreen> {
  final List<Map<String, dynamic>> _listings = [];
  bool _isLoading = true;
  String _selectedCategory = 'all';

  final List<Map<String, String>> _categories = [
    {'id': 'all', 'label': 'All Services & Jobs'},
    {'id': 'cleaning', 'label': 'Cleaning Services'},
    {'id': 'maid_housekeeper', 'label': 'Maids & Housekeepers'},
    {'id': 'caretaker_keeper', 'label': 'Caretakers & Keepers'},
    {'id': 'general_job', 'label': 'Jobs & Hiring'},
    {'id': 'maintenance', 'label': 'Maintenance & Repairs'},
  ];

  @override
  void initState() {
    super.initState();
    _fetchListings();
  }

  Future<void> _fetchListings() async {
    setState(() => _isLoading = true);
    try {
      // Fetch active, non-expired listings. Expiry cleanup is a server-only job.
      var query = Supabase.instance.client
          .from('service_listings')
          .select('*')
          .eq('is_active', true)
          .gte('interview_date', DateTime.now().toIso8601String())
          .gte('expires_at', DateTime.now().toIso8601String());

      if (_selectedCategory != 'all') {
        query = query.eq('category', _selectedCategory);
      }

      final data = await query.order('interview_date', ascending: true);

      if (mounted) {
        setState(() {
          _listings.clear();
          _listings.addAll(List<Map<String, dynamic>>.from(data as List));
          _isLoading = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  Future<void> _deleteOwnListing(Map<String, dynamic> item) async {
    final user = Supabase.instance.client.auth.currentUser;
    if (user == null || item['user_id'] != user.id) return;

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete listing?'),
        content: Text('Delete “${item['title'] ?? 'this listing'}”? This cannot be undone.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;

    try {
      await Supabase.instance.client
          .from('service_listings')
          .delete()
          .eq('id', item['id'])
          .eq('user_id', user.id);
      await _fetchListings();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Listing deleted.')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Could not delete listing: $e')),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final currentUserId = Supabase.instance.client.auth.currentUser?.id;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Services & Job Opportunities', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 18)),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: _fetchListings,
          ),
        ],
      ),
      body: Column(
        children: [
          // Category Filter Chips
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            child: Row(
              children: _categories.map((cat) {
                final isSelected = _selectedCategory == cat['id'];
                return Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: FilterChip(
                    label: Text(cat['label']!),
                    selected: isSelected,
                    onSelected: (val) {
                      if (val) {
                        setState(() => _selectedCategory = cat['id']!);
                        _fetchListings();
                      }
                    },
                    selectedColor: scheme.primaryContainer,
                    checkmarkColor: scheme.onPrimaryContainer,
                  ),
                );
              }).toList(),
            ),
          ),

          Expanded(
            child: _isLoading
                ? const Center(child: CircularProgressIndicator())
                : _listings.isEmpty
                    ? Center(
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(Icons.work_outline, size: 48, color: scheme.outline),
                            const SizedBox(height: 12),
                            const Text('No active service ads or job listings found.'),
                            const SizedBox(height: 4),
                            const Text(
                              'All listings automatically expire after their interview date.',
                              style: TextStyle(fontSize: 12, color: Colors.grey),
                            ),
                          ],
                        ),
                      )
                    : RefreshIndicator(
                        onRefresh: _fetchListings,
                        child: ListView.builder(
                          padding: const EdgeInsets.all(16),
                          itemCount: _listings.length,
                          itemBuilder: (context, index) {
                            final item = _listings[index];
                            final interviewDate = item['interview_date'] != null
                                ? DateTime.parse(item['interview_date']).toLocal()
                                : null;
                            final formattedDate = interviewDate != null
                                ? '${interviewDate.year}-${interviewDate.month.toString().padLeft(2, '0')}-${interviewDate.day.toString().padLeft(2, '0')}'
                                : 'N/A';

                            return Card(
                              elevation: 2,
                              margin: const EdgeInsets.only(bottom: 12),
                              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                              child: Padding(
                                padding: const EdgeInsets.all(14),
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Row(
                                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                      children: [
                                        Container(
                                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                                          decoration: BoxDecoration(
                                            color: scheme.primary.withOpacity(0.1),
                                            borderRadius: BorderRadius.circular(6),
                                          ),
                                          child: Text(
                                            (item['category'] as String).replaceAll('_', ' ').toUpperCase(),
                                            style: TextStyle(
                                              fontSize: 10,
                                              fontWeight: FontWeight.bold,
                                              color: scheme.primary,
                                            ),
                                          ),
                                        ),
                                        Container(
                                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                                          decoration: BoxDecoration(
                                            color: Colors.amber.withOpacity(0.15),
                                            borderRadius: BorderRadius.circular(6),
                                            border: Border.all(color: Colors.amber.withOpacity(0.4)),
                                          ),
                                          child: Row(
                                            children: [
                                              const Icon(Icons.event, size: 12, color: Colors.amber),
                                              const SizedBox(width: 4),
                                              Text(
                                                'Interview: $formattedDate',
                                                style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: Colors.amber),
                                              ),
                                            ],
                                          ),
                                        ),
                                      ],
                                    ),
                                    const SizedBox(height: 10),
                                    Row(
                                      children: [
                                        Expanded(
                                          child: Text(
                                            item['title'] as String? ?? 'Untitled Listing',
                                            style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                                          ),
                                        ),
                                        if (item['user_id'] == currentUserId)
                                          PopupMenuButton<String>(
                                            tooltip: 'Your listing actions',
                                            onSelected: (action) {
                                              if (action == 'delete') {
                                                _deleteOwnListing(item);
                                              }
                                            },
                                            itemBuilder: (_) => const [
                                              PopupMenuItem(
                                                value: 'delete',
                                                child: ListTile(
                                                  dense: true,
                                                  leading: Icon(Icons.delete_outline, color: Colors.redAccent),
                                                  title: Text('Delete my listing'),
                                                ),
                                              ),
                                            ],
                                          ),
                                      ],
                                    ),
                                    const SizedBox(height: 6),
                                    Text(
                                      item['description'] as String? ?? '',
                                      maxLines: 3,
                                      overflow: TextOverflow.ellipsis,
                                      style: TextStyle(fontSize: 13, color: scheme.onSurfaceVariant),
                                    ),
                                    const SizedBox(height: 12),
                                    Row(
                                      children: [
                                        if (item['pay_rate'] != null) ...[
                                          Icon(Icons.payments, size: 14, color: scheme.primary),
                                          const SizedBox(width: 4),
                                          Text(
                                            item['pay_rate'] as String,
                                            style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold),
                                          ),
                                          const SizedBox(width: 16),
                                        ],
                                        if (item['location'] != null) ...[
                                          Icon(Icons.location_on, size: 14, color: scheme.secondary),
                                          const SizedBox(width: 4),
                                          Expanded(
                                            child: Text(
                                              item['location'] as String,
                                              maxLines: 1,
                                              overflow: TextOverflow.ellipsis,
                                              style: const TextStyle(fontSize: 12),
                                            ),
                                          ),
                                        ],
                                      ],
                                    ),
                                  ],
                                ),
                              ),
                            );
                          },
                        ),
                      ),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        icon: const Icon(Icons.add),
        label: const Text('Post Service / Job'),
        onPressed: () {
          context.push('/services/add').then((_) => _fetchListings());
        },
      ),
    );
  }
}
