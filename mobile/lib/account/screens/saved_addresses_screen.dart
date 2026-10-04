import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../../auth/providers/auth_provider.dart';
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

  AddressItem({
    required this.id,
    required this.label,
    required this.street,
    required this.area,
    required this.city,
    required this.province,
    required this.phone,
    this.isDefault = false,
  });

  Map<String, dynamic> toJson() => {
        'id': id,
        'label': label,
        'street': street,
        'area': area,
        'city': city,
        'province': province,
        'phone': phone,
        'isDefault': isDefault,
      };

  factory AddressItem.fromJson(Map<String, dynamic> json) => AddressItem(
        id: json['id'] as String? ?? UniqueKey().toString(),
        label: json['label'] as String? ?? 'Home',
        street: json['street'] as String? ?? '',
        area: json['area'] as String? ?? '',
        city: json['city'] as String? ?? 'Lusaka',
        province: json['province'] as String? ?? 'Lusaka',
        phone: json['phone'] as String? ?? '',
        isDefault: json['isDefault'] as bool? ?? false,
      );
}

class SavedAddressesScreen extends ConsumerStatefulWidget {
  const SavedAddressesScreen({super.key});

  @override
  ConsumerState<SavedAddressesScreen> createState() => _SavedAddressesScreenState();
}

