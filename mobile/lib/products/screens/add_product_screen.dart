import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../../core/services/supabase_service.dart';
import '../widgets/product_image_picker.dart';
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
  final _stockController = TextEditingController(text: '10');

  String? _selectedCategoryId;
  List<Map<String, dynamic>> _categories = [];
  final List<String> _imageUrls = [];
  bool _isLoading = false;

  @override
  void initState() {
    super.initState();
    _fetchCategories();
  }

  Future<void> _fetchCategories() async {
    try {
      final res = await SupabaseService.client
          .from('categories')
          .select('id, name')
          .eq('is_active', true)
          .order('display_order');
      if (mounted) {
        setState(() {
          _categories = List<Map<String, dynamic>>.from(res as List);
          if (_categories.isNotEmpty) {
            _selectedCategoryId = _categories[0]['id'] as String;
          }
        });
      }
    } catch (_) {}
  }

  @override
  void dispose() {
    _titleController.dispose();
    _descController.dispose();
    _priceController.dispose();
    _stockController.dispose();
    super.dispose();
  }

  Future<void> _saveProduct() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() => _isLoading = true);

    try {
      final user = Supabase.instance.client.auth.currentUser;
      if (user == null) throw Exception('Must be logged in to create product');

      // Get or assign user's store
      var store = await SupabaseService.client
          .from('stores')
          .select('id')
          .eq('owner_id', user.id)
          .maybeSingle();

      String storeId;
      if (store != null) {
        storeId = store['id'] as String;
      } else {
        // Find first active store as fallback
        final firstStore = await SupabaseService.client.from('stores').select('id').limit(1).single();
        storeId = firstStore['id'] as String;
      }

      final title = _titleController.text.trim();
      final slug = title.toLowerCase().replaceAll(RegExp(r'[^a-z0-9]+'), '-') + '-${DateTime.now().millisecondsSinceEpoch % 10000}';
      final price = double.parse(_priceController.text.trim());
      final stock = int.tryParse(_stockController.text.trim()) ?? 10;

      // Insert product
      final productRes = await SupabaseService.client
          .from('products')
          .insert({
            'store_id': storeId,
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

      // Insert inventory
      await SupabaseService.client.from('inventory').insert({
        'product_id': productId,
        'quantity': stock,
        'reserved_quantity': 0,
      });

      // Insert images if attached
      if (_imageUrls.isNotEmpty) {
        for (int i = 0; i < _imageUrls.length; i++) {
          await SupabaseService.client.from('product_images').insert({
            'product_id': productId,
            'url': _imageUrls[i],
            'display_order': i + 1,
            'file_size_bytes': 75000,
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

    return Scaffold(
      appBar: AppBar(
        title: const Text('Add New Product'),
      ),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            TextFormField(
              controller: _titleController,
              decoration: const InputDecoration(labelText: 'Product Title', border: OutlineInputBorder()),
              validator: (v) => v == null || v.trim().isEmpty ? 'Required' : null,
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
                    decoration: const InputDecoration(labelText: 'Price (ZMW)', border: OutlineInputBorder()),
                    keyboardType: const TextInputType.numberWithOptions(decimal: true),
                    validator: (v) {
                      if (v == null || v.trim().isEmpty) return 'Required';
                      if (double.tryParse(v) == null) return 'Invalid number';
                      return null;
                    },
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: TextFormField(
                    controller: _stockController,
                    decoration: const InputDecoration(labelText: 'Initial Stock', border: OutlineInputBorder()),
                    keyboardType: TextInputType.number,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 14),

            TextFormField(
              controller: _descController,
              decoration: const InputDecoration(labelText: 'Product Description', border: OutlineInputBorder()),
              maxLines: 3,
            ),
            const SizedBox(height: 20),

            ProductImagePicker(
              productId: 'new-prod',
              storeId: 'my-store',
              currentImageCount: _imageUrls.length,
              maxImages: 5,
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
                        ClipRRect(
                          borderRadius: BorderRadius.circular(8),
                          child: Container(
                            width: 90,
                            height: 90,
                            color: Colors.black12,
                            child: Image.network(
                              url,
                              fit: BoxFit.cover,
                              errorBuilder: (_, __, ___) => const Center(
                                child: Icon(Icons.broken_image, size: 28, color: Colors.grey),
                              ),
                            ),
                          ),
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
              Text('${_imageUrls.length} cloud image(s) attached', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 12, color: Color(0xFF10B981))),
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
