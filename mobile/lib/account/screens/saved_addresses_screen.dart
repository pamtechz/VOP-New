import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../../core/services/supabase_service.dart';

class AddressItem {
  final String id;
  final String label; // 'Home', 'Work', 'Other'
  final String street;
  final String area;
  final String city;
  final String province;
  final String phone;
  final bool isDefault;

  const AddressItem({
    required this.id,
    required this.label,
    required this.street,
    required this.area,
    required this.city,
    required this.province,
    required this.phone,
    this.isDefault = false,
  });

  factory AddressItem.fromMap(Map<String, dynamic> map) {
    return AddressItem(
      id: map['id'] as String,
      label: map['label'] as String? ?? 'Home',
      street: map['street'] as String? ?? '',
      area: map['area'] as String? ?? '',
      city: map['city'] as String? ?? 'Lusaka',
      province: map['province'] as String? ?? 'Lusaka',
      phone: map['phone'] as String? ?? '',
      isDefault: map['is_default'] as bool? ?? false,
    );
  }
}

class SavedAddressesScreen extends ConsumerStatefulWidget {
  const SavedAddressesScreen({super.key});

  @override
  ConsumerState<SavedAddressesScreen> createState() => _SavedAddressesScreenState();
}

class _SavedAddressesScreenState extends ConsumerState<SavedAddressesScreen> {
  List<AddressItem> _addresses = [];
  bool _isLoading = true;
  String? _errorMessage;

  @override
  void initState() {
    super.initState();
    _loadAddresses();
  }

  Future<void> _loadAddresses() async {
    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    final user = Supabase.instance.client.auth.currentUser;
    if (user == null) {
      setState(() {
        _isLoading = false;
        _errorMessage = 'Please sign in to view saved addresses';
      });
      return;
    }

    try {
      final res = await SupabaseService.client
          .from('addresses')
          .select('*')
          .eq('user_id', user.id)
          .order('is_default', ascending: false)
          .order('created_at', ascending: false);

      final list = (res as List).map((row) => AddressItem.fromMap(row as Map<String, dynamic>)).toList();

      if (mounted) {
        setState(() {
          _addresses = list;
          _isLoading = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _errorMessage = 'Failed to load addresses: $e';
          _isLoading = false;
        });
      }
    }
  }