class _SavedAddressesScreenState extends ConsumerState<SavedAddressesScreen> {
  List<AddressItem> _addresses = [];
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _loadAddresses();
  }

  Future<void> _loadAddresses() async {
    setState(() => _isLoading = true);
    final user = Supabase.instance.client.auth.currentUser;
    if (user == null) {
      setState(() => _isLoading = false);
      return;
    }

    try {
      final profile = await SupabaseService.client
          .from('profiles')
          .select('city, area, province, phone, full_name, bio')
          .eq('id', user.id)
          .maybeSingle();

      if (profile != null) {
        final rawBio = profile['bio'] as String?;
        List<AddressItem> list = [];

        // Check if extended address list JSON is stored in bio / metadata
        if (rawBio != null && rawBio.startsWith('{') && rawBio.contains('"saved_addresses"')) {
          try {
            final parsed = jsonDecode(rawBio) as Map<String, dynamic>;
            final rawList = parsed['saved_addresses'] as List?;
            if (rawList != null) {
              list = rawList.map((e) => AddressItem.fromJson(e as Map<String, dynamic>)).toList();
            }
          } catch (_) {}
        }

        // If no extended addresses exist yet, populate primary from profile columns
        if (list.isEmpty) {
          final city = profile['city'] as String? ?? 'Lusaka';
          final area = profile['area'] as String? ?? 'Woodlands';
          final prov = profile['province'] as String? ?? 'Lusaka';
          final phone = profile['phone'] as String? ?? '';

          list.add(AddressItem(
            id: 'default-primary',
            label: 'Home',
            street: 'Plot 124, Main Road',
            area: area,
            city: city,
            province: prov,
            phone: phone,
            isDefault: true,
          ));
        }

        _addresses = list;
      }
    } catch (_) {} finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _saveAddressesToDatabase() async {
    final user = Supabase.instance.client.auth.currentUser;
    if (user == null) return;

    final primary = _addresses.firstWhere((a) => a.isDefault, orElse: () => _addresses.first);

    try {
      final dataMap = {
        'saved_addresses': _addresses.map((a) => a.toJson()).toList(),
      };

      await SupabaseService.client.from('profiles').update({
        'city': primary.city,
        'area': primary.area,
        'province': primary.province,
        'phone': primary.phone.isNotEmpty ? primary.phone : null,
        'bio': jsonEncode(dataMap),
      }).eq('id', user.id);

      ref.invalidate(profileProvider);
    } catch (_) {}
  }

  void _showAddEditAddressModal([AddressItem? existing]) {
    final isEditing = existing != null;
    final labelController = TextEditingController(text: existing?.label ?? 'Home');
    final streetController = TextEditingController(text: existing?.street ?? '');
    final areaController = TextEditingController(text: existing?.area ?? 'Woodlands');
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
                      hintText: 'e.g. Plot 42, Great East Road',
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
                      hintText: '+260 97...',
                      border: OutlineInputBorder(),
                      prefixIcon: Icon(Icons.phone_outlined),
                    ),
                  ),
                  const SizedBox(height: 8),

                  SwitchListTile(
                    contentPadding: EdgeInsets.zero,
                    title: const Text('Set as default delivery address', style: TextStyle(fontSize: 13)),
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

                        if (area.isEmpty || city.isEmpty) {
                          ScaffoldMessenger.of(context).showSnackBar(
                            const SnackBar(content: Text('Please provide Area and City')),
                          );
                          return;
                        }

                        setState(() {
                          if (isDef) {
                            for (var a in _addresses) {
                              a = AddressItem(
                                id: a.id,
                                label: a.label,
                                street: a.street,
                                area: a.area,
                                city: a.city,
                                province: a.province,
                                phone: a.phone,
                                isDefault: false,
                              );
                            }
                            _addresses = _addresses.map((a) => AddressItem(
                                  id: a.id,
                                  label: a.label,
                                  street: a.street,
                                  area: a.area,
                                  city: a.city,
                                  province: a.province,
                                  phone: a.phone,
                                  isDefault: false,
                                )).toList();
                          }

                          if (isEditing) {
                            final idx = _addresses.indexWhere((a) => a.id == existing.id);
                            if (idx != -1) {
                              _addresses[idx] = AddressItem(
                                id: existing.id,
                                label: selectedType,
                                street: street,
                                area: area,
                                city: city,
                                province: prov,
                                phone: phone,
                                isDefault: isDef,
                              );
                            }
                          } else {
                            _addresses.add(AddressItem(
                              id: UniqueKey().toString(),
                              label: selectedType,
                              street: street,
                              area: area,
                              city: city,
                              province: prov,
                              phone: phone,
                              isDefault: isDef,
                            ));
                          }
                        });

                        _saveAddressesToDatabase();
                        Navigator.pop(ctx);
                        ScaffoldMessenger.of(context).showSnackBar(
                          SnackBar(
                            content: Text(isEditing ? 'Address updated' : 'New address saved!'),
                            backgroundColor: const Color(0xFF10B981),
                          ),
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

  void _setDefault(AddressItem item) {
    setState(() {
      _addresses = _addresses.map((a) => AddressItem(
            id: a.id,
            label: a.label,
            street: a.street,
            area: a.area,
            city: a.city,
            province: a.province,
            phone: a.phone,
            isDefault: a.id == item.id,
          )).toList();
    });
    _saveAddressesToDatabase();
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text('${item.label} set as primary delivery address')),
    );
  }

  void _deleteAddress(AddressItem item) {
    if (_addresses.length <= 1) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('You must keep at least one saved address')),
      );
      return;
    }

    setState(() {
      _addresses.removeWhere((a) => a.id == item.id);
      if (item.isDefault && _addresses.isNotEmpty) {
        final first = _addresses.first;
        _addresses[0] = AddressItem(
          id: first.id,
          label: first.label,
          street: first.street,
          area: first.area,
          city: first.city,
          province: first.province,
          phone: first.phone,
          isDefault: true,
        );
      }
    });
    _saveAddressesToDatabase();
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Address deleted')),
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
          : _addresses.isEmpty
              ? Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(Icons.location_off_outlined, size: 64, color: scheme.outline),
                      const SizedBox(height: 16),
                      Text('No saved addresses', style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold)),
                      const SizedBox(height: 8),
                      const Text('Add your delivery address for instant checkout', style: TextStyle(color: Colors.grey)),
                      const SizedBox(height: 20),
                      FilledButton.icon(
                        icon: const Icon(Icons.add),
                        label: const Text('Add Address'),
                        onPressed: () => _showAddEditAddressModal(),
                      ),
                    ],
                  ),
                )
              : ListView.separated(
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
    );
  }
}
