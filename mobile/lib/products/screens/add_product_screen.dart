import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../../core/services/supabase_service.dart';
import '../../core/services/media_link_interceptor.dart';
import '../widgets/product_image_picker.dart';
import '../../core/widgets/app_network_image.dart';
import 'manage_products_screen.dart';

class AddProductScreen extends ConsumerStatefulWidget {
  const AddProductScreen({super.key});

  @override
  ConsumerState<AddProductScreen> createState() => _AddProductScreenState();
}

class _AddProductScreenState extends ConsumerState<AddProductScreen> {
  final _formKey = GlobalKey<FormState>();
  final _titleController = TextEditingController();
  final _descController = TextEditingController();
  final _priceController = TextEditingController();
  final _stockController = TextEditingController();

  String? _selectedCategoryId;
  List<Map<String, dynamic>> _categories = [];
  final List<String> _imageUrls = [];
  bool _isLoading = false;
  bool _isCheckingStore = true;
  String? _userStoreId;
  String? _userStoreName;
  int _maxImages = 5;

  @override
  void initState() {
    super.initState();
    _checkStoreAndFetchCategories();
  }

  Future<void> _checkStoreAndFetchCategories() async {
    final user = Supabase.instance.client.auth.currentUser;
    if (user == null) {
      if (mounted) setState(() => _isCheckingStore = false);
      return;
    }

    try {
      // 1. Check user store
      final store = await SupabaseService.client
          .from('stores')
          .select('id, name')
          .eq('owner_id', user.id)
          .maybeSingle();

      if (store != null) {
        _userStoreId = store['id'] as String;
        _userStoreName = store['name'] as String;

        // Fetch subscription limits if active
        final sub = await SupabaseService.client
            .from('subscriptions')
            .select('plan:subscription_plans(max_images_per_product)')
            .eq('store_id', _userStoreId!)
            .eq('status', 'active')
            .maybeSingle();

        if (sub != null && sub['plan'] != null) {
          final plan = sub['plan'] as Map<String, dynamic>;
          _maxImages = (plan['max_images_per_product'] as int?) ?? 5;
        }
      }

      // 2. Fetch categories
      final catRes = await SupabaseService.client
          .from('categories')
          .select('id, name')
          .eq('is_active', true)
          .order('display_order');

      if (mounted) {
        setState(() {
          _categories = List<Map<String, dynamic>>.from(catRes as List);
          if (_categories.isNotEmpty) {
            _selectedCategoryId = _categories[0]['id'] as String;
          }
          _isCheckingStore = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _isCheckingStore = false);
    }
  }

  @override
  void dispose() {
    _titleController.dispose();
    _descController.dispose();
    _priceController.dispose();
    _stockController.dispose();
    super.dispose();
  }

  Future<void> _createStoreQuickOnboard() async {
    final user = Supabase.instance.client.auth.currentUser;
    if (user == null) return;

    final nameController = TextEditingController();
    final slugController = TextEditingController();

    final result = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Start Selling on Pamtechz'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Set up your store profile in seconds. All new sellers get an automatic Free subscription and wallet.',
              style: TextStyle(fontSize: 12, color: Colors.grey),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: nameController,
              decoration: const InputDecoration(
                labelText: 'Store Name',
                hintText: 'e.g. Lusaka Tech Hub',
                border: OutlineInputBorder(),
              ),
              onChanged: (val) {
                slugController.text = val.trim().toLowerCase().replaceAll(RegExp(r'[^a-z0-9]+'), '-');
              },
            ),
            const SizedBox(height: 12),
            TextField(
              controller: slugController,
              decoration: const InputDecoration(
                labelText: 'Store URL Slug',
                hintText: 'e.g. lusaka-tech-hub',
                border: OutlineInputBorder(),
              ),
            ),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          FilledButton(
            onPressed: () {
              if (nameController.text.trim().isNotEmpty) {
                Navigator.pop(ctx, true);
              }
            },
            child: const Text('Create Store'),
          ),
        ],
      ),
    );

    if (result == true && nameController.text.trim().isNotEmpty) {
      setState(() => _isLoading = true);
      try {
        final storeName = nameController.text.trim();
        var slug = slugController.text.trim();
        if (slug.isEmpty) {
          slug = storeName.toLowerCase().replaceAll(RegExp(r'[^a-z0-9]+'), '-');
        }

        // Call atomic server onboarding RPC
        final onboardRes = await SupabaseService.client.rpc('start_selling_onboard_store', params: {
          'p_store_name': storeName,
          'p_store_slug': '$slug-${DateTime.now().millisecondsSinceEpoch % 10000}',
          'p_description': 'Official marketplace seller store.',
        });

        final onboardMap = onboardRes as Map<String, dynamic>;
        _userStoreId = onboardMap['store_id'] as String?;
        _userStoreName = storeName;

        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text('Store "$storeName" onboarded with Free Subscription!'),
              backgroundColor: const Color(0xFF10B981),
            ),
          );
        }
      } catch (e) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Failed to onboard store: $e'), backgroundColor: Colors.redAccent),
          );
        }
      } finally {
        if (mounted) setState(() => _isLoading = false);
      }
    }
  }

  Future<void> _saveProduct() async {
    if (!_formKey.currentState!.validate()) return;

    if (_userStoreId == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please create your store first to publish products.')),
      );
      return;
    }

    setState(() => _isLoading = true);

    try {
      final user = Supabase.instance.client.auth.currentUser;
      if (user == null) throw Exception('Must be logged in to create product');

      final title = _titleController.text.trim();
      final slug = title.toLowerCase().replaceAll(RegExp(r'[^a-z0-9]+'), '-') + '-${DateTime.now().millisecondsSinceEpoch % 10000}';
      final price = double.parse(_priceController.text.trim());
      final stock = int.tryParse(_stockController.text.trim()) ?? 1;

      // 1. Insert product
      final productRes = await SupabaseService.client
          .from('products')
          .insert({
            'store_id': _userStoreId,
            'category_id': _selectedCategoryId,
            'title': title,
            'slug': slug,
            'description': _descController.text.trim(),
            'price': price,
            'status': 'active',
            'is_featured': false,
          })
          .select()
          .single();

      final productId = productRes['id'] as String;

      // 2. Insert canonical inventory record
      await SupabaseService.client.from('inventory').insert({
        'product_id': productId,
        'quantity': stock,
        'reserved_quantity': 0,
      });

      // 3. Attach image references (file_size_bytes is null for external user-owned cloud links)
      if (_imageUrls.isNotEmpty) {
        for (int i = 0; i < _imageUrls.length; i++) {
          final intercepted = await MediaLinkInterceptor.interceptAndRegister(_imageUrls[i]);
          await SupabaseService.client.from('product_images').insert({
            'product_id': productId,
            'url': intercepted.shortCode.isNotEmpty ? intercepted.shortCode : intercepted.directDisplayUrl,
            'display_order': i + 1,
            'file_size_bytes': 0,
          });
        }
      }

      ref.invalidate(sellerProductsProvider);

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Product published successfully!'),
            backgroundColor: Color(0xFF10B981),
          ),
        );
        Navigator.of(context).pop();
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to save product: $e'), backgroundColor: Colors.redAccent),
        );
      }
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;

    if (_isCheckingStore) {
      return Scaffold(
        appBar: AppBar(title: const Text('Add New Product')),
        body: const Center(child: CircularProgressIndicator()),
      );
    }

    if (_userStoreId == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Add New Product')),
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(24.0),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(Icons.storefront, size: 72, color: scheme.primary),
                const SizedBox(height: 16),
                Text('Create a Store First', style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold)),
                const SizedBox(height: 8),
                const Text(
                  'To publish products on Pamtechz, you need an active merchant store. Starting a store is free and takes less than 30 seconds.',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: Colors.grey),
                ),
                const SizedBox(height: 24),
                FilledButton.icon(
                  onPressed: _isLoading ? null : _createStoreQuickOnboard,
                  icon: const Icon(Icons.add_business),
                  label: const Text('Start Selling / Open Store'),
                ),
              ],
            ),
          ),
        ),
      );
    }

    return Scaffold(
      appBar: AppBar(
        title: Text('Add Product (${_userStoreName ?? "My Store"})'),
      ),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            TextFormField(
              controller: _titleController,
              decoration: const InputDecoration(
                labelText: 'Product Title',
                hintText: 'e.g. Wireless Noise-Cancelling Headphones',
                border: OutlineInputBorder(),
              ),
              validator: (v) => v == null || v.trim().isEmpty ? 'Product title is required' : null,
            ),
            const SizedBox(height: 14),

            if (_categories.isNotEmpty)
              DropdownButtonFormField<String>(
                value: _selectedCategoryId,
                decoration: const InputDecoration(labelText: 'Category', border: OutlineInputBorder()),
                items: _categories.map((c) {
                  return DropdownMenuItem<String>(
                    value: c['id'] as String,
                    child: Text(c['name'] as String),
                  );
                }).toList(),
                onChanged: (val) => setState(() => _selectedCategoryId = val),
              ),
            const SizedBox(height: 14),

            Row(
              children: [
                Expanded(
                  child: TextFormField(
                    controller: _priceController,
                    decoration: const InputDecoration(
                      labelText: 'Price (ZMW)',
                      hintText: 'e.g. 450.00',
                      border: OutlineInputBorder(),
                    ),
                    keyboardType: const TextInputType.numberWithOptions(decimal: true),
                    validator: (v) {
                      if (v == null || v.trim().isEmpty) return 'Price is required';
                      final parsed = double.tryParse(v);
                      if (parsed == null || parsed <= 0) return 'Enter a valid price';
                      return null;
                    },
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: TextFormField(
                    controller: _stockController,
                    decoration: const InputDecoration(
                      labelText: 'Available Stock',
                      hintText: 'e.g. 5',
                      border: OutlineInputBorder(),
                    ),
                    keyboardType: TextInputType.number,
                    validator: (v) {
                      if (v == null || v.trim().isEmpty) return 'Stock is required';
                      final parsed = int.tryParse(v);
                      if (parsed == null || parsed < 0) return 'Invalid stock';
                      return null;
                    },
                  ),
                ),
              ],
            ),
            const SizedBox(height: 14),

            TextFormField(
              controller: _descController,
              decoration: const InputDecoration(
                labelText: 'Product Description',
                hintText: 'Describe key specifications, features, and condition...',
                border: OutlineInputBorder(),
              ),
              maxLines: 3,
            ),
            const SizedBox(height: 20),

            ProductImagePicker(
              productId: '',
              storeId: _userStoreId!,
              currentImageCount: _imageUrls.length,
              maxImages: _maxImages,
              onImageAttached: (result) {
                setState(() {
                  _imageUrls.add(result.displayUrl);
                });
              },
            ),
            if (_imageUrls.isNotEmpty) ...[
              const SizedBox(height: 12),
              SizedBox(
                height: 90,
                child: ListView.separated(
                  scrollDirection: Axis.horizontal,
                  itemCount: _imageUrls.length,
                  separatorBuilder: (_, __) => const SizedBox(width: 8),
                  itemBuilder: (ctx, idx) {
                    final url = _imageUrls[idx];
                    return Stack(
                      children: [
                        AppNetworkImage(
                          imageUrlOrCode: url,
                          width: 90,
                          height: 90,
                          borderRadius: BorderRadius.circular(8),
                          fit: BoxFit.cover,
                        ),
                        Positioned(
                          top: 4,
                          right: 4,
                          child: InkWell(
                            onTap: () {
                              setState(() {
                                _imageUrls.removeAt(idx);
                              });
                            },
                            child: Container(
                              padding: const EdgeInsets.all(3),
                              decoration: const BoxDecoration(
                                color: Colors.black87,
                                shape: BoxShape.circle,
                              ),
                              child: const Icon(Icons.close, size: 14, color: Colors.white),
                            ),
                          ),
                        ),
                      ],
                    );
                  },
                ),
              ),
              const SizedBox(height: 6),
              Text(
                '${_imageUrls.length} image(s) attached',
                style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 12, color: Color(0xFF10B981)),
              ),
            ],
            const SizedBox(height: 28),

            SizedBox(
              height: 48,
              child: ElevatedButton(
                style: ElevatedButton.styleFrom(
                  backgroundColor: theme.colorScheme.primary,
                  foregroundColor: theme.colorScheme.onPrimary,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                ),
                onPressed: _isLoading ? null : _saveProduct,
                child: _isLoading
                    ? const CircularProgressIndicator(color: Colors.white)
                    : const Text('Save & Publish Product', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