  Future<void> _saveAddress({
    String? id,
    required String label,
    required String street,
    required String area,
    required String city,
    required String province,
    required String phone,
    required bool isDefault,
  }) async {
    final user = Supabase.instance.client.auth.currentUser;
    if (user == null) return;

    try {
      // If marking as default, reset other addresses first
      if (isDefault) {
        await SupabaseService.client
            .from('addresses')
            .update({'is_default': false})
            .eq('user_id', user.id);
      }

      if (id != null) {
        // Update existing address
        await SupabaseService.client.from('addresses').update({
          'label': label,
          'street': street,
          'area': area,
          'city': city,
          'province': province,
          'phone': phone,
          'is_default': isDefault,
          'updated_at': DateTime.now().toIso8601String(),
        }).eq('id', id).eq('user_id', user.id);
      } else {
        // Insert new address
        await SupabaseService.client.from('addresses').insert({
          'user_id': user.id,
          'label': label,
          'street': street,
          'area': area,
          'city': city,
          'province': province,
          'phone': phone,
          'is_default': isDefault || _addresses.isEmpty,
        });
      }

      await _loadAddresses();

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(id != null ? 'Address updated successfully' : 'Address saved successfully'),
            backgroundColor: const Color(0xFF10B981),
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to save address: $e'), backgroundColor: Colors.redAccent),
        );
      }
    }
  }

  Future<void> _setDefault(AddressItem item) async {
    final user = Supabase.instance.client.auth.currentUser;
    if (user == null) return;

    try {
      await SupabaseService.client
          .from('addresses')
          .update({'is_default': false})
          .eq('user_id', user.id);

      await SupabaseService.client
          .from('addresses')
          .update({'is_default': true, 'updated_at': DateTime.now().toIso8601String()})
          .eq('id', item.id)
          .eq('user_id', user.id);

      await _loadAddresses();

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('${item.label} set as primary delivery address')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to update primary address: $e'), backgroundColor: Colors.redAccent),
        );
      }
    }
  }

  Future<void> _deleteAddress(AddressItem item) async {
    final user = Supabase.instance.client.auth.currentUser;
    if (user == null) return;

    try {
      await SupabaseService.client
          .from('addresses')
          .delete()
          .eq('id', item.id)
          .eq('user_id', user.id);

      await _loadAddresses();

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Address deleted')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to delete address: $e'), backgroundColor: Colors.redAccent),
        );
      }
    }
  }

  void _showAddEditAddressModal([AddressItem? existing]) {
    final isEditing = existing != null;
    final labelController = TextEditingController(text: existing?.label ?? 'Home');
    final streetController = TextEditingController(text: existing?.street ?? '');
    final areaController = TextEditingController(text: existing?.area ?? '');
    final cityController = TextEditingController(text: existing?.city ?? 'Lusaka');
    final provinceController = TextEditingController(text: existing?.province ?? 'Lusaka');
    final phoneController = TextEditingController(text: existing?.phone ?? '');
    bool isDef = existing?.isDefault ?? (_addresses.isEmpty);

    String selectedType = existing?.label ?? 'Home';

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Theme.of(context).colorScheme.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (ctx) => StatefulBuilder(
        builder: (context, setModalState) {
          final scheme = Theme.of(context).colorScheme;

          return Padding(
            padding: EdgeInsets.only(
              left: 20,
              right: 20,
              top: 20,
              bottom: MediaQuery.of(context).viewInsets.bottom + 20,
            ),
            child: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Center(
                    child: Container(
                      width: 40,
                      height: 4,
                      decoration: BoxDecoration(
                        color: scheme.outlineVariant,
                        borderRadius: BorderRadius.circular(4),
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        isEditing ? 'Edit Delivery Address' : 'Add New Address',
                        style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                      ),
                      IconButton(
                        icon: const Icon(Icons.close),
                        onPressed: () => Navigator.pop(ctx),
                      ),
                    ],
                  ),
                  const SizedBox(height: 14),

                  // Label selection
                  const Text('Address Type', style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: Colors.grey)),
                  const SizedBox(height: 8),
                  Row(
                    children: ['Home', 'Work', 'Other'].map((type) {
                      final selected = selectedType == type;
                      return Padding(
                        padding: const EdgeInsets.only(right: 8),
                        child: ChoiceChip(
                          avatar: Icon(
                            type == 'Home'
                                ? Icons.home_outlined
                                : type == 'Work'
                                    ? Icons.work_outline
                                    : Icons.location_on_outlined,
                            size: 16,
                          ),
                          label: Text(type),
                          selected: selected,
                          onSelected: (val) {
                            if (val) {
                              setModalState(() {
                                selectedType = type;
                                labelController.text = type;
                              });
                            }
                          },
                        ),
                      );
                    }).toList(),
                  ),
                  const SizedBox(height: 14),

                  TextField(
                    controller: streetController,
                    decoration: const InputDecoration(
                      labelText: 'Street Address / House No.',
                      hintText: 'e.g. Plot 42, Independence Avenue',
                      border: OutlineInputBorder(),
                      prefixIcon: Icon(Icons.pin_drop_outlined),
                    ),
                  ),
                  const SizedBox(height: 12),

                  TextField(
                    controller: areaController,
                    decoration: const InputDecoration(
                      labelText: 'Area / Neighborhood',
                      hintText: 'e.g. Woodlands, Kabulonga, Northmead',
                      border: OutlineInputBorder(),
                      prefixIcon: Icon(Icons.map_outlined),
                    ),
                  ),
                  const SizedBox(height: 12),

                  Row(
                    children: [
                      Expanded(
                        child: TextField(
                          controller: cityController,
                          decoration: const InputDecoration(
                            labelText: 'City / Town',
                            hintText: 'e.g. Lusaka',
                            border: OutlineInputBorder(),
                          ),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: TextField(
                          controller: provinceController,
                          decoration: const InputDecoration(
                            labelText: 'Province',
                            hintText: 'e.g. Lusaka',
                            border: OutlineInputBorder(),
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),

                  TextField(
                    controller: phoneController,
                    keyboardType: TextInputType.phone,
                    decoration: const InputDecoration(
                      labelText: 'Contact Phone Number',
                      hintText: 'e.g. +260 971 234567',
                      border: OutlineInputBorder(),
                      prefixIcon: Icon(Icons.phone_outlined),
                    ),
                  ),
                  const SizedBox(height: 8),

                  SwitchListTile(
                    contentPadding: EdgeInsets.zero,
                    title: const Text('Set as primary delivery address', style: TextStyle(fontSize: 13)),
                    value: isDef,
                    onChanged: (val) => setModalState(() => isDef = val),
                  ),
                  const SizedBox(height: 16),

                  SizedBox(
                    width: double.infinity,
                    height: 48,
                    child: FilledButton(
                      onPressed: () {
                        final street = streetController.text.trim();
                        final area = areaController.text.trim();
                        final city = cityController.text.trim();
                        final prov = provinceController.text.trim();
                        final phone = phoneController.text.trim();

                        if (street.isEmpty || area.isEmpty || city.isEmpty) {
                          ScaffoldMessenger.of(context).showSnackBar(
                            const SnackBar(content: Text('Please provide Street, Area, and City')),
                          );
                          return;
                        }

                        Navigator.pop(ctx);
                        _saveAddress(
                          id: existing?.id,
                          label: selectedType,
                          street: street,
                          area: area,
                          city: city,
                          province: prov.isNotEmpty ? prov : 'Lusaka',
                          phone: phone,
                          isDefault: isDef,
                        );
                      },
                      child: Text(isEditing ? 'Update Address' : 'Save Address'),
                    ),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Saved Addresses'),
        actions: [
          IconButton(
            icon: const Icon(Icons.add_location_alt_outlined),
            tooltip: 'Add Address',
            onPressed: () => _showAddEditAddressModal(),
          ),
        ],
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : _errorMessage != null
              ? Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(Icons.error_outline, size: 48, color: scheme.error),
                      const SizedBox(height: 12),
                      Text(_errorMessage!, textAlign: TextAlign.center),
                      const SizedBox(height: 16),
                      FilledButton(onPressed: _loadAddresses, child: const Text('Retry')),
                    ],
                  ),
                )
              : _addresses.isEmpty
                  ? Center(
                      child: Padding(
                        padding: const EdgeInsets.all(24.0),
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(Icons.location_off_outlined, size: 64, color: scheme.outline),
                            const SizedBox(height: 16),
                            Text('No saved addresses', style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold)),
                            const SizedBox(height: 8),
                            const Text('Add your delivery address for fast and reliable checkout.', textAlign: TextAlign.center, style: TextStyle(color: Colors.grey)),
                            const SizedBox(height: 20),
                            FilledButton.icon(
                              icon: const Icon(Icons.add),
                              label: const Text('Add Address'),
                              onPressed: () => _showAddEditAddressModal(),
                            ),
                          ],
                        ),
                      ),
                    )
                  : RefreshIndicator(
                      onRefresh: _loadAddresses,
                      child: ListView.separated(
                        padding: const EdgeInsets.all(16),
                        itemCount: _addresses.length + 1,
                        separatorBuilder: (_, __) => const SizedBox(height: 12),
                        itemBuilder: (ctx, i) {
                          if (i == _addresses.length) {
                            return OutlinedButton.icon(
                              style: OutlinedButton.styleFrom(
                                minimumSize: const Size.fromHeight(48),
                                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                              ),
                              icon: const Icon(Icons.add),
                              label: const Text('Add Another Address'),
                              onPressed: () => _showAddEditAddressModal(),
                            );
                          }

                          final addr = _addresses[i];
                          return Card(
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(16),
                              side: addr.isDefault
                                  ? BorderSide(color: scheme.primary, width: 1.5)
                                  : BorderSide(color: scheme.outlineVariant.withValues(alpha: 0.3)),
                            ),
                            child: Padding(
                              padding: const EdgeInsets.all(16),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Row(
                                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                    children: [
                                      Row(
                                        children: [
                                          Container(
                                            padding: const EdgeInsets.all(6),
                                            decoration: BoxDecoration(
                                              color: scheme.primary.withValues(alpha: 0.1),
                                              borderRadius: BorderRadius.circular(8),
                                            ),
                                            child: Icon(
                                              addr.label == 'Home'
                                                  ? Icons.home_rounded
                                                  : addr.label == 'Work'
                                                      ? Icons.work_rounded
                                                      : Icons.location_on_rounded,
                                              color: scheme.primary,
                                              size: 18,
                                            ),
                                          ),
                                          const SizedBox(width: 8),
                                          Text(
                                            addr.label,
                                            style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14),
                                          ),
                                          if (addr.isDefault) ...[
                                            const SizedBox(width: 8),
                                            Container(
                                              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                              decoration: BoxDecoration(
                                                color: scheme.primary,
                                                borderRadius: BorderRadius.circular(6),
                                              ),
                                              child: const Text(
                                                'PRIMARY',
                                                style: TextStyle(color: Colors.white, fontSize: 9, fontWeight: FontWeight.bold),
                                              ),
                                            ),
                                          ],
                                        ],
                                      ),
                                      PopupMenuButton<String>(
                                        onSelected: (val) {
                                          if (val == 'edit') {
                                            _showAddEditAddressModal(addr);
                                          } else if (val == 'default') {
                                            _setDefault(addr);
                                          } else if (val == 'delete') {
                                            _deleteAddress(addr);
                                          }
                                        },
                                        itemBuilder: (context) => [
                                          const PopupMenuItem(value: 'edit', child: Text('Edit')),
                                          if (!addr.isDefault)
                                            const PopupMenuItem(value: 'default', child: Text('Set as Primary')),
                                          const PopupMenuItem(value: 'delete', child: Text('Delete', style: TextStyle(color: Colors.red))),
                                        ],
                                      ),
                                    ],
                                  ),
                                  const Divider(height: 16),
                                  if (addr.street.isNotEmpty) ...[
                                    Text(addr.street, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500)),
                                    const SizedBox(height: 2),
                                  ],
                                  Text(
                                    '${addr.area}, ${addr.city}, ${addr.province} Province',
                                    style: TextStyle(color: scheme.onSurfaceVariant, fontSize: 13),
                                  ),
                                  if (addr.phone.isNotEmpty) ...[
                                    const SizedBox(height: 4),
                                    Text('Phone: ${addr.phone}', style: TextStyle(color: scheme.outline, fontSize: 12)),
                                  ],
                                ],
                              ),
                            ),
                          );
                        },
                      ),
                    ),
    );
  }
}
