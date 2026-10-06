import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class PostServiceAdScreen extends ConsumerStatefulWidget {
  const PostServiceAdScreen({super.key});

  @override
  ConsumerState<PostServiceAdScreen> createState() => _PostServiceAdScreenState();
}

class _PostServiceAdScreenState extends ConsumerState<PostServiceAdScreen> {
  final _formKey = GlobalKey<FormState>();
  
  String _category = 'cleaning';
  final _titleController = TextEditingController();
  final _descriptionController = TextEditingController();
  final _providerController = TextEditingController();
  final _phoneController = TextEditingController();
  final _emailController = TextEditingController();
  final _locationController = TextEditingController();
  final _payRateController = TextEditingController();
  
  DateTime _interviewDate = DateTime.now().add(const Duration(days: 7));
  bool _isSubmitting = false;

  final List<Map<String, String>> _categories = [
    {'id': 'cleaning', 'label': 'Cleaning Services'},
    {'id': 'maid_housekeeper', 'label': 'Maid / Housekeeper'},
    {'id': 'caretaker_keeper', 'label': 'Caretaker / Keeper'},
    {'id': 'general_job', 'label': 'General Job Opening'},
    {'id': 'maintenance', 'label': 'Maintenance & Repairs'},
  ];

  @override
  void dispose() {
    _titleController.dispose();
    _descriptionController.dispose();
    _providerController.dispose();
    _phoneController.dispose();
    _emailController.dispose();
    _locationController.dispose();
    _payRateController.dispose();
    super.dispose();
  }

  Future<void> _selectInterviewDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _interviewDate,
      firstDate: DateTime.now(),
      lastDate: DateTime.now().add(const Duration(days: 180)),
    );
    if (picked != null) {
      setState(() => _interviewDate = picked);
    }
  }

  Future<void> _submitAd() async {
    if (!_formKey.currentState!.validate()) return;

    final user = Supabase.instance.client.auth.currentUser;
    if (user == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please sign in to post a listing')),
      );
      return;
    }

    setState(() => _isSubmitting = true);

    try {
      final expiresAt = _interviewDate.add(const Duration(days: 1));

      await Supabase.instance.client.from('service_listings').insert({
        'user_id': user.id,
        'category': _category,
        'title': _titleController.text.trim(),
        'description': _descriptionController.text.trim(),
        'provider_name': _providerController.text.trim(),
        'contact_phone': _phoneController.text.trim(),
        'contact_email': _emailController.text.trim(),
        'location': _locationController.text.trim(),
        'pay_rate': _payRateController.text.trim(),
        'interview_date': _interviewDate.toIso8601String(),
        'expires_at': expiresAt.toIso8601String(),
        'is_active': true,
      });

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Service / Job listing published successfully!'),
            backgroundColor: Colors.green,
          ),
        );
        context.pop();
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to publish listing: $e'), backgroundColor: Colors.red),
        );
      }
    } finally {
      if (mounted) setState(() => _isSubmitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Post Service / Job Advertisement'),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Form(
          key: _formKey,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Category selection
              DropdownButtonFormField<String>(
                value: _category,
                decoration: const InputDecoration(
                  labelText: 'Category',
                  border: OutlineInputBorder(),
                ),
                items: _categories.map((c) {
                  return DropdownMenuItem(value: c['id'], child: Text(c['label']!));
                }).toList(),
                onChanged: (val) {
                  if (val != null) setState(() => _category = val);
                },
              ),
              const SizedBox(height: 16),

              // Title
              TextFormField(
                controller: _titleController,
                decoration: const InputDecoration(
                  labelText: 'Listing Title (e.g. Experienced Housekeeper Needed)',
                  border: OutlineInputBorder(),
                ),
                validator: (val) => val == null || val.trim().isEmpty ? 'Please enter a title' : null,
              ),
              const SizedBox(height: 16),

              // Description
              TextFormField(
                controller: _descriptionController,
                maxLines: 3,
                decoration: const InputDecoration(
                  labelText: 'Detailed Description & Requirements',
                  border: OutlineInputBorder(),
                ),
                validator: (val) => val == null || val.trim().isEmpty ? 'Please enter a description' : null,
              ),
              const SizedBox(height: 16),

              // Pay Rate & Location
              Row(
                children: [
                  Expanded(
                    child: TextFormField(
                      controller: _payRateController,
                      decoration: const InputDecoration(
                        labelText: 'Pay Rate (e.g. \$15/hr, \$400/mo)',
                        border: OutlineInputBorder(),
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: TextFormField(
                      controller: _locationController,
                      decoration: const InputDecoration(
                        labelText: 'Location / City',
                        border: OutlineInputBorder(),
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 16),

              // Provider / Employer Name & Phone
              Row(
                children: [
                  Expanded(
                    child: TextFormField(
                      controller: _providerController,
                      decoration: const InputDecoration(
                        labelText: 'Employer / Provider Name',
                        border: OutlineInputBorder(),
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: TextFormField(
                      controller: _phoneController,
                      keyboardType: TextInputType.phone,
                      decoration: const InputDecoration(
                        labelText: 'Contact Phone Number',
                        border: OutlineInputBorder(),
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 16),

              // Interview Date Selection Card
              Card(
                color: scheme.surfaceContainerHigh,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                child: Padding(
                  padding: const EdgeInsets.all(14),
                  child: Row(
                    children: [
                      const Icon(Icons.event, color: Colors.amber),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text('Interview Date (Auto-Expiry Date)', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
                            const SizedBox(height: 2),
                            Text(
                              '${_interviewDate.year}-${_interviewDate.month.toString().padLeft(2, '0')}-${_interviewDate.day.toString().padLeft(2, '0')}',
                              style: TextStyle(color: scheme.primary, fontWeight: FontWeight.bold),
                            ),
                          ],
                        ),
                      ),
                      OutlinedButton(
                        onPressed: _selectInterviewDate,
                        child: const Text('Change Date'),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 8),
              const Text(
                'Note: This advertisement will be automatically deleted/purged after the set interview date.',
                style: TextStyle(fontSize: 11, color: Colors.grey),
              ),
              const SizedBox(height: 24),

              SizedBox(
                width: double.infinity,
                height: 48,
                child: ElevatedButton.icon(
                  icon: _isSubmitting
                      ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                      : const Icon(Icons.check_circle),
                  label: const Text('Publish Advertisement', style: TextStyle(fontSize: 15, fontWeight: FontWeight.bold)),
                  onPressed: _isSubmitting ? null : _submitAd,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
